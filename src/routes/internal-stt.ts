import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  OkResponse,
  CreateSttStreamRequest, CreateSttStreamResponse,
  SttFeedRequest, SttResultsResponse,
  StreamIdParam, AfterSeqQuery,
} from "../schemas/index.js";
import { generateSttStreamId } from "../utils/ids.js";

export default async function internalSttRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /internal/v1/stt/streams
  app.post("/internal/v1/stt/streams", {
    schema: {
      body: CreateSttStreamRequest,
      response: { 200: CreateSttStreamResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async () => {
    return {
      stream_id: generateSttStreamId(),
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
  }, async () => {
    return { ok: true as const };
  });

  // POST /internal/v1/stt/streams/:stream_id/close
  app.post("/internal/v1/stt/streams/:stream_id/close", {
    schema: {
      params: StreamIdParam,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async () => {
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
    return {
      stream_id: request.params.stream_id,
      results: [],
      next_after_seq: null,
    };
  });
}
