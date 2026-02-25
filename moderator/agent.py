"""Entry point for the LiveKit Agents moderator service.

Run with:
    uv run agent.py dev        # development mode (auto-reload)
    uv run agent.py start      # production mode
"""

from __future__ import annotations

import logging

from dotenv import load_dotenv

# Load environment before importing agents (they read LIVEKIT_* vars at import)
load_dotenv(".env.local")

from livekit.agents import AgentSession, JobContext, WorkerOptions, cli  # noqa: E402
from livekit.plugins import cartesia, deepgram, openai, silero  # noqa: E402

from moderator.game_agent import GameModerator  # noqa: E402

logger = logging.getLogger("moderator")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


async def entrypoint(ctx: JobContext) -> None:
    """Called by the LiveKit Agents framework when a new session is dispatched."""
    await ctx.connect()
    logger.info("new session: room=%s", ctx.room.name)

    session = AgentSession(
        # STT: Deepgram Nova-3 (multilingual)
        stt=deepgram.STT(model="nova-3"),
        # LLM: OpenAI GPT-4.1-mini for question gen + judging
        llm=openai.LLM(model="gpt-4.1-mini"),
        # TTS: Cartesia Sonic
        tts=cartesia.TTS(),
        # VAD: Silero for voice activity detection
        vad=silero.VAD.load(),
    )

    agent = GameModerator(ctx=ctx)
    await session.start(room=ctx.room, agent=agent)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
