"""Environment configuration for the moderator service."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# Load .env.local from the moderator project root
_env_path = Path(__file__).resolve().parent.parent / ".env.local"
load_dotenv(_env_path)


@dataclass(frozen=True)
class Config:
    """Immutable configuration loaded from environment variables."""

    # LiveKit (also read by the agents framework directly)
    livekit_url: str = field(default_factory=lambda: os.environ.get("LIVEKIT_URL", ""))
    livekit_api_key: str = field(default_factory=lambda: os.environ.get("LIVEKIT_API_KEY", ""))
    livekit_api_secret: str = field(default_factory=lambda: os.environ.get("LIVEKIT_API_SECRET", ""))

    # Game Engine API
    game_api_url: str = field(
        default_factory=lambda: os.environ.get("GAME_API_URL", "http://localhost:3000")
    )
    game_api_internal_token: str = field(
        default_factory=lambda: os.environ.get("GAME_API_INTERNAL_TOKEN", "dev-internal-token")
    )

    # Moderator identity
    moderator_identity: str = "moderator-ai"

    # Timing defaults (ms)
    trivia_answer_timeout_ms: int = 7_500
    quickdraw_round_duration_ms: int = 25_000
    quickdraw_sample_fps: float = 3.0

    # Data channel topic
    event_topic: str = "game.events.v1"


config = Config()
