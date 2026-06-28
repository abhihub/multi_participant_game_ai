import { z } from "zod";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  SessionIdParam, OkResponse, ReasonRequest, HealthResponse,
  AdvanceRoundResponse, FloorControlRequest, FloorControlResponse,
} from "../schemas/index.js";

const startTime = Date.now();

const AttachModeratorRequest = z.object({
  livekit: z.object({
    room_name: z.string(),
    moderator_token: z.string(),
    region: z.string().nullable().optional(),
  }),
  realtime: z.object({
    topic: z.enum(["game.events.v1"]),
  }),
  game: z.enum(["trivia", "quick_draw"]).optional(),
  config: z.record(z.unknown()).optional(),
});

const AttachModeratorResponse = z.object({
  ok: z.literal(true),
  moderator_identity: z.string(),
  joined_at_ms: z.number().int().min(0),
});

const RoomNameParam = z.object({
  room_name: z.string().min(1),
});

const SessionLookupResponse = z.object({
  ok: z.literal(true),
  session_id: z.string(),
  status: z.string(),
  game: z.enum(["trivia", "quick_draw"]),
  room_name: z.string(),
});

export default async function internalControlRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /internal/v1/health
  app.get("/internal/v1/health", {
    schema: {
      response: { 200: HealthResponse },
    },
  }, async () => {
    return {
      ok: true as const,
      version: "1.3.0",
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    };
  });

  // GET /internal/v1/sessions/by-room/:room_name
  app.get("/internal/v1/sessions/by-room/:room_name", {
    schema: {
      params: RoomNameParam,
      response: { 200: SessionLookupResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    const { room_name } = request.params;
    const session = fastify.sessionStore.findSessionByRoomName(room_name);
    if (!session) {
      throw fastify.httpErrors.notFound("Session not found for room");
    }

    return {
      ok: true as const,
      session_id: session.id,
      status: session.status,
      game: session.game,
      room_name: session.livekit.room_name,
    };
  });

  // POST /internal/v1/sessions/:session_id/attach
  app.post("/internal/v1/sessions/:session_id/attach", {
    schema: {
      params: SessionIdParam,
      body: AttachModeratorRequest,
      response: { 200: AttachModeratorResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    const { session_id } = request.params;
    const session = fastify.sessionStore.getSession(session_id);

    const moderatorIdentity = "moderator-ai";
    const now = Date.now();

    // Add moderator as participant
    await fastify.sessionStore.addParticipant(session_id, {
      identity: moderatorIdentity,
      display_name: "AI Moderator",
      role: "moderator",
    });

    session.moderator_identity = moderatorIdentity;

    return {
      ok: true as const,
      moderator_identity: moderatorIdentity,
      joined_at_ms: now,
    };
  });

  // POST /internal/v1/sessions/:session_id/detach
  app.post("/internal/v1/sessions/:session_id/detach", {
    schema: {
      params: SessionIdParam,
      body: ReasonRequest,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    const { session_id } = request.params;
    const session = fastify.sessionStore.getSession(session_id);

    if (session.moderator_identity) {
      session.participants.delete(session.moderator_identity);
      session.moderator_identity = null;
    }

    return { ok: true as const };
  });

  // POST /internal/v1/sessions/:session_id/floor  (moderator floor control)
  app.post("/internal/v1/sessions/:session_id/floor", {
    schema: {
      params: SessionIdParam,
      body: FloorControlRequest,
      response: { 200: FloorControlResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    const { session_id } = request.params;
    const { mode, allowed_roles, allowed_identities, duration_ms, reason } = request.body;

    const floor = fastify.sessionStore.setFloor(session_id, {
      mode,
      allowed_roles,
      allowed_identities,
      duration_ms,
    });

    fastify.eventBus.emit(session_id, "floor.changed", {
      floor,
      changed_by: "moderator",
      reason: reason ?? null,
    });

    return {
      ok: true as const,
      floor: {
        mode: floor.mode,
        allowed_roles: floor.allowed_roles ?? null,
        allowed_identities: floor.allowed_identities ?? null,
        held_by: floor.held_by ?? null,
        expires_at_ms: floor.expires_at_ms ?? null,
      },
    };
  });

  // POST /internal/v1/sessions/:session_id/advance-round
  app.post("/internal/v1/sessions/:session_id/advance-round", {
    schema: {
      params: SessionIdParam,
      body: z.object({
        delay_ms: z.number().int().min(0).max(30000).default(0),
      }).optional(),
      response: { 200: AdvanceRoundResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    const { session_id } = request.params;
    const result = fastify.sessionStore.advanceRound(session_id);

    return {
      ok: true as const,
      action: result.action,
      round_index: result.round_index,
    };
  });
}
