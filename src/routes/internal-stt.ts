import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  OkResponse,
  CreateSttStreamRequest, CreateSttStreamResponse,
  SttFeedRequest, SttResultsResponse,
  StreamIdParam, AfterSeqQuery,
} from "../schemas/index.js";

export default async function internalSttRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /internal/v1/stt/streams
  app.post("/internal/v1/stt/streams", {
    schema: {
      body: CreateSttStreamRequest,
      response: { 200: CreateSttStreamResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    const stream = fastify.streamStore.createSttStream({
      session_id: request.body.session_id,
      participant_identity: request.body.participant_identity,
      round_id: request.body.round_id,
      question_id: request.body.question_id,
    });

    return {
      stream_id: stream.stream_id,
      status: "open" as const,
    };
  });

  // POST /internal/v1/stt/streams/:stream_id/feed
  app.post("/internal/v1/stt/streams/:stream_id/feed", {
    schema: {
      params: StreamIdParam,
      body: SttFeedRequest,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    // Verify stream exists and is open
    const stream = fastify.streamStore.getSttStream(request.params.stream_id);
    if (stream.status === "closed") {
      throw Object.assign(new Error("Stream is closed"), { statusCode: 409 });
    }
    // Acknowledge feed — actual STT processing is external
    return { ok: true as const };
  });

  // POST /internal/v1/stt/streams/:stream_id/close
  app.post("/internal/v1/stt/streams/:stream_id/close", {
    schema: {
      params: StreamIdParam,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    fastify.streamStore.closeSttStream(request.params.stream_id);
    return { ok: true as const };
  });

  // GET /internal/v1/stt/streams/:stream_id/results
  app.get("/internal/v1/stt/streams/:stream_id/results", {
    schema: {
      params: StreamIdParam,
      querystring: AfterSeqQuery,
      response: { 200: SttResultsResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    const { after_seq, limit } = request.query;
    return fastify.streamStore.getSttResults(
      request.params.stream_id,
      after_seq,
      limit,
    );
  });
}
