import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { OkResponse, TriviaAnswerDecision, QuickDrawCorrectDecision } from "../schemas/index.js";

export default async function internalDecisionRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /internal/v1/decisions/trivia-answer
  app.post("/internal/v1/decisions/trivia-answer", {
    schema: {
      body: TriviaAnswerDecision,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    fastify.sessionStore.ingestTriviaAnswer(request.body);
    return { ok: true as const };
  });

  // POST /internal/v1/decisions/quickdraw-correct
  app.post("/internal/v1/decisions/quickdraw-correct", {
    schema: {
      body: QuickDrawCorrectDecision,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifyInternal],
  }, async (request) => {
    fastify.sessionStore.ingestQuickDrawCorrect(request.body);
    return { ok: true as const };
  });
}
