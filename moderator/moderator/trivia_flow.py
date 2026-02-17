"""Trivia game loop — generates questions, listens for answers, judges them."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from livekit.agents import AgentSession

from .api_client import ApiClient
from .config import config
from .events import EventBroadcaster
from .prompts import TRIVIA_QUESTION_GENERATOR, TRIVIA_ANSWER_JUDGE

logger = logging.getLogger(__name__)


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
      8. Judge each answer via LLM
      9. Submit decisions to Game Engine API
      10. Announce results
      11. Check if game has ended
    """

    def __init__(
        self,
        session: AgentSession,
        api: ApiClient,
        events: EventBroadcaster,
        session_id: str,
        topic: str = "General Knowledge",
        difficulty: str = "medium",
    ) -> None:
        self._session = session
        self._api = api
        self._events = events
        self._session_id = session_id
        self._topic = topic
        self._difficulty = difficulty
        self._running = False
        self._current_question: TriviaQuestion | None = None
        self._pending_answers: list[PendingAnswer] = []
        self._answer_lock = asyncio.Lock()
        self._question_counter = 0

    # -- public API ------------------------------------------------------- #

    async def run(self, num_rounds: int = 10) -> None:
        """Run the trivia game loop for up to *num_rounds* rounds."""
        self._running = True
        logger.info("trivia flow starting: session=%s rounds=%d", self._session_id, num_rounds)

        await self._say("Welcome to trivia! I'll be your host today. Let's get started!")

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
            await self._say("That's all the questions! Thanks for playing!")
            self._running = False

    def stop(self) -> None:
        """Signal the flow to stop after the current round."""
        self._running = False

    def receive_answer(self, participant_identity: str, transcript: str) -> None:
        """Called when STT produces a transcription from a player.

        This is invoked from the agent's ``on_user_turn_completed`` callback.
        Thread-safe via asyncio lock (must be called from the event loop).
        """
        if self._current_question is None:
            return
        self._pending_answers.append(
            PendingAnswer(
                participant_identity=participant_identity,
                transcript=transcript,
                received_at_ms=int(time.time() * 1000),
            )
        )
        logger.debug(
            "answer received from %s: %s", participant_identity, transcript[:80]
        )

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
        except Exception:
            logger.warning("failed to set floor to moderator_only, continuing anyway")

        # 3. Speak the question
        await self._say(f"Question {round_number}: {question.question}")

        # 4. Broadcast trivia.question event
        await self._events.broadcast("trivia.question", {
            "round_id": round_id,
            "question_id": question.question_id,
            "question": question.question,
            "question_number": round_number,
        })

        # 5. Open the floor for answers
        try:
            await self._api.set_floor(self._session_id, "open", reason="answer window")
        except Exception:
            logger.warning("failed to set floor to open, continuing anyway")

        # 6. Wait for answers
        await self._say("Go ahead — shout out your answer!")
        await asyncio.sleep(config.trivia_answer_timeout_ms / 1000.0)

        # 7. Close the floor
        try:
            await self._api.set_floor(self._session_id, "moderator_only", reason="judging")
        except Exception:
            logger.warning("failed to set floor to moderator_only for judging")

        # 8. Judge answers
        self._current_question = None  # stop accepting new answers
        answers = list(self._pending_answers)
        self._pending_answers.clear()

        if not answers:
            await self._say("No one answered! The correct answer was: " + question.answer)
            await self._events.broadcast("trivia.answer.detected", {
                "round_id": round_id,
                "question_id": question.question_id,
                "winner": None,
                "correct_answer": question.answer,
            })
            return

        winner = await self._judge_answers(question, answers, round_id)

        # 9. Announce result
        if winner:
            await self._say(f"Correct! {winner} got it right! The answer is {question.answer}.")
        else:
            await self._say(f"Nobody got it this time. The answer was: {question.answer}")

        # Short pause between rounds
        await asyncio.sleep(2.0)

    async def _generate_question(self, round_id: str) -> TriviaQuestion:
        """Use the LLM to generate a trivia question."""
        self._question_counter += 1
        question_id = f"q_{self._question_counter}"

        prompt = TRIVIA_QUESTION_GENERATOR.format(
            topic=self._topic,
            difficulty=self._difficulty,
        )

        response_text = await self._llm_generate(prompt)

        try:
            data = json.loads(response_text)
            return TriviaQuestion(
                question_id=question_id,
                question=data["question"],
                answer=data["answer"],
                accept_also=data.get("accept_also", []),
                hint=data.get("hint"),
            )
        except (json.JSONDecodeError, KeyError):
            logger.warning("failed to parse LLM question response, using fallback")
            return TriviaQuestion(
                question_id=question_id,
                question="What is the capital of France?",
                answer="Paris",
                accept_also=["paris"],
            )

    async def _judge_answers(
        self,
        question: TriviaQuestion,
        answers: list[PendingAnswer],
        round_id: str,
    ) -> str | None:
        """Judge each answer and submit decisions. Returns winner identity or None."""
        winner: str | None = None
        question_start_ms = int(time.time() * 1000)

        for answer in answers:
            prompt = TRIVIA_ANSWER_JUDGE.format(
                question=question.question,
                expected_answer=question.answer,
                accept_also=", ".join(question.accept_also) if question.accept_also else "(none)",
                transcript=answer.transcript,
            )

            response_text = await self._llm_generate(prompt)
            is_correct = False
            confidence = 0.5

            try:
                data = json.loads(response_text)
                is_correct = data.get("is_correct", False)
                confidence = data.get("confidence", 0.5)
            except (json.JSONDecodeError, KeyError):
                logger.warning("failed to parse judge response for %s", answer.participant_identity)

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
                    answer_time_ms=answer.received_at_ms - question_start_ms,
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
        await self._session.say(text)

    async def _llm_generate(self, prompt: str) -> str:
        """Generate text from the LLM via the agent session.

        Uses a simple chat completion with the prompt as a user message.
        The LLM plugin is configured on the AgentSession.
        """
        # Use the session's LLM to generate a response
        llm = self._session.llm
        if llm is None:
            logger.error("no LLM configured on agent session")
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
