"""E2E test fixtures — game session lifecycle, auto-skip if services unavailable."""

from __future__ import annotations

import os

import httpx
import pytest
import pytest_asyncio

pytestmark = pytest.mark.e2e

GAME_API_URL = os.environ.get("GAME_API_URL", "http://localhost:3000")


def pytest_collection_modifyitems(config, items):
    skip_reasons = []
    if not os.environ.get("LIVEKIT_URL"):
        skip_reasons.append("LIVEKIT_URL not set")
    if not os.environ.get("OPENAI_API_KEY"):
        skip_reasons.append("OPENAI_API_KEY not set")

    # Check if game engine is reachable (sync check at collection time)
    try:
        resp = httpx.get(f"{GAME_API_URL}/health", timeout=3)
        if resp.status_code != 200:
            skip_reasons.append(f"Game Engine health check returned {resp.status_code}")
    except Exception:
        skip_reasons.append("Game Engine not reachable")

    if skip_reasons:
        reason = "E2E prerequisites missing: " + "; ".join(skip_reasons)
        skip = pytest.mark.skip(reason=reason)
        for item in items:
            if "e2e" in str(item.fspath):
                item.add_marker(skip)


@pytest_asyncio.fixture
async def http_client():
    async with httpx.AsyncClient(base_url=GAME_API_URL) as client:
        yield client


@pytest_asyncio.fixture
async def game_session(http_client: httpx.AsyncClient):
    """Create a trivia session, yield its info, then tear it down."""
    resp = await http_client.post(
        "/v1/sessions",
        json={"game": "trivia", "config": {"topic": "General Knowledge"}},
    )
    resp.raise_for_status()
    data = resp.json()
    session_id = data["session_id"]
    room_name = data["room_name"]

    yield {
        "session_id": session_id,
        "room_name": room_name,
        "data": data,
    }

    # Teardown — end the session
    try:
        await http_client.post(f"/v1/sessions/{session_id}/actions/end")
    except Exception:
        pass


@pytest_asyncio.fixture
async def player_token(http_client: httpx.AsyncClient, game_session: dict):
    """Mint a player token for the test session."""
    resp = await http_client.post(
        f"/v1/sessions/{game_session['session_id']}/token",
        json={"identity": "test-player-1", "name": "Test Player"},
    )
    resp.raise_for_status()
    return resp.json()["token"]
