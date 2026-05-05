/**
 * Shared activity context: DB client, AI model router, and logger.
 *
 * Activities are instantiated once per worker boot. The worker bootstrap
 * constructs this context and passes it to the activity factory. Activity
 * bodies close over it.
 *
 * This module is NOT imported by workflow code — it is an activity-only
 * dependency.
 */
import { createDb, createPool } from "@runwayops/db";
import type { RunwayDb } from "@runwayops/db";
import type { ModelRouter } from "@runwayops/ai";
import { MockModelRouter } from "@runwayops/ai";

export interface ActivityContext {
  db: RunwayDb;
  ai: ModelRouter;
}

let _ctx: ActivityContext | undefined;

/**
 * Initialize the shared activity context. Called once at worker boot.
 * For tests, pass a pre-built context; for production, omit to use env defaults.
 */
export function initActivityContext(overrides?: Partial<ActivityContext>): ActivityContext {
  const pool = overrides?.db ? undefined : createPool(process.env.DATABASE_URL);
  const db = overrides?.db ?? createDb(pool!);
  const ai = overrides?.ai ?? new MockModelRouter();
  _ctx = { db, ai };
  return _ctx;
}

export function getActivityContext(): ActivityContext {
  if (!_ctx) {
    throw new Error("Activity context not initialized. Call initActivityContext() at worker boot.");
  }
  return _ctx;
}
