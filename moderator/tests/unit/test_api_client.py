"""Tests for ApiClient HTTP methods — verifies URLs, headers, body shapes."""

from __future__ import annotations

import httpx
import pytest
import respx

from moderator.api_client import ApiClient
from tests.conftest import TEST_SESSION_ID

pytestmark = pytest.mark.unit


# ── attach ───────────────────────────────────────────────────────────────────

async def test_attach_sends_correct_payload(api_client: ApiClient, respx_mock):
    route = respx_mock.post(f"/internal/v1/sessions/{TEST_SESSION_ID}/attach").respond(
        json={"ok": True}
    )

    result = await api_client.attach(
        session_id=TEST_SESSION_ID,
        room_name="my-room",
        moderator_token="tok-abc",
    )

    assert route.called
    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer test-tok"
    body = httpx.Request("POST", request.url, content=request.content).content
    import json
    payload = json.loads(request.content)
    assert payload["livekit"]["room_name"] == "my-room"
    assert payload["livekit"]["moderator_token"] == "tok-abc"
    assert payload["realtime"]["topic"] == "game.events.v1"
    assert "game" not in payload
    assert result == {"ok": True}


async def test_attach_includes_game_when_provided(api_client: ApiClient, respx_mock):
    route = respx_mock.post(f"/internal/v1/sessions/{TEST_SESSION_ID}/attach").respond(
        json={"ok": True}
    )

    await api_client.attach(
        session_id=TEST_SESSION_ID,
        room_name="my-room",
        moderator_token="tok-abc",
        game="trivia",
    )

    import json
    payload = json.loads(route.calls.last.request.content)
    assert payload["game"] == "trivia"


# ── detach ───────────────────────────────────────────────────────────────────

async def test_detach_sends_reason(api_client: ApiClient, respx_mock):
    route = respx_mock.post(f"/internal/v1/sessions/{TEST_SESSION_ID}/detach").respond(
        json={"ok": True}
    )

    await api_client.detach(TEST_SESSION_ID, reason="leaving")

    import json
    payload = json.loads(route.calls.last.request.content)
    assert payload["reason"] == "leaving"


# ── advance_round ────────────────────────────────────────────────────────────

async def test_advance_round_sends_delay(api_client: ApiClient, respx_mock):
    route = respx_mock.post(
        f"/internal/v1/sessions/{TEST_SESSION_ID}/advance-round"
    ).respond(json={"action": "next_round", "round_index": 1})

    await api_client.advance_round(TEST_SESSION_ID)

    import json
    payload = json.loads(route.calls.last.request.content)
    assert payload == {"delay_ms": 0}


# ── speak ────────────────────────────────────────────────────────────────────

async def test_speak_sends_full_body(api_client: ApiClient, respx_mock):
    route = respx_mock.post("/internal/v1/tts/speak").respond(
        json={"job_id": "j1", "speak_id": "s1"}
    )

    await api_client.speak(TEST_SESSION_ID, "Hello world!", speak_mode="question")

    import json
    payload = json.loads(route.calls.last.request.content)
    assert payload["session_id"] == TEST_SESSION_ID
    assert payload["text"] == "Hello world!"
    assert payload["speak_mode"] == "question"
    assert payload["language"] == "en-US"


# ── submit_trivia_answer ─────────────────────────────────────────────────────

async def test_submit_trivia_answer_all_fields(api_client: ApiClient, respx_mock):
    route = respx_mock.post("/internal/v1/decisions/trivia-answer").respond(
        json={"ok": True}
    )

    await api_client.submit_trivia_answer(
        session_id=TEST_SESSION_ID,
        round_id="rnd_0",
        question_id="q_1",
        participant_identity="player-1",
        transcript="paris",
        is_correct=True,
        canonical_answer="Paris",
        answer_time_ms=1234,
        confidence=0.95,
    )

    import json
    payload = json.loads(route.calls.last.request.content)
    assert payload["session_id"] == TEST_SESSION_ID
    assert payload["round_id"] == "rnd_0"
    assert payload["question_id"] == "q_1"
    assert payload["participant_identity"] == "player-1"
    assert payload["transcript"] == "paris"
    assert payload["is_correct"] is True
    assert payload["canonical_answer"] == "Paris"
    assert payload["answer_time_ms"] == 1234
    assert payload["confidence"] == 0.95
    # normalized_answer omitted when None
    assert "normalized_answer" not in payload


# ── submit_quickdraw_correct ─────────────────────────────────────────────────

async def test_submit_quickdraw_correct_body_shape(api_client: ApiClient, respx_mock):
    route = respx_mock.post("/internal/v1/decisions/quickdraw-correct").respond(
        json={"ok": True}
    )

    await api_client.submit_quickdraw_correct(
        session_id=TEST_SESSION_ID,
        round_id="rnd_0",
        participant_identity="player-2",
        frame_time_ms=5000,
        confidence=0.88,
    )

    import json
    payload = json.loads(route.calls.last.request.content)
    assert payload["correct"] is True
    assert payload["confidence"] == 0.88
    assert payload["frame_time_ms"] == 5000


# ── quickdraw_judge ──────────────────────────────────────────────────────────

async def test_quickdraw_judge_sends_image(api_client: ApiClient, respx_mock):
    route = respx_mock.post("/internal/v1/vision/quickdraw-judge").respond(
        json={"correct": False, "confidence": 0.3}
    )

    await api_client.quickdraw_judge(
        session_id=TEST_SESSION_ID,
        participant_identity="player-1",
        prompt="a cat",
        image_base64="abc123==",
        content_type="image/png",
    )

    import json
    payload = json.loads(route.calls.last.request.content)
    assert payload["image"]["bytes_base64"] == "abc123=="
    assert payload["image"]["content_type"] == "image/png"
    assert payload["prompt"] == "a cat"


# ── set_floor ────────────────────────────────────────────────────────────────

async def test_set_floor_uses_admin_headers(api_client: ApiClient, respx_mock):
    route = respx_mock.post(f"/v1/sessions/{TEST_SESSION_ID}/actions/floor").respond(
        json={"ok": True}
    )

    await api_client.set_floor(TEST_SESSION_ID, "moderator_only", reason="asking")

    request = route.calls.last.request
    # Uses session_admin_token, NOT internal_token
    assert request.headers["Authorization"] == "Bearer test-admin-tok"


# ── get_snapshot ─────────────────────────────────────────────────────────────

async def test_get_snapshot_is_get(api_client: ApiClient, respx_mock):
    route = respx_mock.get(f"/v1/sessions/{TEST_SESSION_ID}/snapshot").respond(
        json={"game": "trivia", "state": {}}
    )

    result = await api_client.get_snapshot(TEST_SESSION_ID)

    assert route.called
    assert result["game"] == "trivia"


# ── close ────────────────────────────────────────────────────────────────────

async def test_close_closes_client(api_client: ApiClient, respx_mock):
    await api_client.close()

    assert api_client._client.is_closed


# ── error handling ───────────────────────────────────────────────────────────

async def test_http_error_raises(api_client: ApiClient, respx_mock):
    respx_mock.get(f"/v1/sessions/{TEST_SESSION_ID}/snapshot").respond(status_code=500)

    with pytest.raises(httpx.HTTPStatusError):
        await api_client.get_snapshot(TEST_SESSION_ID)
