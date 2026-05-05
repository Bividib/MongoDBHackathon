import type { GetNowOutput } from "./types.js";

/**
 * Workflow-safe clock. Workflow code cannot call `Date.now()` or
 * `new Date()`; it must call this activity.
 */
export async function getNow(): Promise<GetNowOutput> {
  return { nowIso: new Date().toISOString() };
}
