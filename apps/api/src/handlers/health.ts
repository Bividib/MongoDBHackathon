/**
 * Health endpoints — NOT behind tenancy middleware.
 * /healthz — liveness (always 200)
 * /readyz  — DB ping + outbox-pending lag
 */
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";

import { getDbInstance } from "../middleware/tenancy.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async (_request, reply) => {
    return reply.status(200).send({ status: "ok" });
  });

  app.get("/readyz", async (_request, reply) => {
    try {
      // DB ping
      const db = getDbInstance();
      await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
        sql`SELECT 1`,
      );

      // Outbox lag: count pending events older than 60s
      const lagResult = await (db as unknown as { execute: (q: unknown) => Promise<{ rows: Array<{ lag: string }> }> }).execute(
        sql`SELECT count(*)::text AS lag FROM outbox_events WHERE status = 'pending' AND available_at < now() - interval '60 seconds'`,
      );
      const rows = (lagResult as { rows: Array<{ lag: string }> }).rows;
      const lag = parseInt(rows[0]?.lag ?? "0", 10);

      return reply.status(200).send({ status: "ok", outboxLag: lag });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown";
      return reply.status(503).send({ status: "unhealthy", error: message });
    }
  });
}
