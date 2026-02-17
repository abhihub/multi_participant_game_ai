import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { TtsSpeakRequest, TtsSpeakResponse, TtsJob, JobIdParam } from "../schemas/index.js";

export default async function internalTtsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /internal/v1/tts/speak
  app.post("/internal/v1/tts/speak", {
    schema: {
      body: TtsSpeakRequest,
      response: { 200: TtsSpeakResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    const { session_id, text, speak_mode } = request.body;

    // Verify session exists
    fastify.sessionStore.getSession(session_id);

    const job = fastify.ttsStore.createJob(session_id, text, speak_mode);

    fastify.eventBus.emit(session_id, "moderator.speak.started", {
      speak_id: job.speak_id,
      text,
      language: request.body.language,
      starts_at_ms: Date.now(),
      expected_end_ms: Date.now() + 3000,
      mode: speak_mode,
    });

    return {
      job_id: job.job_id,
      speak_id: job.speak_id,
      status: job.status,
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
    const job = fastify.ttsStore.getJob(request.params.job_id);

    return {
      job_id: job.job_id,
      status: job.status,
      error: null,
      audio: job.status === "done" ? {
        content_type: "audio/pcm" as const,
        url: null,
        bytes_base64: null,
        duration_ms: 2500,
      } : undefined,
    };
  });
}
