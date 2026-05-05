/**
 * RunwayOps API entry point.
 * Fastify HTTP server with tenancy, idempotency, and audit middleware.
 */
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

import { registerRoutes } from "./routes/index.js";
import { registerWireSerializer } from "./lib/wire.js";

const RATE_LIMIT_PER_TENANT_PER_MINUTE = Number(
  process.env.RATE_LIMIT_PER_MINUTE ?? "120",
);

export function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    // Use the existing Fastify request id (auto-generated short id) as
    // the correlation id surfaced in logs and the response header.
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "reqId",
    genReqId: () => `req-${Math.random().toString(36).slice(2, 11)}`,
  });

  // Echo the correlation id back to the caller for cross-system
  // troubleshooting (web logs an x-request-id on failure → operator
  // greps API logs by reqId).
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  // Rate limit per tenant. Demo-mode header is the auth boundary, so
  // anyone with a valid UUID could otherwise hammer the API. Keying
  // on companyId means a noisy tenant doesn't starve the others. IP
  // fallback covers unauthenticated requests (which would 401 anyway,
  // but should be slowed down to discourage scanning).
  app.register(rateLimit, {
    max: RATE_LIMIT_PER_TENANT_PER_MINUTE,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.tenantCtx?.companyId ?? req.ip,
    errorResponseBuilder: (_request, context) => ({
      ok: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Rate limit exceeded. Try again in ${context.after}.`,
        statusCode: 429,
      },
    }),
  });

  // bigint -> string at the HTTP boundary. Domain Money carries bigint
  // amountMinor; without this hook reply.send() throws on the first
  // forecast/action/promise response. Must be registered before routes.
  registerWireSerializer(app);

  app.register(registerRoutes);

  return app;
}

async function main() {
  const app = buildApp();
  const port = parseInt(process.env.PORT ?? "3001", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  await app.listen({ port, host });
}

// Only start the server when running directly (not imported for tests)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, ""))) {
  main().catch((err) => {
    process.stderr.write(String(err) + "\n");
    process.exit(1);
  });
}
