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

def _make_openai_mock(json_text: str):
    """Return an AsyncMock for _openai.chat.completions.create returning json_text."""
    msg = MagicMock()
    msg.content = json_text
    choice = MagicMock()
    choice.message = msg
    response = MagicMock()
    response.choices = [choice]
    mock_create = AsyncMock(return_value=response)
    return mock_create


def _make_flow(mock_audio):
    api = MagicMock()
    api.set_floor = AsyncMock(return_value={"ok": True})
    api.advance_round = AsyncMock(return_value={"action": "next_round", "round_index": 0})

    mock_room = MagicMock()
    mock_room.local_participant = MagicMock()
    mock_room.local_participant.publish_data = AsyncMock()
    mock_room.remote_participants = {}

    events = EventBroadcaster(mock_room, TEST_SESSION_ID)

    flow = QuickDrawFlow(
        audio=mock_audio,
        room=mock_room,
        api=api,
        events=events,
        session_id=TEST_SESSION_ID,
    )
    return flow, api


# ── generate_prompt ──────────────────────────────────────────────────────────

async def test_generate_prompt_parses_llm_json(mock_audio):
    llm_json = json.dumps({
        "prompt": "a house",
        "description": "a simple house with a roof and door",
        "difficulty_note": "common object",
    })
    flow, _ = _make_flow(mock_audio)

    with patch("moderator.quickdraw_flow._openai") as mock_openai:
        mock_openai.chat = MagicMock()
        mock_openai.chat.completions = MagicMock()
        mock_openai.chat.completions.create = _make_openai_mock(llm_json)
        prompt = await flow._generate_prompt()

    assert prompt.prompt == "a house"
    assert prompt.description == "a simple house with a roof and door"


async def test_generate_prompt_fallback(mock_audio):
    flow, _ = _make_flow(mock_audio)

    with patch("moderator.quickdraw_flow._openai") as mock_openai:
        mock_openai.chat = MagicMock()
        mock_openai.chat.completions = MagicMock()
        mock_openai.chat.completions.create = _make_openai_mock("not valid json!")
        prompt = await flow._generate_prompt()

    assert prompt.prompt == "a cat"
    assert "cat" in prompt.description


# ── run / stop ───────────────────────────────────────────────────────────────

async def test_run_stops_on_session_ended(mock_audio):
    flow, api = _make_flow(mock_audio)
    api.advance_round = AsyncMock(return_value={"action": "session_ended"})

    with patch("moderator.quickdraw_flow.asyncio.sleep", new_callable=AsyncMock):
        await flow.run(num_rounds=5)

    assert api.advance_round.call_count == 1
    assert not flow._running


async def test_stop_sets_running_false(mock_audio):
    flow, _ = _make_flow(mock_audio)
    flow._running = True

    flow.stop()

    assert not flow._running
