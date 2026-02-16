import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  SessionIdParam, OkResponse, ReasonRequest,
  FloorControlRequest, FloorControlResponse,
} from "../schemas/index.js";

export default async function floorRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /v1/sessions/:session_id/actions/floor
  app.post("/v1/sessions/:session_id/actions/floor", {
    schema: {
      params: SessionIdParam,
      body: FloorControlRequest,
      response: { 200: FloorControlResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { mode, allowed_roles, allowed_identities, duration_ms } = request.body;

    return {
      ok: true as const,
      floor: {
        mode,
        allowed_roles: allowed_roles ?? null,
        allowed_identities: allowed_identities ?? null,
        held_by: "moderator",
        expires_at_ms: duration_ms ? Date.now() + duration_ms : null,
      },
    };
  });

  // POST /v1/sessions/:session_id/actions/floor/release
  app.post("/v1/sessions/:session_id/actions/floor/release", {
    schema: {
      params: SessionIdParam,
      body: ReasonRequest,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async () => {
    return { ok: true as const };
  });
}
