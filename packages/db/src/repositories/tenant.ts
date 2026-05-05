import { sql, type ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgDatabase, NodePgTransaction } from "drizzle-orm/node-postgres";

import * as schema from "../schema/index.js";

type Schema = typeof schema;
type TablesWithRelations = ExtractTablesWithRelations<Schema>;
export type DbTransaction = NodePgTransaction<Schema, TablesWithRelations>;
export type DbClient = NodePgDatabase<Schema>;

/**
 * Drizzle handle that may be either the top-level database client or an
 * in-progress transaction. Repository helpers accept this so callers can
 * compose them inside a larger transaction.
 */
export type DbHandle = DbClient | DbTransaction;

const COMPANY_ID_GUC = "app.current_company_id";

/**
 * Set the active tenant on the current transaction.
 *
 * MUST be called inside a transaction (or BEGIN block). The third argument
 * to `set_config(name, value, is_local)` is `true`, which scopes the GUC to
 * the transaction. RLS policies read this GUC via
 * `runwayops_current_company_id()`.
 *
 * Throws if `companyId` is not a non-empty string.
 */
export async function setTenant(handle: DbHandle, companyId: string): Promise<void> {
  if (!companyId || typeof companyId !== "string") {
    throw new Error("setTenant requires a non-empty companyId");
  }

  await handle.execute(sql`SELECT set_config(${COMPANY_ID_GUC}, ${companyId}, true)`);
}

/**
 * Read the active tenant id from the session GUC. Returns null when unset.
 * Useful for assertions in tests and for diagnostic logging.
 */
export async function getTenant(handle: DbHandle): Promise<string | null> {
  const result = await handle.execute<{ company_id: string | null }>(
    sql`SELECT NULLIF(current_setting(${COMPANY_ID_GUC}, true), '') AS company_id`,
  );
  const row = (result as unknown as { rows: Array<{ company_id: string | null }> }).rows[0];
  return row?.company_id ?? null;
}

/**
 * Run `fn` inside a transaction with the tenant GUC set to `companyId`.
 *
 * This is the canonical entry point for any tenant-scoped read or write.
 * It guarantees that:
 *   * The GUC is set BEFORE any user query runs.
 *   * The GUC is automatically released when the transaction commits or
 *     rolls back (because we use SET LOCAL semantics).
 *   * RLS denies cross-tenant rows even if application code forgets a
 *     `where(eq(table.companyId, companyId))` clause.
 *
 * Belt + braces: callers should still pass `companyId` to repository helpers
 * so the application layer also enforces tenant scope at the SQL level.
 */
export async function withTenant<T>(
  db: DbClient,
  companyId: string,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await setTenant(tx, companyId);
    return fn(tx);
  });
}

/**
 * Assert that `companyId` matches the GUC currently set on the handle.
 * Used as a defense-in-depth check inside repository helpers.
 */
export async function assertTenant(handle: DbHandle, companyId: string): Promise<void> {
  const current = await getTenant(handle);
  if (current !== companyId) {
    throw new Error(
      `Tenant assertion failed: handle is bound to ${current ?? "<unset>"}, expected ${companyId}`,
    );
  }
}
