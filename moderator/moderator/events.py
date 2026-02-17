"""Data channel event broadcasting to all room participants."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from livekit import rtc

from .config import config

logger = logging.getLogger(__name__)


class EventBroadcaster:
    """Broadcasts typed game event envelopes over the LiveKit data channel."""

    def __init__(self, room: rtc.Room, session_id: str) -> None:
        self._room = room
        self._session_id = session_id
        self._seq = 0

    async def broadcast(self, event_type: str, payload: dict[str, Any]) -> int:
        """Publish a game event to all participants.

        Returns the sequence number of the emitted event.
        """
        self._seq += 1
        envelope = {
            "v": 1,
            "session_id": self._session_id,
            "seq": self._seq,
            "ts_ms": int(time.time() * 1000),
            "type": event_type,
            "payload": payload,
        }
        data = json.dumps(envelope).encode("utf-8")
        await self._room.local_participant.publish_data(
            payload=data,
            reliable=True,
            topic=config.event_topic,
        )
        logger.debug("broadcast event seq=%d type=%s", self._seq, event_type)
        return self._seq
