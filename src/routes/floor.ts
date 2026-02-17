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
      changed_by: "admin",
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

  // POST /v1/sessions/:session_id/actions/floor/release
  app.post("/v1/sessions/:session_id/actions/floor/release", {
    schema: {
      params: SessionIdParam,
      body: ReasonRequest,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { session_id } = request.params;
    const floor = fastify.sessionStore.releaseFloor(session_id);

    fastify.eventBus.emit(session_id, "floor.changed", {
      floor,
      changed_by: "admin",
      reason: request.body.reason ?? null,
    });

    return { ok: true as const };
  });
}
