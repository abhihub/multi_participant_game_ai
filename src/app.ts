import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import fastifySensible from "@fastify/sensible";
import authPlugin from "./plugins/auth.js";
import errorHandlerPlugin from "./plugins/error-handler.js";

import sessionRoutes from "./routes/sessions.js";
import adminRoutes from "./routes/admin.js";
import floorRoutes from "./routes/floor.js";
import triviaRoutes from "./routes/trivia.js";
import quickdrawRoutes from "./routes/quickdraw.js";
import webhookRoutes from "./routes/webhooks.js";
import internalControlRoutes from "./routes/internal-control.js";
import internalTtsRoutes from "./routes/internal-tts.js";
import internalSttRoutes from "./routes/internal-stt.js";
import internalVisionRoutes from "./routes/internal-vision.js";
import internalDecisionRoutes from "./routes/internal-decisions.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Plugins
  await app.register(fastifySensible);
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  // Routes
  await app.register(sessionRoutes);
  await app.register(adminRoutes);
  await app.register(floorRoutes);
  await app.register(triviaRoutes);
  await app.register(quickdrawRoutes);
  await app.register(webhookRoutes);
  await app.register(internalControlRoutes);
  await app.register(internalTtsRoutes);
  await app.register(internalSttRoutes);
  await app.register(internalVisionRoutes);
  await app.register(internalDecisionRoutes);

  return app;
}
