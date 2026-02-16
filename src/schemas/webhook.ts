import { z } from "zod";
import { WebhookEventType } from "./enums.js";

export const CreateWebhookRequest = z.object({
  url: z.string().url(),
  events: z.array(WebhookEventType),
  secret: z.string().nullable().optional(),
});
export type CreateWebhookRequest = z.infer<typeof CreateWebhookRequest>;

export const WebhookResponse = z.object({
  webhook_id: z.string(),
  url: z.string().url(),
  events: z.array(z.string()),
});
export type WebhookResponse = z.infer<typeof WebhookResponse>;
