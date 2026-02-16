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
  }, async () => {
    return { ok: true as const, status: "running" };
  });

  // POST /v1/sessions/:session_id/actions/pause
  app.post("/v1/sessions/:session_id/actions/pause", {
    schema: {
      params: SessionIdParam,
      body: ReasonRequest,
      response: { 200: OkStatusResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async () => {
    return { ok: true as const, status: "paused" };
  });

  // POST /v1/sessions/:session_id/actions/resume
  app.post("/v1/sessions/:session_id/actions/resume", {
    schema: {
      params: SessionIdParam,
      body: ReasonRequest,
      response: { 200: OkStatusResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async () => {
    return { ok: true as const, status: "running" };
  });

  // POST /v1/sessions/:session_id/actions/end
  app.post("/v1/sessions/:session_id/actions/end", {
    schema: {
      params: SessionIdParam,
      body: ReasonRequest,
      response: { 200: OkStatusResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async () => {
    return { ok: true as const, status: "ended" };
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
    const identities = request.body.participant_identities ?? ["player1", "player2"];
    return { ok: true as const, affected_identities: identities };
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
    const identities = request.body.participant_identities ?? ["player1", "player2"];
    return { ok: true as const, affected_identities: identities };
  });

  // POST /v1/sessions/:session_id/actions/override-score
  app.post("/v1/sessions/:session_id/actions/override-score", {
    schema: {
      params: SessionIdParam,
      body: OverrideScoreRequest,
      response: { 200: OkStatusResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async () => {
    return { ok: true as const, status: "running" };
  });

  // POST /v1/sessions/:session_id/actions/skip
  app.post("/v1/sessions/:session_id/actions/skip", {
    schema: {
      params: SessionIdParam,
      body: SkipRequest,
      response: { 200: OkStatusResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async () => {
    return { ok: true as const, status: "running" };
  });

  // POST /v1/sessions/:session_id/actions/trigger-effect
  app.post("/v1/sessions/:session_id/actions/trigger-effect", {
    schema: {
      params: SessionIdParam,
      body: TriggerEffectRequest,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async () => {
    return { ok: true as const };
  });
}
