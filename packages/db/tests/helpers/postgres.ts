import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "../../src/schema/index.js";

const { Pool } = pg;

export type RealDbContext = {
  pool: pg.Pool;
  db: ReturnType<typeof drizzle<typeof schema>>;
  cleanup: () => Promise<void>;
};

/**
 * Connect to the Postgres pointed to by `TEST_DATABASE_URL` and apply both
 * migrations from scratch onto a fresh schema namespace.
 *
 * The smoke test that calls this is gated on `TEST_DATABASE_URL` being set;
 * see `tests/rls.test.ts` for the skip path. Each invocation creates a
 * unique schema, applies migrations into it, and drops the schema on
 * cleanup so concurrent test runs don't collide.
 */
export async function connectRealDb(): Promise<RealDbContext | null> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return null;

  const schemaName = `runwayops_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  const pool = new Pool({ connectionString: url });

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  await pool.query(`SET search_path TO ${schemaName}`);
  // Make every NEW connection from this pool default to the schema.
  pool.on("connect", (client) => {
    void client.query(`SET search_path TO ${schemaName}`);
  });

  const migrationsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../migrations",
  );

  for (const filename of [
    "0000_runwayops_initial_schema.sql",
    "0001_runwayops_rls_and_indexes.sql",
  ]) {
    const sql = await readFile(path.join(migrationsDir, filename), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (!trimmed) continue;
      await pool.query(trimmed);
    }
  }

  const db = drizzle(pool, { schema });

  const cleanup = async () => {
    try {
      await pool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    } finally {
      await pool.end();
    }
  };

  return { pool, db, cleanup };
}
