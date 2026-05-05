import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "../../src/schema/index.js";

const { Pool } = pg;

export type RealDbContext = {
  /** App-role pool — RLS is enforced. Use this for under-test queries. */
  pool: pg.Pool;
  /** App-role drizzle handle. */
  db: ReturnType<typeof drizzle<typeof schema>>;
  /**
   * Admin-role drizzle handle (BYPASSRLS / superuser). Use this ONLY for
   * cross-tenant setup that an application role could never legitimately
   * perform — typically seeding multiple companies in beforeAll. If the
   * test environment did not provide ADMIN_DATABASE_URL this falls back
   * to `db`, which means setup fails fast with an RLS error rather than
   * silently bypassing policies.
   */
  adminDb: ReturnType<typeof drizzle<typeof schema>>;
  cleanup: () => Promise<void>;
};

/**
 * Connect to the Postgres pointed to by `TEST_DATABASE_URL` and apply both
 * migrations from scratch onto a fresh schema namespace.
 *
 * The TEST_DATABASE_URL connection is the **app role** (NOSUPERUSER,
 * NOBYPASSRLS) so RLS policies actually fire. SUPERUSER and BYPASSRLS
 * roles silently bypass policies even with FORCE ROW LEVEL SECURITY,
 * which would mask isolation bugs.
 *
 * If `ADMIN_DATABASE_URL` is set, the helper opens a SECOND pool against
 * that URL (BYPASSRLS / superuser) for cross-tenant setup operations.
 * Tests should use `ctx.adminDb` for `INSERT INTO companies(...)` style
 * setup that the app role legitimately cannot perform under RLS, and
 * `ctx.db` for everything actually under test.
 *
 * Each invocation creates a unique schema, applies migrations into it,
 * and drops the schema on cleanup so concurrent test runs don't collide.
 */
export async function connectRealDb(): Promise<RealDbContext | null> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return null;

  const adminUrl = process.env.ADMIN_DATABASE_URL;

  const schemaName = `runwayops_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  const setSearchPath = (client: pg.PoolClient) => {
    void client.query(`SET search_path TO ${schemaName}`);
  };

  const pool = new Pool({ connectionString: url });
  pool.on("connect", setSearchPath);

  const adminPool = adminUrl ? new Pool({ connectionString: adminUrl }) : null;
  if (adminPool) adminPool.on("connect", setSearchPath);

  // The schema and migrations need DDL privileges. Prefer the admin pool
  // when present; fall back to the app pool (which must have CREATE on the
  // database for this to succeed).
  const ddlPool = adminPool ?? pool;
  await ddlPool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  await ddlPool.query(`SET search_path TO ${schemaName}`);
  if (adminPool) {
    // Grant the app role usage on the per-test schema so its pool can read
    // the migrated tables. Without this, the app role connects but cannot
    // see anything in the new schema.
    const appRole = new URL(url).username;
    await ddlPool.query(
      `GRANT USAGE ON SCHEMA ${schemaName} TO ${escapeIdent(appRole)}`,
    );
  }

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
      await ddlPool.query(trimmed);
    }
  }

  if (adminPool) {
    const appRole = new URL(url).username;
    // After tables exist, grant the app role table-level DML on every table
    // in the per-test schema so it can read/write under RLS.
    await ddlPool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schemaName} TO ${escapeIdent(appRole)}`,
    );
    await ddlPool.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schemaName} TO ${escapeIdent(appRole)}`,
    );
  }

  const db = drizzle(pool, { schema });
  const adminDb = adminPool ? drizzle(adminPool, { schema }) : db;

  const cleanup = async () => {
    try {
      await ddlPool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    } finally {
      await pool.end();
      if (adminPool) await adminPool.end();
    }
  };

  return { pool, db, adminDb, cleanup };
}

function escapeIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}
