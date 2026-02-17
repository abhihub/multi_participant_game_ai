import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { SessionIdParam, OkResponse, SetQuickDrawConfigRequest } from "../schemas/index.js";

export default async function quickdrawRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /v1/sessions/:session_id/quickdraw/config
  app.post("/v1/sessions/:session_id/quickdraw/config", {
    schema: {
      params: SessionIdParam,
      body: SetQuickDrawConfigRequest,
      response: { 200: OkResponse },
    },
    preHandler: [fastify.verifySessionAdmin],
  }, async (request) => {
    const { session_id } = request.params;
    fastify.sessionStore.setQuickDrawConfig(session_id, request.body);
    return { ok: true as const };
  });
}
