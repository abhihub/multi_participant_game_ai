import { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { config } from "../config.js";
import { sessionStore } from "../state/SessionStore.js";

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate("verifyApiKey", async (request: FastifyRequest) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      throw fastify.httpErrors.unauthorized("Missing or invalid Authorization header");
    }
    const token = auth.slice(7);
    if (token !== config.auth.apiKey) {
      throw fastify.httpErrors.unauthorized("Invalid API key");
    }
  });

  fastify.decorate("verifySessionAdmin", async (request: FastifyRequest) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      throw fastify.httpErrors.unauthorized("Missing or invalid Authorization header");
    }
    const token = auth.slice(7);
    const session = sessionStore.findSessionByAdminToken(token);
    if (!session) {
      throw fastify.httpErrors.unauthorized("Invalid session admin token");
    }
    // Attach session_id to request for downstream handlers
    (request as any).sessionAdminId = session.id;
  });

  fastify.decorate("verifyInternal", async (request: FastifyRequest) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      throw fastify.httpErrors.unauthorized("Missing or invalid Authorization header");
    }
    const token = auth.slice(7);
    if (token !== config.auth.internalToken) {
      throw fastify.httpErrors.unauthorized("Invalid internal token");
    }
  });
}

export default fp(authPlugin, { name: "auth" });

declare module "fastify" {
  interface FastifyInstance {
    verifyApiKey: (request: FastifyRequest) => Promise<void>;
    verifySessionAdmin: (request: FastifyRequest) => Promise<void>;
    verifyInternal: (request: FastifyRequest) => Promise<void>;
  }
}
