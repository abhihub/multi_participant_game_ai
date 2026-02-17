import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CreateSessionRequest, CreateSessionResponse,
  MintParticipantTokenRequest, MintParticipantTokenResponse,
  SnapshotResponse, EventLogResponse,
  SessionIdParam,
} from "../schemas/index.js";
import { AfterSeqQuery } from "../schemas/stt.js";

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
    const session = await fastify.sessionStore.createSession(request.body);

    return {
      session_id: session.id,
      game: session.game,
      status: session.status,
      livekit: {
        room_name: session.livekit.room_name,
        room_region: session.livekit.room_region ?? null,
      },
      tokens: session.tokens,
      realtime: {
        transport: "livekit_datachannel" as const,
        topic: "game.events.v1" as const,
      },
    };
  });

  // POST /v1/sessions/:session_id/token
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

    const result = await fastify.sessionStore.addParticipant(session_id, {
      identity,
      display_name,
      role,
      metadata,
    });

    return {
      livekit_token: result.livekit_token,
      participant: {
        identity: result.participant.identity,
        display_name: result.participant.display_name,
        role: result.participant.role,
        score: result.participant.score,
        muted: result.participant.muted,
        joined_at_ms: result.participant.joined_at_ms,
        metadata: result.participant.metadata,
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
    const session = fastify.sessionStore.getSession(session_id);
    const sequence = fastify.eventBus.getSequence(session_id);
    const participants = [...session.participants.values()].map((p) => ({
      identity: p.identity,
      display_name: p.display_name,
      role: p.role,
      score: p.score,
      muted: p.muted,
    }));

    const round = session.round ?? {
      round_id: "rnd_pending",
      phase: "lobby",
      ends_at_ms: Date.now() + 30000,
    };

    const base = {
      session_id,
      game: session.game,
      status: session.status,
      sequence,
      floor: session.floor,
    };

    if (session.game === "trivia") {
      return {
        ...base,
        state: {
          participants,
          round,
          trivia: {
            topic: session.trivia?.topic ?? "General Knowledge",
            difficulty: session.trivia?.difficulty,
            question_index: session.trivia?.question_index ?? 0,
          },
        },
      };
    }

    // quick_draw
    return {
      ...base,
      state: {
        participants,
        round,
        quickdraw: {
          prompt: session.quickdraw?.current_prompt ?? "Draw something",
          category: session.quickdraw?.category ?? null,
          difficulty: session.quickdraw?.difficulty,
          prompt_index: session.quickdraw?.prompt_index ?? 0,
          round_duration_ms: session.quickdraw?.round_duration_ms ?? 25000,
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
    // Verify session exists
    fastify.sessionStore.getSession(session_id);

    const { after_seq, limit } = request.query;
    const result = fastify.eventBus.getEvents(session_id, after_seq, limit);

    return {
      session_id,
      events: result.events,
      next_after_seq: result.next_after_seq,
    };
  });
}
