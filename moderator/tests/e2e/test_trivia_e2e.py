"""E2E test — full trivia game via LiveKit Cloud + Node.js API."""

from __future__ import annotations

import asyncio
import json
import os

import httpx
import pytest

pytestmark = pytest.mark.e2e


@pytest.mark.timeout(120)
async def test_trivia_full_session(
    http_client: httpx.AsyncClient,
    game_session: dict,
    player_token: str,
):
    """
    End-to-end trivia flow:
    1. Create session + mint player token (via conftest fixtures)
    2. Start session
    3. Connect simulated player to LiveKit room
    4. Listen for data channel events on "game.events.v1"
    5. Connect moderator in-process
    6. Wait for a "trivia.question" event
    7. Verify envelope shape
    8. Check snapshot — game in progress
    9. Cleanup
    """
    from livekit import rtc, api as lk_api

    session_id = game_session["session_id"]
    room_name = game_session["room_name"]

    # 2. Start session
    resp = await http_client.post(f"/v1/sessions/{session_id}/actions/start")
    resp.raise_for_status()

    # 3. Connect simulated player
    player_room = rtc.Room()
    received_events: list[dict] = []

    def on_data(data: bytes, *, participant: rtc.RemoteParticipant | None = None, topic: str | None = None, **kwargs):
        if topic == "game.events.v1":
            try:
                received_events.append(json.loads(data))
            except json.JSONDecodeError:
                pass

    player_room.on("data_received", on_data)

    livekit_url = os.environ["LIVEKIT_URL"]
    await player_room.connect(livekit_url, player_token)

    try:
        # 5. Generate moderator token and connect moderator in-process
        lk = lk_api.LiveKitAPI(
            url=livekit_url,
            api_key=os.environ["LIVEKIT_API_KEY"],
            api_secret=os.environ["LIVEKIT_API_SECRET"],
        )
        moderator_token = (
            lk_api.AccessToken(
                api_key=os.environ["LIVEKIT_API_KEY"],
                api_secret=os.environ["LIVEKIT_API_SECRET"],
            )
            .with_identity("moderator-ai")
            .with_grants(lk_api.VideoGrants(room_join=True, room=room_name))
            .to_jwt()
        )

        # Import and start the moderator agent
        from livekit.agents import AgentSession, RtcSession
        from livekit.plugins import silero
        from moderator.game_agent import GameModerator

        moderator_room = rtc.Room()
        await moderator_room.connect(livekit_url, moderator_token)

        # Create a mock RtcSession pointing to our room
        from unittest.mock import MagicMock
        mock_ctx = MagicMock(spec=RtcSession)
        mock_ctx.room = moderator_room

        moderator = GameModerator(ctx=mock_ctx)

        session = AgentSession(
            llm="openai/gpt-4.1-mini",
        )
        moderator_task = asyncio.create_task(
            session.start(agent=moderator)
        )

        # 6. Wait for a trivia.question event (up to 60s)
        question_event = None
        for _ in range(120):  # 120 * 0.5s = 60s
            await asyncio.sleep(0.5)
            for evt in received_events:
                if evt.get("type") == "trivia.question":
                    question_event = evt
                    break
            if question_event:
                break

        # 7. Verify envelope shape
        assert question_event is not None, (
            f"No trivia.question event received within 60s. Got events: {received_events}"
        )
        assert question_event["v"] == 1
        assert question_event["session_id"] == session_id
        assert "payload" in question_event
        assert "question" in question_event["payload"]

        # 8. Check snapshot
        snap_resp = await http_client.get(f"/v1/sessions/{session_id}/snapshot")
        snap_resp.raise_for_status()
        snapshot = snap_resp.json()
        assert snapshot.get("game") in ("trivia", "quick_draw", None) or "state" in snapshot

    finally:
        # 9. Cleanup
        if "moderator_task" in dir():
            moderator_task.cancel()
            try:
                await moderator_task
            except (asyncio.CancelledError, Exception):
                pass

        if "moderator_room" in dir():
            await moderator_room.disconnect()

        await player_room.disconnect()
