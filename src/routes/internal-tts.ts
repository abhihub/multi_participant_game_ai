import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { TtsSpeakRequest, TtsSpeakResponse, TtsJob, JobIdParam } from "../schemas/index.js";
import { generateJobId, generateSpeakId } from "../utils/ids.js";

export default async function internalTtsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /internal/v1/tts/speak
  app.post("/internal/v1/tts/speak", {
    schema: {
      body: TtsSpeakRequest,
      response: { 200: TtsSpeakResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async () => {
    return {
      job_id: generateJobId(),
      speak_id: generateSpeakId(),
      status: "queued" as const,
    };
  });

  // GET /internal/v1/tts/jobs/:job_id
  app.get("/internal/v1/tts/jobs/:job_id", {
    schema: {
      params: JobIdParam,
      response: { 200: TtsJob },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    return {
      job_id: request.params.job_id,
      status: "done" as const,
      error: null,
      audio: {
        content_type: "audio/pcm" as const,
        url: null,
        bytes_base64: null,
        duration_ms: 2500,
      },
    };
  });
}
