import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { CreateWebhookRequest, WebhookResponse } from "../schemas/index.js";
import { generateWebhookId } from "../utils/ids.js";

export default async function webhookRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /v1/webhooks
  app.post("/v1/webhooks", {
    schema: {
      body: CreateWebhookRequest,
      response: { 200: WebhookResponse },
    },
    preHandler: [fastify.verifyApiKey],
  }, async (request) => {
    const { url, events } = request.body;

    return {
      webhook_id: generateWebhookId(),
      url,
      events,
    };
  });
}
