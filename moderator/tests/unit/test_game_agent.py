"""Tests for GameModerator — session ID resolution, STT routing."""

from __future__ import annotations

import json
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

# Patch RtcSession into livekit.agents if it doesn't exist (version compat)
import livekit.agents as _la
if not hasattr(_la, "RtcSession"):
    _la.RtcSession = type("RtcSession", (), {})

from moderator.game_agent import GameModerator
from moderator.trivia_flow import TriviaFlow

pytestmark = pytest.mark.unit


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_moderator(mock_rtc_session):
    """Create a GameModerator with mocked RtcSession."""
    moderator = GameModerator(ctx=mock_rtc_session)
    return moderator


# ── _resolve_session_id ──────────────────────────────────────────────────────

async def test_resolve_session_id_from_metadata(mock_rtc_session):
    mock_rtc_session.room.metadata = json.dumps({"session_id": "sess_x"})
    moderator = _make_moderator(mock_rtc_session)

    result = await moderator._resolve_session_id(mock_rtc_session.room)

    assert result == "sess_x"


async def test_resolve_session_id_from_room_name_prefix(mock_rtc_session):
    mock_rtc_session.room.metadata = None
    mock_rtc_session.room.name = "sess_123"
    moderator = _make_moderator(mock_rtc_session)

    result = await moderator._resolve_session_id(mock_rtc_session.room)

    assert result == "sess_123"


async def test_resolve_session_id_fallback(mock_rtc_session):
    mock_rtc_session.room.metadata = None
    mock_rtc_session.room.name = "some-room"
    moderator = _make_moderator(mock_rtc_session)

    result = await moderator._resolve_session_id(mock_rtc_session.room)

    assert result == "some-room"


# ── on_user_turn_completed ───────────────────────────────────────────────────

async def test_on_user_turn_completed_routes_to_trivia(mock_rtc_session):
    moderator = _make_moderator(mock_rtc_session)

    # Set up a mock trivia flow
    mock_trivia = MagicMock(spec=TriviaFlow)
    mock_trivia.receive_answer = MagicMock()
    moderator._trivia_flow = mock_trivia

    # Create a turn-like object
    turn = MagicMock()
    turn.text = "paris"
    turn.participant = MagicMock()
    turn.participant.identity = "player-1"

    await moderator.on_user_turn_completed(turn)

    mock_trivia.receive_answer.assert_called_once_with("player-1", "paris")


async def test_on_user_turn_completed_ignores_empty(mock_rtc_session):
    moderator = _make_moderator(mock_rtc_session)

    mock_trivia = MagicMock(spec=TriviaFlow)
    mock_trivia.receive_answer = MagicMock()
    moderator._trivia_flow = mock_trivia

    # Empty transcript
    turn = MagicMock()
    turn.text = "   "
    turn.participant = MagicMock()
    turn.participant.identity = "player-1"

    await moderator.on_user_turn_completed(turn)

    mock_trivia.receive_answer.assert_not_called()
