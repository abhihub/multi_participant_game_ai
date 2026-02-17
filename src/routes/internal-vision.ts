import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  OkResponse,
  VisionPaperDetectRequest, VisionPaperDetectResponse,
  VisionQuickDrawJudgeRequest, VisionQuickDrawJudgeResponse,
  CreateVisionStreamRequest, CreateVisionStreamResponse,
  VisionFeedRequest, VisionResultsResponse,
  VisionStreamIdParam,
} from "../schemas/index.js";
import { AfterSeqQuery } from "../schemas/stt.js";

export default async function internalVisionRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /internal/v1/vision/paper-detect — lightweight one-shot (external service)
  app.post("/internal/v1/vision/paper-detect", {
    schema: {
      body: VisionPaperDetectRequest,
      response: { 200: VisionPaperDetectResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async () => {
    return {
      regions: [
        {
          bbox: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
          quad: [
            { x: 0.1, y: 0.1 },
            { x: 0.9, y: 0.1 },
            { x: 0.9, y: 0.9 },
            { x: 0.1, y: 0.9 },
          ],
          quality: { blur_score: 0.1, motion_score: 0.05, size_ratio: 0.64 },
        },
      ],
    };
  });

  // POST /internal/v1/vision/quickdraw-judge — lightweight one-shot (external service)
  app.post("/internal/v1/vision/quickdraw-judge", {
    schema: {
      body: VisionQuickDrawJudgeRequest,
      response: { 200: VisionQuickDrawJudgeResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async () => {
    return {
      correct: false,
      confidence: 0.3,
      rationale: "Drawing does not match the prompt",
    };
  });

  // POST /internal/v1/vision/streams
  app.post("/internal/v1/vision/streams", {
    schema: {
      body: CreateVisionStreamRequest,
      response: { 200: CreateVisionStreamResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    const stream = fastify.streamStore.createVisionStream({
      session_id: request.body.session_id,
      participant_identity: request.body.participant_identity,
      prompt: request.body.prompt,
    });

    return {
      vision_stream_id: stream.vision_stream_id,
      status: "open" as const,
    };
  });

  // POST /internal/v1/vision/streams/:vision_stream_id/feed
  app.post("/internal/v1/vision/streams/:vision_stream_id/feed", {
    schema: {
      params: VisionStreamIdParam,
      body: VisionFeedRequest,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    const stream = fastify.streamStore.getVisionStream(request.params.vision_stream_id);
    if (stream.status === "closed") {
      throw Object.assign(new Error("Stream is closed"), { statusCode: 409 });
    }
    return { ok: true as const };
  });

  // GET /internal/v1/vision/streams/:vision_stream_id/results
  app.get("/internal/v1/vision/streams/:vision_stream_id/results", {
    schema: {
      params: VisionStreamIdParam,
      querystring: AfterSeqQuery,
      response: { 200: VisionResultsResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    const { after_seq, limit } = request.query;
    return fastify.streamStore.getVisionResults(
      request.params.vision_stream_id,
      after_seq,
      limit,
    );
  });

  // POST /internal/v1/vision/streams/:vision_stream_id/close
  app.post("/internal/v1/vision/streams/:vision_stream_id/close", {
    schema: {
      params: VisionStreamIdParam,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    fastify.streamStore.closeVisionStream(request.params.vision_stream_id);
    return { ok: true as const };
  });
}
