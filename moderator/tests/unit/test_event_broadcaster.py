"""Tests for EventBroadcaster — envelope shape, sequencing, data channel."""

from __future__ import annotations

import json

import pytest

from moderator.events import EventBroadcaster
from tests.conftest import TEST_SESSION_ID

pytestmark = pytest.mark.unit


async def test_broadcast_envelope_shape(event_broadcaster: EventBroadcaster, mock_room):
    seq = await event_broadcaster.broadcast("trivia.question", {"q": "What?"})

    mock_room.local_participant.publish_data.assert_called_once()
    call_kwargs = mock_room.local_participant.publish_data.call_args
    assert call_kwargs.kwargs["topic"] == "game.events.v1"
    assert call_kwargs.kwargs["reliable"] is True

    data = json.loads(call_kwargs.kwargs["payload"])
    assert data["v"] == 1
    assert data["session_id"] == TEST_SESSION_ID
    assert data["seq"] == 1
    assert "ts_ms" in data
    assert data["type"] == "trivia.question"
    assert data["payload"] == {"q": "What?"}
    assert seq == 1


async def test_broadcast_increments_seq(event_broadcaster: EventBroadcaster, mock_room):
    await event_broadcaster.broadcast("e1", {})
    await event_broadcaster.broadcast("e2", {})

    calls = mock_room.local_participant.publish_data.call_args_list
    data1 = json.loads(calls[0].kwargs["payload"])
    data2 = json.loads(calls[1].kwargs["payload"])
    assert data1["seq"] == 1
    assert data2["seq"] == 2


async def test_broadcast_returns_seq(event_broadcaster: EventBroadcaster):
    s1 = await event_broadcaster.broadcast("e1", {})
    s2 = await event_broadcaster.broadcast("e2", {})
    assert s1 == 1
    assert s2 == 2


async def test_broadcast_payload_is_json_bytes(event_broadcaster: EventBroadcaster, mock_room):
    await event_broadcaster.broadcast("test", {"key": "val"})

    raw = mock_room.local_participant.publish_data.call_args.kwargs["payload"]
    assert isinstance(raw, bytes)
    parsed = json.loads(raw)
    assert parsed["payload"]["key"] == "val"
