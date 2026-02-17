"""Tests for Config — default values, env overrides, frozen check."""

from __future__ import annotations

import dataclasses

import pytest

from moderator.config import Config

pytestmark = pytest.mark.unit


def test_default_values(monkeypatch):
    # Clear relevant env vars so defaults kick in
    for key in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET",
                "GAME_API_URL", "GAME_API_INTERNAL_TOKEN"):
        monkeypatch.delenv(key, raising=False)

    cfg = Config()

    assert cfg.livekit_url == ""
    assert cfg.livekit_api_key == ""
    assert cfg.livekit_api_secret == ""
    assert cfg.game_api_url == "http://localhost:3000"
    assert cfg.game_api_internal_token == "dev-internal-token"
    assert cfg.moderator_identity == "moderator-ai"
    assert cfg.event_topic == "game.events.v1"


def test_env_override(monkeypatch):
    monkeypatch.setenv("GAME_API_URL", "http://custom:9999")
    monkeypatch.setenv("GAME_API_INTERNAL_TOKEN", "my-secret")
    monkeypatch.setenv("LIVEKIT_URL", "wss://lk.example.com")

    cfg = Config()

    assert cfg.game_api_url == "http://custom:9999"
    assert cfg.game_api_internal_token == "my-secret"
    assert cfg.livekit_url == "wss://lk.example.com"


def test_frozen():
    cfg = Config()

    with pytest.raises(dataclasses.FrozenInstanceError):
        cfg.game_api_url = "http://nope"
