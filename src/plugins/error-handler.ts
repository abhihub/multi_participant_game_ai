import { FastifyInstance, FastifyError } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";

async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "Validation Error",
        message: "Request validation failed",
        details: error.issues,
      });
    }

    if ("statusCode" in error && typeof error.statusCode === "number") {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "An unexpected error occurred",
    });
  });
}

export default fp(errorHandlerPlugin, { name: "error-handler" });
