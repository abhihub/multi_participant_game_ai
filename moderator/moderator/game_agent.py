"""Main Agent class — orchestrates game flow based on session type."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from livekit import rtc
from livekit.agents import Agent, AgentSession, RtcSession

from .api_client import ApiClient
from .config import config
from .events import EventBroadcaster
from .prompts import TRIVIA_MODERATOR, QUICKDRAW_MODERATOR
from .trivia_flow import TriviaFlow
from .quickdraw_flow import QuickDrawFlow
from .video_renderer import VideoRenderer

logger = logging.getLogger(__name__)


class GameModerator(Agent):
    """LiveKit Agent that moderates multiplayer game sessions.

    On room join it:
      1. Attaches to the Game Engine API
      2. Reads the session snapshot to determine game type
      3. Starts the appropriate game flow (trivia or quickdraw)

    On disconnect it detaches from the API.
    """

    def __init__(self, ctx: RtcSession) -> None:
        super().__init__(instructions=TRIVIA_MODERATOR)
        self._ctx = ctx
        self._api = ApiClient()
        self._session_id: str | None = None
        self._game_type: str | None = None
        self._events: EventBroadcaster | None = None
        self._flow_task: asyncio.Task[None] | None = None
        self._trivia_flow: TriviaFlow | None = None
        self._quickdraw_flow: QuickDrawFlow | None = None
        self._renderer: VideoRenderer | None = None

    # -- lifecycle -------------------------------------------------------- #

    async def on_enter(self) -> None:
        """Called when the agent starts in the room."""
        room = self._ctx.room
        room_name = room.name or "unknown"
        logger.info("moderator joined room: %s", room_name)

        # Determine session_id from room metadata or room name
        session_id = await self._resolve_session_id(room)
        self._session_id = session_id

        # Attach to the Game Engine API
        try:
            attach_result = await self._api.attach(
                session_id=session_id,
                room_name=room_name,
                moderator_token="",  # token already used to join
            )
            logger.info(
                "attached to session %s as %s",
                session_id,
                attach_result.get("moderator_identity"),
            )
        except Exception:
            logger.exception("failed to attach to session %s", session_id)
            return

        # Set up event broadcaster
        self._events = EventBroadcaster(room, session_id)

        # Create and publish the canvas video HUD track
        self._renderer = VideoRenderer()
        await self._renderer.start()
        try:
            await self._ctx.room.local_participant.publish_track(
                self._renderer.track,
                rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_CAMERA),
            )
            logger.info("video HUD track published")
        except Exception:
            logger.warning("failed to publish video HUD track", exc_info=True)

        # Get session snapshot to know game type + config
        try:
            snapshot = await self._api.get_snapshot(session_id)
            self._game_type = snapshot.get("game", "trivia")
            logger.info("session game type: %s", self._game_type)
        except Exception:
            logger.warning("failed to get snapshot, defaulting to trivia")
            self._game_type = "trivia"

        # Update instructions based on game type
        if self._game_type == "quick_draw":
            self.instructions = QUICKDRAW_MODERATOR

        # Start the game flow
        self._flow_task = asyncio.create_task(self._run_game_flow(snapshot))

    async def on_exit(self) -> None:
        """Called when the agent is leaving the room."""
        # Stop video renderer first
        if self._renderer:
            await self._renderer.stop()

        # Stop any running flow
        if self._trivia_flow:
            self._trivia_flow.stop()
        if self._quickdraw_flow:
            self._quickdraw_flow.stop()

        if self._flow_task and not self._flow_task.done():
            self._flow_task.cancel()
            try:
                await self._flow_task
            except asyncio.CancelledError:
                pass

        # Detach from the Game Engine
        if self._session_id:
            try:
                await self._api.detach(self._session_id, reason="agent disconnecting")
                logger.info("detached from session %s", self._session_id)
            except Exception:
                logger.exception("failed to detach from session %s", self._session_id)

        await self._api.close()

    # -- STT callback ----------------------------------------------------- #

    async def on_user_turn_completed(self, turn: Any) -> None:
        """Called when STT finishes transcribing a player utterance.

        Routes the transcript to the active trivia flow for answer processing.
        """
        transcript = ""
        participant_identity = "unknown"

        # Extract transcript text from the turn object
        if hasattr(turn, "text"):
            transcript = turn.text
        elif hasattr(turn, "transcript"):
            transcript = turn.transcript
        elif isinstance(turn, str):
            transcript = turn

        # Try to get participant identity
        if hasattr(turn, "participant") and turn.participant:
            participant_identity = getattr(turn.participant, "identity", "unknown")

        if not transcript.strip():
            return

        logger.debug("user turn: %s said '%s'", participant_identity, transcript[:80])

        # Route to trivia flow if active
        if self._trivia_flow:
            self._trivia_flow.receive_answer(participant_identity, transcript)

    # -- game flow -------------------------------------------------------- #

    async def _run_game_flow(self, snapshot: dict[str, Any] | None = None) -> None:
        """Start and run the appropriate game flow."""
        if not self._session_id or not self._events:
            return

        session = self.session
        if session is None:
            logger.error("no agent session available")
            return

        # Extract config from snapshot
        topic = "General Knowledge"
        difficulty = "medium"
        category = "objects"

        if snapshot and "state" in snapshot:
            state = snapshot["state"]
            if "trivia" in state:
                topic = state["trivia"].get("topic", topic)
                difficulty = state["trivia"].get("difficulty", difficulty)
            if "quickdraw" in state:
                category = state["quickdraw"].get("category", category) or category
                difficulty = state["quickdraw"].get("difficulty", difficulty)

        try:
            if self._game_type == "quick_draw":
                self._quickdraw_flow = QuickDrawFlow(
                    session=session,
                    room=self._ctx.room,
                    api=self._api,
                    events=self._events,
                    session_id=self._session_id,
                    category=category,
                    difficulty=difficulty,
                    renderer=self._renderer,
                )
                await self._quickdraw_flow.run()
            else:
                self._trivia_flow = TriviaFlow(
                    session=session,
                    api=self._api,
                    events=self._events,
                    session_id=self._session_id,
                    topic=topic,
                    difficulty=difficulty,
                    renderer=self._renderer,
                )
                await self._trivia_flow.run()
        except asyncio.CancelledError:
            logger.info("game flow cancelled")
        except Exception:
            logger.exception("game flow error")

    # -- helpers ---------------------------------------------------------- #

    async def _resolve_session_id(self, room: rtc.Room) -> str:
        """Extract session_id from room metadata or derive from room name.

        The Game Engine API creates rooms with names like ``sess_<id>`` or
        stores the session_id in the room's metadata JSON.
        """
        # Try room metadata first
        if room.metadata:
            try:
                import json
                meta = json.loads(room.metadata)
                if "session_id" in meta:
                    return meta["session_id"]
            except (ValueError, TypeError):
                pass

        # Fall back to room name (which may be the session_id)
        room_name = room.name or ""
        if room_name.startswith("sess_"):
            return room_name

        # Last resort: use room name as-is
        return room_name
