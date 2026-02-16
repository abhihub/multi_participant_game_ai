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

const AdvanceRoundRequest = z.object({
  delay_ms: z.number().int().min(0).max(30000).default(0),
}).optional();

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
  }, async () => {
    return {
      ok: true as const,
      moderator_identity: "moderator-ai",
      joined_at_ms: Date.now(),
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
  }, async () => {
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
  }, async () => {
    return {
      ok: true as const,
      action: "advanced" as const,
      round_index: 1,
    };
  });
}
