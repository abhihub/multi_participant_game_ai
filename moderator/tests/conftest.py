"""Shared test fixtures and constants."""

from __future__ import annotations

import pytest

TEST_SESSION_ID = "sess_test_abc123"
TEST_ROOM_NAME = "test-room-xyz"


@pytest.fixture
def session_id() -> str:
    return TEST_SESSION_ID


@pytest.fixture
def room_name() -> str:
    return TEST_ROOM_NAME
