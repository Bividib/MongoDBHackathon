import type { GetNowOutput } from "./types.js";

/**
 * Workflow-safe clock. Workflow code cannot call `Date.now()` or
 * `new Date()`; it must call this activity. The real implementation will
 * wire to a controlled clock for tests and a system clock in production.
 */
export async function getNow(): Promise<GetNowOutput> {
  return { nowIso: new Date().toISOString() };
}
