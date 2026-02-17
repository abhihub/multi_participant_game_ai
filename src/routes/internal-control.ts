import { z } from "zod";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  SessionIdParam, OkResponse, ReasonRequest, HealthResponse,
  AdvanceRoundResponse,
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
