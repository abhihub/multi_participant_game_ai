import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  SessionIdParam, OkResponse, OkStatusResponse, ReasonRequest,
  StartSessionRequest, OverrideScoreRequest, SkipRequest, TriggerEffectRequest,
  ParticipantMuteRequest, ParticipantUnmuteRequest, MuteUnmuteResponse,
} from "../schemas/index.js";

export default async function adminRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /v1/sessions/:session_id/actions/start
  app.post("/v1/sessions/:session_id/actions/start", {
    schema: {
      params: SessionIdParam,
      body: StartSessionRequest,
      response: { 200: OkStatusResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { session_id } = request.params;
    const session = fastify.sessionStore.transitionStatus(session_id, "running");
    fastify.eventBus.emit(session_id, "session.started", { at_ms: Date.now() });
    return { ok: true as const, status: session.status };
  });

  // POST /v1/sessions/:session_id/actions/pause
  app.post("/v1/sessions/:session_id/actions/pause", {
    schema: {
      params: SessionIdParam,
      body: ReasonRequest,
      response: { 200: OkStatusResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { session_id } = request.params;
    const session = fastify.sessionStore.transitionStatus(session_id, "paused");
    fastify.eventBus.emit(session_id, "session.paused", {
      at_ms: Date.now(),
      reason: request.body.reason ?? null,
    });
    return { ok: true as const, status: session.status };
  });

  // POST /v1/sessions/:session_id/actions/resume
  app.post("/v1/sessions/:session_id/actions/resume", {
    schema: {
      params: SessionIdParam,
      body: ReasonRequest,
      response: { 200: OkStatusResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { session_id } = request.params;
    const session = fastify.sessionStore.transitionStatus(session_id, "running");
    fastify.eventBus.emit(session_id, "session.resumed", {
      at_ms: Date.now(),
      reason: request.body.reason ?? null,
    });
    return { ok: true as const, status: session.status };
  });

  // POST /v1/sessions/:session_id/actions/end
  app.post("/v1/sessions/:session_id/actions/end", {
    schema: {
      params: SessionIdParam,
      body: ReasonRequest,
      response: { 200: OkStatusResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { session_id } = request.params;
    const session = fastify.sessionStore.transitionStatus(session_id, "ended");
    fastify.eventBus.emit(session_id, "session.ended", {
      at_ms: Date.now(),
      reason: request.body.reason ?? "admin_ended",
      winner_identity: null,
      final_scores: null,
    });
    return { ok: true as const, status: session.status };
  });

  // POST /v1/sessions/:session_id/actions/participants/mute
  app.post("/v1/sessions/:session_id/actions/participants/mute", {
    schema: {
      params: SessionIdParam,
      body: ParticipantMuteRequest,
      response: { 200: MuteUnmuteResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { session_id } = request.params;
    const affected = fastify.sessionStore.muteParticipants(session_id, request.body);
    fastify.eventBus.emit(session_id, "participants.mute.changed", {
      affected_identities: affected,
      muted: true,
      reason: request.body.reason ?? null,
      source: "admin",
      until_ms: request.body.duration_ms ? Date.now() + request.body.duration_ms : null,
    });
    return { ok: true as const, affected_identities: affected };
  });

  // POST /v1/sessions/:session_id/actions/participants/unmute
  app.post("/v1/sessions/:session_id/actions/participants/unmute", {
    schema: {
      params: SessionIdParam,
      body: ParticipantUnmuteRequest,
      response: { 200: MuteUnmuteResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { session_id } = request.params;
    const affected = fastify.sessionStore.unmuteParticipants(session_id, request.body);
    fastify.eventBus.emit(session_id, "participants.mute.changed", {
      affected_identities: affected,
      muted: false,
      reason: request.body.reason ?? null,
      source: "admin",
    });
    return { ok: true as const, affected_identities: affected };
  });

  // POST /v1/sessions/:session_id/actions/override-score
  app.post("/v1/sessions/:session_id/actions/override-score", {
    schema: {
      params: SessionIdParam,
      body: OverrideScoreRequest,
      response: { 200: OkStatusResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { session_id } = request.params;
    const { session } = fastify.sessionStore.overrideScore(session_id, request.body);
    return { ok: true as const, status: session.status };
  });

  // POST /v1/sessions/:session_id/actions/skip
  app.post("/v1/sessions/:session_id/actions/skip", {
    schema: {
      params: SessionIdParam,
      body: SkipRequest,
      response: { 200: OkStatusResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { session_id } = request.params;
    fastify.sessionStore.skipRound(session_id, request.body.scope);
    const session = fastify.sessionStore.getSession(session_id);
    return { ok: true as const, status: session.status };
  });

  // POST /v1/sessions/:session_id/actions/trigger-effect
  app.post("/v1/sessions/:session_id/actions/trigger-effect", {
    schema: {
      params: SessionIdParam,
      body: TriggerEffectRequest,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { session_id } = request.params;
    fastify.sessionStore.getSession(session_id); // verify exists
    fastify.eventBus.emit(session_id, "effect.triggered", {
      effect: request.body.effect,
      target_identity: request.body.target_identity ?? null,
      data: request.body.data ?? {},
      duration_ms: request.body.duration_ms,
    });
    return { ok: true as const };
  });
}
