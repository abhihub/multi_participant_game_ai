"""Trivia game loop — generates questions, listens for answers, judges them."""

from __future__ import annotations

import asyncio
import json
import logging
import random
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

# ---------------------------------------------------------------------------
# Phrase pools — randomised each time to keep the host feeling natural
# ---------------------------------------------------------------------------

_WELCOME = [
    "Welcome to trivia! I'll be your host today — let's get this party started!",
    "Hey everyone, welcome to Trivia Night! I'm your host. Let's see who knows their stuff!",
    "Welcome, welcome! It's trivia time! I'm jumping straight in — are you ready?",
    "Good to have you all here! I'm your host for tonight's trivia. Let's kick things off!",
    "Alright, trivia fans — welcome! I'm your host and we are starting right now!",
]

_QUESTION_INTROS = [
    "Alright, question {n}: {q} Shout out your answer!",
    "Here we go — {q} Who's got this one?",
    "Question {n}: {q} Let me hear it!",
    "For question {n}: {q} What do you think?",
    "Here's question {n} — {q} Go for it!",
    "Ooh, this one's good — {q} Shout it out!",
    "Question {n}: {q} Come on, I know you know this!",
    "Up next — {q} Go ahead, shout your answer!",
]

_CORRECT = [
    "Yes! {name} got it! The answer is {answer}!",
    "Correct! {name} nails it — {answer}! Well done!",
    "That's right, {name}! It was {answer}! Brilliant!",
    "Absolutely! {answer} — nice work, {name}!",
    "{answer}! That's the one! Great job, {name}!",
    "Boom! {name} knew it — {answer}! Love it!",
    "Correct! Well played, {name} — {answer} it is!",
]

_NOBODY_GOT_IT = [
    "Nobody got it this time! The answer was {answer}.",
    "Ooh, tough one! Nobody got it — it was {answer}. Don't worry, more to come!",
    "No one got it — the correct answer was {answer}. Tricky, right?",
    "That stumped everyone! The answer was {answer}.",
    "Ooh so close but no cigar! It was {answer}. On to the next one!",
]

_NO_ANSWERS = [
    "Hmm, nobody answered that one! The correct answer was {answer}.",
    "Silence! The answer was {answer} — let's keep moving!",
    "No takers on that one! It was {answer}. Next question!",
]

_GAME_END = [
    "And that's a wrap! What a game — thanks for playing, everyone!",
    "That's all the questions! Incredible effort from everyone today. Thanks for playing!",
    "And we're done! That was a fantastic game — thanks so much for playing!",
    "That's trivia night in the books! Thanks for playing — you were all amazing!",
]


def _pick(options: list[str]) -> str:
    return random.choice(options)


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


@dataclass
class JudgedAnswer:
    participant_identity: str
    transcript: str
    received_at_ms: int
    is_correct: bool
    confidence: float


class TriviaFlow:
    """Drives a trivia game session round by round.

    The flow:
      1. Advance round via API
      2. Generate a question using the LLM
      3. Set floor to moderator_only (mute players)
      4. Speak the question via TTS
      5. Broadcast trivia.question event
      6. Set floor to open (unmute players)  ← _current_question set here
      7. Collect answers within the timeout window (event-based early close)
      8. Grace window (let in-flight STT finals arrive)
      9. Judge each answer via LLM (using cached early judgments where available)
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
        self._speak_lock = asyncio.Lock()
        # Early-close machinery: correct answer triggers event before timeout
        self._early_close_event: asyncio.Event = asyncio.Event()
        self._judged_answers: dict[str, JudgedAnswer] = {}  # keyed by participant_identity

    # -- public API ------------------------------------------------------- #

    async def run(self, num_rounds: int = 10) -> None:
        """Run the trivia game loop for up to *num_rounds* rounds."""
        self._running = True
        logger.info("trivia flow starting: session=%s rounds=%d", self._session_id, num_rounds)

        await self._say(_pick(_WELCOME))

        prefetched: TriviaQuestion | None = None
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
            prefetched = await self._play_round(round_id, round_idx + 1, prefetched=prefetched)

        if self._running:
            await self._say(_pick(_GAME_END))
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
            logger.info(
                "receive_answer: no active question, discarding from %s: %r",
                participant_identity, transcript[:60],
            )
            return
        # Discard STT callbacks that fire while the bot is speaking
        # (echo from TTS playback leaking through the room mic)
        if self._is_speaking:
            logger.info(
                "receive_answer: ignoring (bot speaking) from %s: %r",
                participant_identity, transcript[:60],
            )
            return
        already_answered = any(
            a.participant_identity == participant_identity
            for a in self._pending_answers
        )
        if already_answered:
            logger.info(
                "receive_answer: ignoring duplicate from %s: %r",
                participant_identity, transcript[:60],
            )
            return
        self._pending_answers.append(
            PendingAnswer(
                participant_identity=participant_identity,
                transcript=transcript,
                received_at_ms=int(time.time() * 1000),
            )
        )
        logger.info("answer queued from %s: %s", participant_identity, transcript[:80])

        # Spawn background judgment so a correct answer can close the window early
        if self._current_question is not None:
            asyncio.create_task(
                self._judge_early(participant_identity, transcript, self._current_question)
            )

    # -- round logic ------------------------------------------------------ #

    async def _play_round(
        self,
        round_id: str,
        round_number: int,
        prefetched: TriviaQuestion | None = None,
    ) -> TriviaQuestion | None:
        """Execute a single trivia round.

        Returns a pre-generated question for the next round (generated
        concurrently during the result announcement to hide LLM latency).
        """
        # 1. Use pre-fetched question if available, otherwise generate now
        if prefetched is not None:
            question = prefetched
            logger.info("using pre-fetched question: %s", question.question)
        else:
            question = await self._generate_question(round_id)

        # Reset per-round state (before _current_question is set)
        self._pending_answers.clear()
        self._judged_answers.clear()

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

        # 3. Show question on HUD, then speak question + go-ahead as one utterance
        #    (two separate _say calls create a noticeable robotic pause between them)
        if self._renderer:
            self._renderer.set_question(question.question)
        question_asked_at_ms = int(time.time() * 1000)
        await self._say(
            _pick(_QUESTION_INTROS).format(n=round_number, q=question.question)
        )

        # 4. Broadcast trivia.question event
        await self._events.broadcast("trivia.question", {
            "round_id": round_id,
            "question_id": question.question_id,
            "prompt": question.question,
            "question_number": round_number,
        })

        # 5. Set _current_question immediately before opening the floor so that
        #    any STT echo from the question reading above is still discarded
        #    (_current_question was None during TTS → receive_answer discards it).
        self._early_close_event.clear()
        self._current_question = question

        # 6. Open the floor AFTER TTS finishes so _is_speaking is already False
        try:
            await self._api.set_floor(self._session_id, "open", reason="answer window")
            await self._events.broadcast("floor.changed", {
                "floor": {"mode": "open"},
                "changed_by": "moderator",
                "reason": "answer window",
            })
        except Exception:
            logger.warning("failed to set floor to open, continuing anyway")

        # 7. Wait for answers — exits early if a correct answer arrives
        try:
            await asyncio.wait_for(
                self._early_close_event.wait(),
                timeout=config.trivia_answer_timeout_ms / 1000.0,
            )
            logger.info("answer window: early close triggered by correct answer")
        except asyncio.TimeoutError:
            logger.info("answer window: timeout elapsed")

        # 8. Close the floor (stops new speech from entering)
        try:
            await self._api.set_floor(self._session_id, "moderator_only", reason="judging")
            await self._events.broadcast("floor.changed", {
                "floor": {"mode": "moderator_only"},
                "changed_by": "moderator",
                "reason": "judging",
            })
        except Exception:
            logger.warning("failed to set floor to moderator_only for judging")

        # 9. Grace window: STT finals for in-window speech arrive ~500ms after
        #    speech ends. Without this, answers near the end of the window are
        #    silently dropped because _current_question is already None.
        await asyncio.sleep(1.5)

        # 10. Close answer gate
        self._current_question = None
        answers = list(self._pending_answers)
        self._pending_answers.clear()
        logger.info("answer window closed: %d answer(s) collected", len(answers))

        # Start pre-generating the next question NOW, concurrently with the
        # result announcement, so the LLM latency is hidden inside the TTS time.
        prefetch_task: asyncio.Task[TriviaQuestion] | None = None
        if self._running:
            prefetch_task = asyncio.create_task(self._generate_question("prefetch"))

        if not answers:
            await self._say(_pick(_NO_ANSWERS).format(answer=question.answer))
            if self._renderer:
                self._renderer.set_question("")
            await self._events.broadcast("trivia.answer.detected", {
                "round_id": round_id,
                "question_id": question.question_id,
                "winner": None,
                "correct_answer": question.answer,
            })
        else:
            winner = await self._judge_answers(question, answers, round_id, question_asked_at_ms)

            # Fetch snapshot to get updated scores, then broadcast to clients and update HUD
            winner_name_map: dict[str, str] = {}
            try:
                snapshot = await self._api.get_snapshot(self._session_id)
                participants = [
                    p for p in snapshot.get("state", {}).get("participants", [])
                    if p.get("identity") != "moderator-ai"
                ]
                winner_name_map = {
                    p.get("identity", ""): (
                        p.get("display_name") or p.get("displayName") or p.get("identity", "?")
                    )
                    for p in participants
                }
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

            # 11. Announce result
            if winner:
                winner_display = winner_name_map.get(winner, winner)
                await self._say(_pick(_CORRECT).format(name=winner_display, answer=question.answer))
            else:
                await self._say(_pick(_NOBODY_GOT_IT).format(answer=question.answer))
            if self._renderer:
                self._renderer.set_question("")

        # Short pause then hand back the pre-fetched question.
        # If LLM finished during the announcement it returns instantly; otherwise
        # the await here extends the gap slightly but stays < 1s in practice.
        await asyncio.sleep(0.5)
        if prefetch_task is not None:
            try:
                return await prefetch_task
            except Exception:
                logger.warning("pre-fetch of next question failed", exc_info=True)
        return None

    async def _generate_question(self, round_id: str) -> TriviaQuestion:
        """Use the LLM to generate a trivia question."""
        self._question_counter += 1
        question_id = f"q_{self._question_counter}"

        asked = "; ".join(self._asked_questions) if self._asked_questions else "(none yet)"
        prompt = TRIVIA_QUESTION_GENERATOR.format(
            topic=self._topic,
            difficulty=self._difficulty,
            asked_questions=asked,
            seed=random.randint(1, 999999),
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

    async def _judge_answer(
        self,
        participant_identity: str,
        transcript: str,
        question: TriviaQuestion,
    ) -> JudgedAnswer:
        """Call the LLM to judge a single answer. Returns a JudgedAnswer."""
        prompt = TRIVIA_ANSWER_JUDGE.format(
            question=question.question,
            expected_answer=question.answer,
            accept_also=", ".join(question.accept_also) if question.accept_also else "(none)",
            transcript=transcript,
        )
        is_correct = False
        confidence = 0.5
        try:
            data = await self._llm_json(prompt, temperature=0)
            is_correct = bool(data.get("is_correct", False))
            confidence = float(data.get("confidence", 0.5))
            logger.info(
                "judged answer from %s: '%s' → %s (confidence=%.2f, rationale=%s)",
                participant_identity,
                transcript[:60],
                "CORRECT" if is_correct else "WRONG",
                confidence,
                data.get("rationale", ""),
            )
        except Exception:
            logger.error(
                "failed to judge answer from %s: '%s' — defaulting to wrong",
                participant_identity, transcript[:60],
                exc_info=True,
            )
        return JudgedAnswer(
            participant_identity=participant_identity,
            transcript=transcript,
            received_at_ms=int(time.time() * 1000),
            is_correct=is_correct,
            confidence=confidence,
        )

    async def _judge_early(
        self,
        participant_identity: str,
        transcript: str,
        question: TriviaQuestion,
    ) -> None:
        """Judge an answer immediately as it arrives; signal early close if correct."""
        try:
            judged = await self._judge_answer(participant_identity, transcript, question)
            self._judged_answers[participant_identity] = judged
            if judged.is_correct:
                self._early_close_event.set()
        except Exception:
            logger.warning("early judgment failed for %s", participant_identity, exc_info=True)

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
            # Use cached judgment from background early-judge task if available
            if answer.participant_identity in self._judged_answers:
                judged = self._judged_answers[answer.participant_identity]
                logger.info(
                    "using cached judgment for %s: %s",
                    answer.participant_identity,
                    "CORRECT" if judged.is_correct else "WRONG",
                )
                is_correct = judged.is_correct
                confidence = judged.confidence
            else:
                judged = await self._judge_answer(
                    answer.participant_identity, answer.transcript, question
                )
                is_correct = judged.is_correct
                confidence = judged.confidence

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

            logger.info(
                "broadcasting trivia.answer.detected: participant=%s is_correct=%s transcript=%r",
                answer.participant_identity, is_correct, answer.transcript[:60],
            )
            await self._events.broadcast("trivia.answer.detected", {
                "round_id": round_id,
                "question_id": question.question_id,
                "participant_identity": answer.participant_identity,
                "is_correct": is_correct,
                "transcript": answer.transcript,
            })

        self._judged_answers.clear()
        return winner

    # -- helpers ---------------------------------------------------------- #

    async def _say(self, text: str) -> None:
        """Speak text via the agent session TTS."""
        import uuid
        async with self._speak_lock:
            speak_id = str(uuid.uuid4())
            end_status = "completed"
            await self._events.broadcast("moderator.speak.started", {
                "speak_id": speak_id,
                "text": text,
                "mode": "tts",
            })
            self._is_speaking = True
            if self._renderer:
                self._renderer.set_speaking(True)
            try:
                logger.info("TTS say: %r", text)
                last_err: Exception | None = None
                for attempt in range(2):
                    try:
                        await self._session.say(text)
                        # Trailing buffer: audio playback + STT/VAD lag continue ~500ms
                        # after the coroutine returns. Keep the gate up a bit longer.
                        await asyncio.sleep(0.6)
                        logger.info("TTS done")
                        last_err = None
                        break
                    except RuntimeError as exc:
                        last_err = exc
                        if attempt == 0:
                            logger.warning("TTS interrupted, retrying once: %s", exc)
                            await asyncio.sleep(0.2)
                        else:
                            logger.warning("TTS failed after retry: %s", exc)
                if last_err is not None:
                    end_status = "failed"
                    return
            finally:
                self._is_speaking = False
                if self._renderer:
                    self._renderer.set_speaking(False)
                await self._events.broadcast("moderator.speak.ended", {
                    "speak_id": speak_id,
                    "status": end_status,
                })

    async def _llm_json(self, prompt: str, temperature: float = 0.7) -> dict:
        """Call OpenAI with json_mode — guaranteed JSON, no streaming assembly needed.

        Uses the direct openai SDK rather than the livekit-agents LLM wrapper,
        which does not reliably stream structured responses in v1.4.x.
        """
        resp = await _openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=temperature,
            timeout=20,
        )
        return json.loads(resp.choices[0].message.content)
