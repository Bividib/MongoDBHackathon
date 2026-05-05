/**
 * Tenancy middleware — the chokepoint that protects everything else.
 *
 * Wraps tenant-scoped handlers in `withTenant(db, companyId, tx => ...)` so
 * the Postgres GUC `app.current_company_id` is set BEFORE any user query
 * runs and released on commit/rollback.
 *
 * Rejects requests without a resolvable tenant context with 401/403.
 */
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

import { createDb, createPool, type RunwayDb, repositories } from "@runwayops/db";

import { resolveRequestContext, type RequestContext } from "../lib/auth.js";

const { withTenant } = repositories;

declare module "fastify" {
  interface FastifyRequest {
    tenantCtx?: RequestContext;
  }
}

let _db: RunwayDb | null = null;

function getDb(): RunwayDb {
  if (!_db) {
    const connStr = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
    if (!connStr) {
      throw new Error("DATABASE_URL is required");
    }
    _db = createDb(createPool(connStr));
  }
  return _db;
}

function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL);
}

/**
 * onRequest hook: resolve tenant context or throw 401.
 * Throwing aborts the lifecycle and triggers the error handler.
 */
export async function tenancyGuard(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const dbHandle = hasDb() ? getDb() : null;
  const ctx = await resolveRequestContext(request, dbHandle);
  if (!ctx) {
    const err = new Error("Missing or invalid tenant context") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  request.tenantCtx = ctx;
}

/**
 * Error handler for the tenant-scoped encapsulated context.
 */
export function tenancyErrorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  const statusCode = error.statusCode ?? 500;
  reply.status(statusCode).send({
    ok: false,
    error: {
      code: statusCode === 401 ? "UNAUTHENTICATED" : "INTERNAL",
      message: error.message,
      statusCode,
    },
  });
}

/**
 * Execute `fn` inside a withTenant transaction. This is the canonical way
 * for handlers to interact with the database — RLS is guaranteed active.
 */
export async function withinTenant<T>(
  companyId: string,
  fn: (tx: repositories.DbTransaction) => Promise<T>,
): Promise<T> {
  return withTenant(getDb(), companyId, fn);
}

export function getDbInstance(): RunwayDb {
  return getDb();
}
