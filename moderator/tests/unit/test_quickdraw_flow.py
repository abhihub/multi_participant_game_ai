"""Tests for QuickDrawFlow — prompt generation, stop, session_ended."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from moderator.events import EventBroadcaster
from moderator.quickdraw_flow import QuickDrawFlow, DrawingPrompt
from tests.conftest import TEST_SESSION_ID

pytestmark = pytest.mark.unit


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_llm_chat_mock(json_text: str):
    async def chat(**kwargs):
        chunk = MagicMock()
        chunk.text = None
        chunk.delta = json_text
        yield chunk
    mock_llm = MagicMock()
    mock_llm.chat = chat
    return mock_llm


def _make_flow(mock_agent_session, llm_response: str | None = None):
    api = MagicMock()
    api.set_floor = AsyncMock(return_value={"ok": True})
    api.advance_round = AsyncMock(return_value={"action": "next_round", "round_index": 0})

    mock_room = MagicMock()
    mock_room.local_participant = MagicMock()
    mock_room.local_participant.publish_data = AsyncMock()
    mock_room.remote_participants = {}

    events = EventBroadcaster(mock_room, TEST_SESSION_ID)

    if llm_response is not None:
        mock_agent_session.llm = _make_llm_chat_mock(llm_response)

    flow = QuickDrawFlow(
        session=mock_agent_session,
        room=mock_room,
        api=api,
        events=events,
        session_id=TEST_SESSION_ID,
    )
    return flow, api


# ── generate_prompt ──────────────────────────────────────────────────────────

async def test_generate_prompt_parses_llm_json(mock_agent_session):
    llm_json = json.dumps({
        "prompt": "a house",
        "description": "a simple house with a roof and door",
        "difficulty_note": "common object",
    })
    flow, _ = _make_flow(mock_agent_session, llm_response=llm_json)

    prompt = await flow._generate_prompt()

    assert prompt.prompt == "a house"
    assert prompt.description == "a simple house with a roof and door"


async def test_generate_prompt_fallback(mock_agent_session):
    flow, _ = _make_flow(mock_agent_session, llm_response="not valid json!")

    prompt = await flow._generate_prompt()

    assert prompt.prompt == "a cat"
    assert "cat" in prompt.description


# ── run / stop ───────────────────────────────────────────────────────────────

async def test_run_stops_on_session_ended(mock_agent_session):
    flow, api = _make_flow(mock_agent_session, llm_response='{"prompt":"x","description":"y"}')
    api.advance_round = AsyncMock(return_value={"action": "session_ended"})

    with patch("moderator.quickdraw_flow.asyncio.sleep", new_callable=AsyncMock):
        await flow.run(num_rounds=5)

    assert api.advance_round.call_count == 1
    assert not flow._running


async def test_stop_sets_running_false(mock_agent_session):
    flow, _ = _make_flow(mock_agent_session)
    flow._running = True

    flow.stop()

    assert not flow._running
