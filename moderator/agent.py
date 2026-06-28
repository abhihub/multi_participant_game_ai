"""Entry point for the LiveKit Agents moderator service.

Run with:
    uv run agent.py dev        # development mode (auto-reload)
    uv run agent.py start      # production mode
"""

from __future__ import annotations

import asyncio
import json
import logging

from dotenv import load_dotenv

# Load environment before importing agents (they read LIVEKIT_* vars at import)
load_dotenv(".env.local")

from livekit.agents import AgentSession, JobContext, RoomInputOptions, WorkerOptions, cli  # noqa: E402
from livekit.plugins import openai  # noqa: E402

from moderator.api_client import ApiClient  # noqa: E402
from moderator.config import config  # noqa: E402
from moderator.game_agent import GameModerator  # noqa: E402

logger = logging.getLogger("moderator")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


async def entrypoint(ctx: JobContext) -> None:
    """Wait for the session to reach 'running', THEN join the LiveKit room.

    The LiveKit Agents framework dispatches this function as soon as a room is
    created.  By deferring ctx.connect() until the session is actually running,
    the moderator stays invisible to lobby participants until the host clicks
    "Start Game".
    """
    # --- 1. Resolve session_id from job metadata (available before connect) ---
    raw_room = getattr(ctx.job, "room", None)
    room_meta = getattr(raw_room, "metadata", "") or ""
    room_name = getattr(raw_room, "name", "") or ""

    session_id: str | None = None
    if room_meta:
        try:
            session_id = json.loads(room_meta).get("session_id")
        except (ValueError, TypeError):
            pass
    # --- 2. Poll snapshot API until session is "running" (or give up) ---
    api = ApiClient()
    try:
        if not session_id and room_name:
            if room_name.startswith("sess_"):
                session_id = room_name
            else:
                try:
                    result = await api.find_session_by_room(room_name)
                    session_id = result.get("session_id")
                    logger.info(
                        "pre-connect: resolved session_id=%s by room lookup (room=%s)",
                        session_id,
                        room_name,
                    )
                except Exception:
                    logger.debug(
                        "pre-connect: room lookup failed for room=%s", room_name, exc_info=True
                    )

        if not session_id:
            session_id = room_name

        logger.info("pre-connect: room=%s session_id=%s", room_name, session_id)

        deadline = asyncio.get_event_loop().time() + 600.0
        while asyncio.get_event_loop().time() < deadline:
            try:
                snap = await api.get_snapshot(session_id)
                status = snap.get("status", "created")
                if status == "running":
                    break
                if status in ("ended", "error"):
                    logger.info(
                        "session %s is '%s' before moderator joined — not connecting",
                        session_id, status,
                    )
                    return
            except Exception:
                logger.debug("snapshot poll failed, retrying", exc_info=True)
            await asyncio.sleep(2.0)
        else:
            logger.warning("timed out waiting for session %s to start", session_id)
            return
    finally:
        await api.close()

    # --- 3. Session is now running — connect to the room ---
    await ctx.connect()
    logger.info("joined room=%s (session=%s)", ctx.room.name, session_id)

    # Use a single deterministic speech path: game flows call session.say().
    # Avoid enabling the AgentSession auto STT/VAD conversational loop, which
    # can produce overlapping/interrupting moderator speech.
    session = AgentSession(
        llm=openai.LLM(model="gpt-4.1-mini"),
    )

    agent = GameModerator(ctx=ctx)
    await session.start(
        room=ctx.room,
        agent=agent,
        room_input_options=RoomInputOptions(close_on_disconnect=False),
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name=config.agent_name))
