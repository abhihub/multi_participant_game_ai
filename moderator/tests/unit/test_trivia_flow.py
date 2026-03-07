"""Tests for TriviaFlow — question generation, answer judging, round flow."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from moderator.events import EventBroadcaster
from moderator.trivia_flow import TriviaFlow, TriviaQuestion, PendingAnswer
from tests.conftest import TEST_SESSION_ID

pytestmark = pytest.mark.unit


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_llm_chat_mock(json_text: str):
    """Return an async generator that yields a single chunk with .delta = json_text."""
    async def chat(**kwargs):
        chunk = MagicMock()
        chunk.text = None
        chunk.delta = json_text
        yield chunk
    mock_llm = MagicMock()
    mock_llm.chat = chat
    return mock_llm


def _make_flow(mock_audio, llm_response: str | None = None):
    """Build a TriviaFlow with mocked dependencies."""
    api = MagicMock()
    api.set_floor = AsyncMock(return_value={"ok": True})
    api.advance_round = AsyncMock(return_value={"action": "next_round", "round_index": 0})
    api.submit_trivia_answer = AsyncMock(return_value={"ok": True})

    mock_room = MagicMock()
    mock_room.local_participant = MagicMock()
    mock_room.local_participant.publish_data = AsyncMock()
    events = EventBroadcaster(mock_room, TEST_SESSION_ID)

    flow = TriviaFlow(
        audio=mock_audio,
        api=api,
        events=events,
        session_id=TEST_SESSION_ID,
    )
    return flow, api, events


# ── receive_answer ───────────────────────────────────────────────────────────

async def test_receive_answer_collects_when_question_active(mock_audio):
    flow, api, _ = _make_flow(mock_audio)
    flow._current_question = TriviaQuestion(
        question_id="q_1", question="Capital of France?", answer="Paris"
    )

    flow.receive_answer("player-1", "paris")

    assert len(flow._pending_answers) == 1
    assert flow._pending_answers[0].participant_identity == "player-1"
    assert flow._pending_answers[0].transcript == "paris"


async def test_receive_answer_ignores_when_no_question(mock_audio):
    flow, api, _ = _make_flow(mock_audio)
    assert flow._current_question is None

    flow.receive_answer("player-1", "paris")

    assert len(flow._pending_answers) == 0


# ── generate_question ────────────────────────────────────────────────────────

async def test_generate_question_parses_llm_json(mock_audio):
    llm_json = json.dumps({
        "question": "What is the largest planet?",
        "answer": "Jupiter",
        "accept_also": ["jupiter"],
        "hint": "It's a gas giant.",
    })
    flow, _, _ = _make_flow(mock_audio, llm_response=llm_json)

    q = await flow._generate_question("rnd_0")

    assert q.question == "What is the largest planet?"
    assert q.answer == "Jupiter"
    assert q.accept_also == ["jupiter"]
    assert q.hint == "It's a gas giant."
    assert q.question_id == "q_1"


async def test_generate_question_fallback_on_bad_json(mock_audio):
    flow, _, _ = _make_flow(mock_audio, llm_response="not json at all {{{")

    q = await flow._generate_question("rnd_0")

    assert q.question == "What is the capital of France?"
    assert q.answer == "Paris"


# ── judge_answers ────────────────────────────────────────────────────────────

async def test_judge_answers_correct(mock_audio):
    llm_json = json.dumps({"is_correct": True, "confidence": 0.95, "rationale": "exact match"})
    flow, api, _ = _make_flow(mock_audio, llm_response=llm_json)

    question = TriviaQuestion(question_id="q_1", question="Capital of France?", answer="Paris")
    answers = [PendingAnswer(participant_identity="player-1", transcript="paris", received_at_ms=1000)]

    winner = await flow._judge_answers(question, answers, "rnd_0")

    assert winner == "player-1"
    api.submit_trivia_answer.assert_called_once()
    call_kwargs = api.submit_trivia_answer.call_args.kwargs
    assert call_kwargs["is_correct"] is True


async def test_judge_answers_incorrect(mock_audio):
    llm_json = json.dumps({"is_correct": False, "confidence": 0.9, "rationale": "wrong"})
    flow, api, _ = _make_flow(mock_audio, llm_response=llm_json)

    question = TriviaQuestion(question_id="q_1", question="Capital of France?", answer="Paris")
    answers = [PendingAnswer(participant_identity="player-1", transcript="london", received_at_ms=1000)]

    winner = await flow._judge_answers(question, answers, "rnd_0")

    assert winner is None


async def test_judge_answers_bad_json(mock_audio):
    flow, api, _ = _make_flow(mock_audio, llm_response="garbage {{")

    question = TriviaQuestion(question_id="q_1", question="Capital of France?", answer="Paris")
    answers = [PendingAnswer(participant_identity="player-1", transcript="paris", received_at_ms=1000)]

    winner = await flow._judge_answers(question, answers, "rnd_0")

    # Bad JSON defaults to is_correct=False, confidence=0.5
    assert winner is None
    call_kwargs = api.submit_trivia_answer.call_args.kwargs
    assert call_kwargs["is_correct"] is False
    assert call_kwargs["confidence"] == 0.5


# ── play_round floor sequence ───────────────────────────────────────────────

async def test_play_round_floor_sequence(mock_audio):
    llm_json = json.dumps({"question": "Q?", "answer": "A"})
    flow, api, _ = _make_flow(mock_audio, llm_response=llm_json)

    with patch("moderator.trivia_flow.asyncio.sleep", new_callable=AsyncMock):
        await flow._play_round("rnd_0", 1)

    # set_floor called: moderator_only (asking), open (answer window), moderator_only (judging)
    floor_calls = api.set_floor.call_args_list
    assert len(floor_calls) == 3
    assert floor_calls[0].args == (TEST_SESSION_ID, "moderator_only")
    assert floor_calls[1].args == (TEST_SESSION_ID, "open")
    assert floor_calls[2].args == (TEST_SESSION_ID, "moderator_only")


# ── run / stop ───────────────────────────────────────────────────────────────

async def test_run_stops_on_session_ended(mock_audio):
    flow, api, _ = _make_flow(mock_audio, llm_response='{"question":"Q","answer":"A"}')
    api.advance_round = AsyncMock(return_value={"action": "session_ended"})

    with patch("moderator.trivia_flow.asyncio.sleep", new_callable=AsyncMock):
        await flow.run(num_rounds=5)

    # advance_round called once, then loop exits
    assert api.advance_round.call_count == 1
    assert not flow._running


async def test_stop_sets_running_false(mock_audio):
    flow, _, _ = _make_flow(mock_audio)
    flow._running = True

    flow.stop()

    assert not flow._running
