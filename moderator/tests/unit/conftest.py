"""Unit test fixtures — mocks for Room, AgentSession, ApiClient, EventBroadcaster."""

from __future__ import annotations

import pytest
import respx
from unittest.mock import AsyncMock, MagicMock

from moderator.api_client import ApiClient
from moderator.events import EventBroadcaster
from tests.conftest import TEST_SESSION_ID


@pytest.fixture
def respx_mock():
    with respx.mock(assert_all_called=False, assert_all_mocked=True) as rspm:
        yield rspm


@pytest.fixture
def api_client(respx_mock):
    return ApiClient(
        base_url="http://testserver",
        internal_token="test-tok",
        session_admin_token="test-admin-tok",
    )


@pytest.fixture
def mock_room():
    room = MagicMock()
    room.local_participant = MagicMock()
    room.local_participant.publish_data = AsyncMock()
    room.remote_participants = {}
    room.name = "test-room-xyz"
    room.metadata = None
    return room


@pytest.fixture
def event_broadcaster(mock_room):
    return EventBroadcaster(mock_room, TEST_SESSION_ID)


@pytest.fixture
def mock_agent_session():
    session = MagicMock()
    session.say = AsyncMock()
    session.llm = MagicMock()
    return session


@pytest.fixture
def mock_rtc_session(mock_room):
    ctx = MagicMock()
    ctx.room = mock_room
    return ctx
