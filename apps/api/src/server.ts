/**
 * RunwayOps API entry point.
 * Fastify HTTP server with tenancy, idempotency, and audit middleware.
 */
import Fastify from "fastify";

import { registerRoutes } from "./routes/index.js";
import { registerWireSerializer } from "./lib/wire.js";

export function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
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
