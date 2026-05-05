import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { schema } from "@runwayops/db";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const { Pool } = pg;

export type RealDbContext = {
  /** App-role pool — RLS is enforced. Use this for under-test queries. */
  pool: pg.Pool;
  /** App-role drizzle handle. */
  db: ReturnType<typeof drizzle<typeof schema>>;
  /**
   * Admin-role drizzle handle (BYPASSRLS / superuser). Use this only for
   * cross-tenant setup that an application role could never legitimately
   * perform — typically seeding companies in beforeAll. If
   * ADMIN_DATABASE_URL is unset this falls back to `db`, which means setup
   * fails fast under RLS rather than silently bypassing.
   */
  adminDb: ReturnType<typeof drizzle<typeof schema>>;
  cleanup: () => Promise<void>;
};

/**
 * Spin up a real-Postgres-backed test context, mirroring the helper in
 * `packages/db/tests/helpers/postgres.ts`. Each call carves out a unique
 * schema namespace, applies the canonical migration SQL into it, and
 * grants the app role table-level DML so RLS-enforced queries can run.
 *
 * The integrations package depends on `@runwayops/db` for schema, so the
 * migration files live next door. We resolve their path relative to this
 * file rather than relying on the db package being installed in a
 * particular layout — `file:` linkage means the package source tree is
 * symlinked at `node_modules/@runwayops/db`, and the SQL lives outside
 * the published `dist` so we walk back to the package root.
 */
export async function connectRealDb(): Promise<RealDbContext | null> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return null;

  const adminUrl = process.env.ADMIN_DATABASE_URL;

  const schemaName = `runwayops_int_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  const setSearchPath = (client: pg.PoolClient) => {
    void client.query(`SET search_path TO ${schemaName}`);
  };

  const pool = new Pool({ connectionString: url });
  pool.on("connect", setSearchPath);

  const adminPool = adminUrl ? new Pool({ connectionString: adminUrl }) : null;
  if (adminPool) adminPool.on("connect", setSearchPath);

  const ddlPool = adminPool ?? pool;
  await ddlPool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  await ddlPool.query(`SET search_path TO ${schemaName}`);
  if (adminPool) {
    const appRole = new URL(url).username;
    await ddlPool.query(
      `GRANT USAGE ON SCHEMA ${schemaName} TO ${escapeIdent(appRole)}`,
    );
  }

  const migrationsDir = resolveMigrationsDir();

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

/**
 * Resolve the migrations directory in the linked `@runwayops/db` source
 * tree. The package uses `file:` linkage so node_modules contains a
 * symlink to the source — the `migrations` folder sits at the package
 * root, two levels above this file's effective location.
 */
function resolveMigrationsDir(): string {
  const fromHelper = path.dirname(fileURLToPath(import.meta.url));
  // tests/helpers/ -> tests/ -> integrations/ -> packages/ -> packages/db/migrations
  return path.resolve(fromHelper, "../../../db/migrations");
}

function escapeIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}
