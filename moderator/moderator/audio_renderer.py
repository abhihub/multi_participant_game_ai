"""Direct audio synthesis and playback via Cartesia TTS + LiveKit AudioSource.

Bypasses AgentSession.say() to give the game flows full timing control over
when the moderator speaks, with no framework-imposed VAD/interruption logic.
"""

from __future__ import annotations

import asyncio
import logging

from livekit import rtc
from livekit.plugins import cartesia

logger = logging.getLogger(__name__)

_SAMPLE_RATE = 24000
_CHANNELS = 1


class AudioRenderer:
    """Owns a LocalAudioTrack and synthesizes speech via Cartesia TTS directly."""

    def __init__(self) -> None:
        self._source = rtc.AudioSource(_SAMPLE_RATE, _CHANNELS)
        self._track = rtc.LocalAudioTrack.create_audio_track("moderator-voice", self._source)
        self._tts = cartesia.TTS()
        self._lock = asyncio.Lock()  # serialize concurrent say() calls

    @property
    def track(self) -> rtc.LocalAudioTrack:
        return self._track

    async def say(self, text: str) -> None:
        """Synthesize *text* via Cartesia and push PCM frames into the audio track."""
        async with self._lock:
            logger.info("AudioRenderer.say: %r", text[:80])
            stream = self._tts.synthesize(text)
            async with stream:
                async for audio in stream:
                    await self._source.capture_frame(audio.frame)
            logger.info("AudioRenderer.say done")

    async def aclose(self) -> None:
        """Release TTS resources."""
        await self._tts.aclose()
