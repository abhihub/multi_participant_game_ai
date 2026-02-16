import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CreateSessionRequest, CreateSessionResponse,
  MintParticipantTokenRequest, MintParticipantTokenResponse,
  SnapshotResponse, EventLogResponse,
  SessionIdParam,
} from "../schemas/index.js";
import { AfterSeqQuery } from "../schemas/stt.js";
import { generateSessionId, generateRoundId } from "../utils/ids.js";

export default async function sessionRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /v1/sessions
  app.post("/v1/sessions", {
    schema: {
      body: CreateSessionRequest,
      response: { 200: CreateSessionResponse },
    },
    preHandler: [fastify.verifyApiKey],
  }, async (request) => {
    const { game, livekit } = request.body;
    const sessionId = generateSessionId();

    return {
      session_id: sessionId,
      game,
      status: "created" as const,
      livekit: {
        room_name: livekit.room_name,
        room_region: livekit.room_region ?? null,
      },
      tokens: {
        host_token: `tok_host_${sessionId}`,
        moderator_token: `tok_mod_${sessionId}`,
        session_admin_token: `tok_admin_${sessionId}`,
      },
      realtime: {
        transport: "livekit_datachannel" as const,
        topic: "game.events.v1" as const,
      },
    };
  });

  // POST /v1/sessions/:session_id/token (maps to OpenAPI participants:token)
  app.post("/v1/sessions/:session_id/token", {
    schema: {
      params: SessionIdParam,
      body: MintParticipantTokenRequest,
      response: { 200: MintParticipantTokenResponse },
    },
    preHandler: [fastify.verifyApiKey],
  }, async (request) => {
    const { session_id } = request.params;
    const { identity, display_name, role, metadata } = request.body;

    return {
      livekit_token: `lk_tok_${session_id}_${identity}`,
      participant: {
        identity,
        display_name,
        role,
        score: 0,
        muted: false,
        joined_at_ms: Date.now(),
        metadata,
      },
    };
  });

  // GET /v1/sessions/:session_id/snapshot
  app.get("/v1/sessions/:session_id/snapshot", {
    schema: {
      params: SessionIdParam,
      response: { 200: SnapshotResponse },
    },
  }, async (request) => {
    const { session_id } = request.params;
    const roundId = generateRoundId();

    return {
      session_id,
      game: "trivia" as const,
      status: "running" as const,
      sequence: 1,
      floor: { mode: "open" as const },
      state: {
        participants: [
          { identity: "player1", display_name: "Player 1", role: "player" as const, score: 0, muted: false },
        ],
        round: {
          round_id: roundId,
          phase: "lobby",
          ends_at_ms: Date.now() + 30000,
        },
        trivia: {
          topic: "General Knowledge",
          question_index: 0,
        },
      },
    };
  });

  // GET /v1/sessions/:session_id/events
  app.get("/v1/sessions/:session_id/events", {
    schema: {
      params: SessionIdParam,
      querystring: AfterSeqQuery,
      response: { 200: EventLogResponse },
    },
  }, async (request) => {
    const { session_id } = request.params;

    return {
      session_id,
      events: [],
      next_after_seq: null,
    };
  });
}
