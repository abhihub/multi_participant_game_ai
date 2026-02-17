"""Async HTTP client for the Game Engine API (/internal/v1/* endpoints)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .config import config

logger = logging.getLogger(__name__)


class ApiClient:
    """Wraps all Game Engine API calls the moderator needs.

    Every request carries ``Authorization: Bearer <internal_token>``.
    """

    def __init__(
        self,
        base_url: str | None = None,
        internal_token: str | None = None,
        session_admin_token: str | None = None,
    ) -> None:
        self._base = (base_url or config.game_api_url).rstrip("/")
        self._internal_token = internal_token or config.game_api_internal_token
        self._session_admin_token = session_admin_token
        self._client = httpx.AsyncClient(
            base_url=self._base,
            timeout=httpx.Timeout(10.0, connect=5.0),
        )

    # -- helpers ---------------------------------------------------------- #

    def _internal_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._internal_token}"}

    def _admin_headers(self) -> dict[str, str]:
        token = self._session_admin_token or self._internal_token
        return {"Authorization": f"Bearer {token}"}

    async def _post(
        self, path: str, body: dict[str, Any] | None = None, *, admin: bool = False
    ) -> dict[str, Any]:
        headers = self._admin_headers() if admin else self._internal_headers()
        resp = await self._client.post(path, json=body or {}, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def _get(
        self, path: str, params: dict[str, Any] | None = None, *, admin: bool = False
    ) -> dict[str, Any]:
        headers = self._admin_headers() if admin else self._internal_headers()
        resp = await self._client.get(path, params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()

    # -- control ---------------------------------------------------------- #

    async def attach(
        self,
        session_id: str,
        room_name: str,
        moderator_token: str,
        game: str | None = None,
    ) -> dict[str, Any]:
        """Register the moderator in a session."""
        body: dict[str, Any] = {
            "livekit": {
                "room_name": room_name,
                "moderator_token": moderator_token,
            },
            "realtime": {"topic": "game.events.v1"},
        }
        if game:
            body["game"] = game
        return await self._post(f"/internal/v1/sessions/{session_id}/attach", body)

    async def detach(self, session_id: str, reason: str | None = None) -> dict[str, Any]:
        """Unregister the moderator from a session."""
        body: dict[str, Any] = {}
        if reason:
            body["reason"] = reason
        return await self._post(f"/internal/v1/sessions/{session_id}/detach", body)

    async def advance_round(
        self, session_id: str, delay_ms: int = 0
    ) -> dict[str, Any]:
        """Advance to the next round. Returns action + round_index."""
        return await self._post(
            f"/internal/v1/sessions/{session_id}/advance-round",
            {"delay_ms": delay_ms},
        )

    # -- TTS -------------------------------------------------------------- #

    async def speak(
        self,
        session_id: str,
        text: str,
        speak_mode: str = "freeform",
        language: str = "en-US",
    ) -> dict[str, Any]:
        """Queue a TTS utterance. Returns job_id + speak_id."""
        return await self._post(
            "/internal/v1/tts/speak",
            {
                "session_id": session_id,
                "text": text,
                "speak_mode": speak_mode,
                "language": language,
            },
        )

    async def get_tts_job(self, job_id: str) -> dict[str, Any]:
        """Poll a TTS job status."""
        return await self._get(f"/internal/v1/tts/jobs/{job_id}")

    # -- decisions -------------------------------------------------------- #

    async def submit_trivia_answer(
        self,
        *,
        session_id: str,
        round_id: str,
        question_id: str,
        participant_identity: str,
        transcript: str,
        is_correct: bool | None = None,
        canonical_answer: str | None = None,
        answer_time_ms: int = 0,
        normalized_answer: str | None = None,
        confidence: float = 1.0,
    ) -> dict[str, Any]:
        """Submit a trivia answer decision to the Game Engine."""
        body: dict[str, Any] = {
            "session_id": session_id,
            "round_id": round_id,
            "question_id": question_id,
            "participant_identity": participant_identity,
            "transcript": transcript,
            "answer_time_ms": answer_time_ms,
            "confidence": confidence,
        }
        if is_correct is not None:
            body["is_correct"] = is_correct
        if canonical_answer is not None:
            body["canonical_answer"] = canonical_answer
        if normalized_answer is not None:
            body["normalized_answer"] = normalized_answer
        return await self._post("/internal/v1/decisions/trivia-answer", body)

    async def submit_quickdraw_correct(
        self,
        *,
        session_id: str,
        round_id: str,
        participant_identity: str,
        frame_time_ms: int,
        confidence: float = 1.0,
        evidence: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Submit a Quick Draw correct detection to the Game Engine."""
        body: dict[str, Any] = {
            "session_id": session_id,
            "round_id": round_id,
            "participant_identity": participant_identity,
            "frame_time_ms": frame_time_ms,
            "correct": True,
            "confidence": confidence,
        }
        if evidence:
            body["evidence"] = evidence
        return await self._post("/internal/v1/decisions/quickdraw-correct", body)

    # -- vision ----------------------------------------------------------- #

    async def quickdraw_judge(
        self,
        *,
        session_id: str,
        participant_identity: str,
        prompt: str,
        image_base64: str,
        content_type: str = "image/jpeg",
    ) -> dict[str, Any]:
        """Judge a single Quick Draw frame via the vision endpoint."""
        return await self._post(
            "/internal/v1/vision/quickdraw-judge",
            {
                "session_id": session_id,
                "participant_identity": participant_identity,
                "prompt": prompt,
                "image": {
                    "bytes_base64": image_base64,
                    "content_type": content_type,
                },
            },
        )

    # -- floor control (requires session admin token) --------------------- #

    async def set_floor(
        self,
        session_id: str,
        mode: str,
        duration_ms: int | None = None,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """Set floor control mode (open, moderator_only, roles_only)."""
        body: dict[str, Any] = {"mode": mode}
        if duration_ms is not None:
            body["duration_ms"] = duration_ms
        if reason is not None:
            body["reason"] = reason
        return await self._post(
            f"/v1/sessions/{session_id}/actions/floor", body, admin=True
        )

    # -- public endpoints ------------------------------------------------- #

    async def get_snapshot(self, session_id: str) -> dict[str, Any]:
        """Get the current session snapshot (public, no auth required)."""
        return await self._get(f"/v1/sessions/{session_id}/snapshot")

    # -- lifecycle -------------------------------------------------------- #

    async def close(self) -> None:
        await self._client.aclose()
