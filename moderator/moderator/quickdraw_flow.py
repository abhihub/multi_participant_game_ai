"""Quick Draw game loop — prompts drawings, analyzes video frames, judges them."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from dataclasses import dataclass

from livekit import rtc
from livekit.agents import AgentSession

from .api_client import ApiClient
from .config import config
from .events import EventBroadcaster
from .prompts import QUICKDRAW_PROMPT_GENERATOR

logger = logging.getLogger(__name__)


@dataclass
class DrawingPrompt:
    prompt: str
    description: str


class QuickDrawFlow:
    """Drives a Quick Draw game session round by round.

    The flow per round:
      1. Advance round via API
      2. Generate a drawing prompt using the LLM
      3. Speak the prompt via TTS
      4. Broadcast quickdraw.prompt event
      5. Subscribe to player video tracks
      6. Sample frames and send to vision endpoint for judging
      7. When a correct detection occurs, submit to API
      8. Announce winner or timeout
    """

    def __init__(
        self,
        session: AgentSession,
        room: rtc.Room,
        api: ApiClient,
        events: EventBroadcaster,
        session_id: str,
        category: str = "objects",
        difficulty: str = "medium",
    ) -> None:
        self._session = session
        self._room = room
        self._api = api
        self._events = events
        self._session_id = session_id
        self._category = category
        self._difficulty = difficulty
        self._running = False
        self._round_winner: str | None = None
        self._prompt_counter = 0

    # -- public API ------------------------------------------------------- #

    async def run(self, num_rounds: int = 5) -> None:
        """Run the Quick Draw game loop for up to *num_rounds* rounds."""
        self._running = True
        logger.info("quickdraw flow starting: session=%s rounds=%d", self._session_id, num_rounds)

        await self._say("Welcome to Quick Draw! I'll give you something to draw, and you hold up your paper. Let's go!")

        for round_idx in range(num_rounds):
            if not self._running:
                break

            result = await self._api.advance_round(self._session_id)
            if result.get("action") == "session_ended":
                logger.info("session ended by API after advance_round")
                break

            round_id = f"rnd_{round_idx}"
            await self._play_round(round_id, round_idx + 1)

        if self._running:
            await self._say("That's the last round! Thanks for drawing with me!")
            self._running = False

    def stop(self) -> None:
        self._running = False

    # -- round logic ------------------------------------------------------ #

    async def _play_round(self, round_id: str, round_number: int) -> None:
        """Execute a single Quick Draw round."""
        self._round_winner = None

        # 1. Generate prompt
        prompt = await self._generate_prompt()

        # 2. Speak the prompt
        await self._say(f"Round {round_number}! Draw... {prompt.prompt}!")

        # 3. Broadcast event
        await self._events.broadcast("quickdraw.prompt", {
            "round_id": round_id,
            "prompt": prompt.prompt,
            "description": prompt.description,
            "round_number": round_number,
            "duration_ms": config.quickdraw_round_duration_ms,
        })

        # 4. Start sampling video frames and judging
        round_duration_s = config.quickdraw_round_duration_ms / 1000.0
        sample_interval = 1.0 / config.quickdraw_sample_fps

        deadline = time.monotonic() + round_duration_s
        tasks: list[asyncio.Task[None]] = []

        while time.monotonic() < deadline and self._round_winner is None and self._running:
            # Sample one frame from each player's video track
            for participant in self._room.remote_participants.values():
                if self._round_winner is not None:
                    break
                for pub in participant.track_publications.values():
                    if pub.kind != rtc.TrackKind.KIND_VIDEO:
                        continue
                    if pub.track is None:
                        continue
                    task = asyncio.create_task(
                        self._judge_frame(
                            participant_identity=participant.identity,
                            track=pub.track,
                            prompt=prompt,
                            round_id=round_id,
                        )
                    )
                    tasks.append(task)

            await asyncio.sleep(sample_interval)

        # Cancel outstanding tasks
        for t in tasks:
            if not t.done():
                t.cancel()

        # 5. Announce result
        if self._round_winner:
            await self._say(f"{self._round_winner} drew it correctly! Great job!")
            await self._events.broadcast("quickdraw.correct.detected", {
                "round_id": round_id,
                "participant_identity": self._round_winner,
                "prompt": prompt.prompt,
            })
        else:
            await self._say("Time's up! Nobody got it this round.")

        await asyncio.sleep(2.0)

    async def _judge_frame(
        self,
        participant_identity: str,
        track: rtc.Track,
        prompt: DrawingPrompt,
        round_id: str,
    ) -> None:
        """Capture a single frame and judge it via the vision API."""
        if self._round_winner is not None:
            return

        try:
            # Get a video frame from the track
            video_stream = rtc.VideoStream(track)
            frame_event = await asyncio.wait_for(
                video_stream.__aiter__().__anext__(), timeout=2.0
            )
            await video_stream.aclose()

            # Convert frame to JPEG bytes
            frame = frame_event.frame
            jpeg_bytes = frame.to_argb().data  # raw ARGB data
            frame_b64 = base64.b64encode(jpeg_bytes).encode("utf-8").decode("ascii")

            # Call vision API to judge
            result = await self._api.quickdraw_judge(
                session_id=self._session_id,
                participant_identity=participant_identity,
                prompt=prompt.description,
                image_base64=frame_b64,
            )

            if result.get("correct") and result.get("confidence", 0) > 0.6:
                if self._round_winner is None:
                    self._round_winner = participant_identity
                    frame_time_ms = int(time.time() * 1000)

                    await self._api.submit_quickdraw_correct(
                        session_id=self._session_id,
                        round_id=round_id,
                        participant_identity=participant_identity,
                        frame_time_ms=frame_time_ms,
                        confidence=result["confidence"],
                    )

        except asyncio.TimeoutError:
            pass
        except Exception:
            logger.debug("frame judge failed for %s", participant_identity, exc_info=True)

    async def _generate_prompt(self) -> DrawingPrompt:
        """Use the LLM to generate a drawing prompt."""
        self._prompt_counter += 1

        llm_prompt = QUICKDRAW_PROMPT_GENERATOR.format(
            category=self._category,
            difficulty=self._difficulty,
        )

        response_text = await self._llm_generate(llm_prompt)

        try:
            data = json.loads(response_text)
            return DrawingPrompt(
                prompt=data["prompt"],
                description=data.get("description", data["prompt"]),
            )
        except (json.JSONDecodeError, KeyError):
            logger.warning("failed to parse LLM prompt response, using fallback")
            return DrawingPrompt(prompt="a cat", description="a simple drawing of a cat")

    # -- helpers ---------------------------------------------------------- #

    async def _say(self, text: str) -> None:
        await self._session.say(text)

    async def _llm_generate(self, prompt: str) -> str:
        llm = self._session.llm
        if llm is None:
            return "{}"

        response_parts: list[str] = []
        async for chunk in llm.chat(
            chat_ctx=[
                {"role": "user", "content": prompt},
            ],
        ):
            if hasattr(chunk, "text") and chunk.text:
                response_parts.append(chunk.text)
            elif hasattr(chunk, "delta") and chunk.delta:
                response_parts.append(chunk.delta)

        return "".join(response_parts)
