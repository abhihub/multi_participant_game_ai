"""Trivia game loop — generates questions, listens for answers, judges them."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from livekit.agents import AgentSession
from openai import AsyncOpenAI

from .api_client import ApiClient
from .config import config
from .events import EventBroadcaster
from .prompts import TRIVIA_QUESTION_GENERATOR, TRIVIA_ANSWER_JUDGE
from .video_renderer import VideoRenderer

logger = logging.getLogger(__name__)

# Direct OpenAI client — bypasses livekit-agents LLM wrapper which does not
# reliably stream structured JSON responses in v1.4.x.
_openai = AsyncOpenAI()


@dataclass
class TriviaQuestion:
    question_id: str
    question: str
    answer: str
    accept_also: list[str] = field(default_factory=list)
    hint: str | None = None


@dataclass
class PendingAnswer:
    participant_identity: str
    transcript: str
    received_at_ms: int


class TriviaFlow:
    """Drives a trivia game session round by round.

    The flow:
      1. Advance round via API
      2. Generate a question using the LLM
      3. Set floor to moderator_only (mute players)
      4. Speak the question via TTS
      5. Broadcast trivia.question event
      6. Set floor to open (unmute players)
      7. Collect answers within the timeout window
      8. Grace window (let in-flight STT finals arrive)
      9. Judge each answer via LLM
      10. Submit decisions to Game Engine API
      11. Announce results
    """

    def __init__(
        self,
        session: AgentSession,
        api: ApiClient,
        events: EventBroadcaster,
        session_id: str,
        topic: str = "General Knowledge",
        difficulty: str = "medium",
        renderer: VideoRenderer | None = None,
    ) -> None:
        self._session = session
        self._api = api
        self._events = events
        self._session_id = session_id
        self._topic = topic
        self._difficulty = difficulty
        self._renderer = renderer
        self._running = False
        self._current_question: TriviaQuestion | None = None
        self._pending_answers: list[PendingAnswer] = []
        self._question_counter = 0
        self._asked_questions: list[str] = []
        # Gate: discard STT callbacks while bot TTS is playing
        self._is_speaking = False

    # -- public API ------------------------------------------------------- #

    async def run(self, num_rounds: int = 10) -> None:
        """Run the trivia game loop for up to *num_rounds* rounds."""
        self._running = True
        logger.info("trivia flow starting: session=%s rounds=%d", self._session_id, num_rounds)

        await self._say("Welcome to trivia! I'll be your host today. Let's get started!")

        for round_idx in range(num_rounds):
            if not self._running:
                break

            try:
                result = await self._api.advance_round(self._session_id)
            except Exception as exc:
                logger.warning("advance_round failed (%s) — treating as session ended", exc)
                break
            if result.get("action") == "session_ended":
                logger.info("session ended by API after advance_round")
                break

            round_id = f"rnd_{round_idx}"
            await self._play_round(round_id, round_idx + 1)

        if self._running:
            await self._say("That's all the questions! Thanks for playing!")
            self._running = False

        # Update HUD with final scores and winner banner
        if self._renderer:
            try:
                snapshot = await self._api.get_snapshot(self._session_id)
                participants = [
                    p for p in snapshot.get("state", {}).get("participants", [])
                    if p.get("identity") != "moderator-ai"
                ]
                if participants:
                    scores = [
                        (p.get("display_name") or p.get("displayName") or p.get("identity", "?"), p.get("score", 0))
                        for p in participants
                    ]
                    self._renderer.update_scores(scores)
                    top = max(participants, key=lambda p: p.get("score", 0))
                    winner_name = top.get("display_name") or top.get("displayName") or top.get("identity", "Unknown")
                    self._renderer.show_winner(winner_name)
                    self._renderer.trigger_confetti()
            except Exception:
                logger.warning("failed to fetch final snapshot for renderer", exc_info=True)

    def stop(self) -> None:
        """Signal the flow to stop after the current round."""
        self._running = False

    def receive_answer(self, participant_identity: str, transcript: str) -> None:
        """Called when per-participant STT produces a final transcript.

        Identity is bound at the track level — no inference needed.
        """
        if self._current_question is None:
            return
        # Discard STT callbacks that fire while the bot is speaking
        # (echo from TTS playback leaking through the room mic)
        if self._is_speaking:
            logger.debug("receive_answer: ignoring transcript during bot speech: %s", transcript[:60])
            return
        self._pending_answers.append(
            PendingAnswer(
                participant_identity=participant_identity,
                transcript=transcript,
                received_at_ms=int(time.time() * 1000),
            )
        )
        logger.info("answer queued from %s: %s", participant_identity, transcript[:80])

    # -- round logic ------------------------------------------------------ #

    async def _play_round(self, round_id: str, round_number: int) -> None:
        """Execute a single trivia round."""
        # 1. Generate question
        question = await self._generate_question(round_id)
        self._current_question = question
        self._pending_answers.clear()

        # 2. Mute players while we speak the question
        try:
            await self._api.set_floor(self._session_id, "moderator_only", reason="asking question")
            await self._events.broadcast("floor.changed", {
                "floor": {"mode": "moderator_only"},
                "changed_by": "moderator",
                "reason": "asking question",
            })
        except Exception:
            logger.warning("failed to set floor to moderator_only, continuing anyway")

        # 3. Show question on HUD then speak it
        if self._renderer:
            self._renderer.set_question(question.question)
        question_asked_at_ms = int(time.time() * 1000)
        await self._say(f"Question {round_number}: {question.question}")

        # 4. Broadcast trivia.question event
        await self._events.broadcast("trivia.question", {
            "round_id": round_id,
            "question_id": question.question_id,
            "prompt": question.question,
            "question_number": round_number,
        })

        # 5. Open the floor for answers
        try:
            await self._api.set_floor(self._session_id, "open", reason="answer window")
            await self._events.broadcast("floor.changed", {
                "floor": {"mode": "open"},
                "changed_by": "moderator",
                "reason": "answer window",
            })
        except Exception:
            logger.warning("failed to set floor to open, continuing anyway")

        # 6. Wait for answers
        await self._say("Go ahead — shout out your answer!")
        await asyncio.sleep(config.trivia_answer_timeout_ms / 1000.0)

        # 7. Close the floor (stops new speech from entering)
        try:
            await self._api.set_floor(self._session_id, "moderator_only", reason="judging")
            await self._events.broadcast("floor.changed", {
                "floor": {"mode": "moderator_only"},
                "changed_by": "moderator",
                "reason": "judging",
            })
        except Exception:
            logger.warning("failed to set floor to moderator_only for judging")

        # 8. Grace window: STT finals for in-window speech arrive ~500ms after
        #    speech ends. Without this, answers near the end of the window are
        #    silently dropped because _current_question is already None.
        await asyncio.sleep(1.5)

        # 9. Close answer gate
        self._current_question = None
        answers = list(self._pending_answers)
        self._pending_answers.clear()

        if not answers:
            await self._say("No one answered! The correct answer was: " + question.answer)
            if self._renderer:
                self._renderer.set_question("")
            await self._events.broadcast("trivia.answer.detected", {
                "round_id": round_id,
                "question_id": question.question_id,
                "winner": None,
                "correct_answer": question.answer,
            })
            return

        winner = await self._judge_answers(question, answers, round_id, question_asked_at_ms)

        # Fetch snapshot to get updated scores, then broadcast to clients and update HUD
        try:
            snapshot = await self._api.get_snapshot(self._session_id)
            participants = [
                p for p in snapshot.get("state", {}).get("participants", [])
                if p.get("identity") != "moderator-ai"
            ]
            for p in participants:
                await self._events.broadcast("score.updated", {
                    "participant_identity": p.get("identity", ""),
                    "display_name": p.get("display_name") or p.get("displayName") or p.get("identity", ""),
                    "score": p.get("score", 0),
                    "delta": 0,
                    "reason": "round_end_sync",
                })
            if self._renderer:
                scores = [
                    (p.get("display_name") or p.get("displayName") or p.get("identity", "?"), p.get("score", 0))
                    for p in participants
                ]
                self._renderer.update_scores(scores)
        except Exception:
            logger.warning("failed to sync scores after round", exc_info=True)

        # 10. Announce result
        if winner:
            await self._say(f"Correct! {winner} got it right! The answer is {question.answer}.")
        else:
            await self._say(f"Nobody got it this time. The answer was: {question.answer}")
        if self._renderer:
            self._renderer.set_question("")

        # Short pause between rounds
        await asyncio.sleep(2.0)

    async def _generate_question(self, round_id: str) -> TriviaQuestion:
        """Use the LLM to generate a trivia question."""
        self._question_counter += 1
        question_id = f"q_{self._question_counter}"

        asked = "; ".join(self._asked_questions) if self._asked_questions else "(none yet)"
        prompt = TRIVIA_QUESTION_GENERATOR.format(
            topic=self._topic,
            difficulty=self._difficulty,
            asked_questions=asked,
        )

        try:
            data = await self._llm_json(prompt)
            question = TriviaQuestion(
                question_id=question_id,
                question=data["question"],
                answer=data["answer"],
                accept_also=data.get("accept_also", []),
                hint=data.get("hint"),
            )
            self._asked_questions.append(question.question)
            logger.info("generated question: %s", question.question)
            return question
        except Exception:
            logger.error("failed to generate question — using fallback", exc_info=True)
            fallback = TriviaQuestion(
                question_id=question_id,
                question="What is the capital of France?",
                answer="Paris",
                accept_also=["paris"],
            )
            self._asked_questions.append(fallback.question)
            return fallback

    async def _judge_answers(
        self,
        question: TriviaQuestion,
        answers: list[PendingAnswer],
        round_id: str,
        question_asked_at_ms: int,
    ) -> str | None:
        """Judge each answer and submit decisions. Returns winner identity or None."""
        winner: str | None = None

        for answer in answers:
            prompt = TRIVIA_ANSWER_JUDGE.format(
                question=question.question,
                expected_answer=question.answer,
                accept_also=", ".join(question.accept_also) if question.accept_also else "(none)",
                transcript=answer.transcript,
            )

            is_correct = False
            confidence = 0.5

            try:
                data = await self._llm_json(prompt)
                is_correct = bool(data.get("is_correct", False))
                confidence = float(data.get("confidence", 0.5))
                logger.info(
                    "judged answer from %s: '%s' → %s (confidence=%.2f, rationale=%s)",
                    answer.participant_identity,
                    answer.transcript[:60],
                    "CORRECT" if is_correct else "WRONG",
                    confidence,
                    data.get("rationale", ""),
                )
            except Exception:
                logger.error(
                    "failed to judge answer from %s: '%s' — defaulting to wrong",
                    answer.participant_identity, answer.transcript[:60],
                    exc_info=True,
                )

            # Submit decision to Game Engine
            try:
                await self._api.submit_trivia_answer(
                    session_id=self._session_id,
                    round_id=round_id,
                    question_id=question.question_id,
                    participant_identity=answer.participant_identity,
                    transcript=answer.transcript,
                    is_correct=is_correct,
                    canonical_answer=question.answer,
                    answer_time_ms=max(0, answer.received_at_ms - question_asked_at_ms),
                    confidence=confidence,
                )
            except Exception:
                logger.exception("failed to submit trivia answer decision")

            if is_correct and winner is None:
                winner = answer.participant_identity

            await self._events.broadcast("trivia.answer.detected", {
                "round_id": round_id,
                "question_id": question.question_id,
                "participant_identity": answer.participant_identity,
                "is_correct": is_correct,
                "transcript": answer.transcript,
            })

        return winner

    # -- helpers ---------------------------------------------------------- #

    async def _say(self, text: str) -> None:
        """Speak text via the agent session TTS."""
        import uuid
        speak_id = str(uuid.uuid4())
        await self._events.broadcast("moderator.speak.started", {
            "speak_id": speak_id,
            "text": text,
            "mode": "tts",
        })
        self._is_speaking = True
        if self._renderer:
            self._renderer.set_speaking(True)
        try:
            await self._session.say(text)
            # Trailing buffer: audio playback + STT/VAD lag continue ~500ms
            # after the coroutine returns. Keep the gate up a bit longer.
            await asyncio.sleep(0.6)
        finally:
            self._is_speaking = False
            if self._renderer:
                self._renderer.set_speaking(False)
            await self._events.broadcast("moderator.speak.ended", {"speak_id": speak_id})

    async def _llm_json(self, prompt: str) -> dict:
        """Call OpenAI with json_mode — guaranteed JSON, no streaming assembly needed.

        Uses the direct openai SDK rather than the livekit-agents LLM wrapper,
        which does not reliably stream structured responses in v1.4.x.
        """
        resp = await _openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0,
            timeout=20,
        )
        return json.loads(resp.choices[0].message.content)
