import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { SessionIdParam, OkResponse, SetTriviaTopicRequest } from "../schemas/index.js";

export default async function triviaRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /v1/sessions/:session_id/trivia/topic
  app.post("/v1/sessions/:session_id/trivia/topic", {
    schema: {
      params: SessionIdParam,
      body: SetTriviaTopicRequest,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { session_id } = request.params;
    fastify.sessionStore.setTriviaConfig(session_id, request.body);
    return { ok: true as const };
  });
}
