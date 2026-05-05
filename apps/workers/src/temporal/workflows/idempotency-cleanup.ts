import { proxyActivities, sleep } from "@temporalio/workflow";

import type { cleanupExpiredIdempotencyKeys } from "../activities/cleanup.js";
import { RETRY_TRANSIENT } from "../retry-policies.js";

const cleanupActs = proxyActivities<{
  cleanupExpiredIdempotencyKeys: typeof cleanupExpiredIdempotencyKeys;
}>({
  startToCloseTimeout: "2 minutes",
  scheduleToCloseTimeout: "5 minutes",
  retry: RETRY_TRANSIENT
});

/**
 * Periodic idempotency-key TTL cleanup workflow.
 *
 * Runs indefinitely with a 1-hour sleep between cleanup passes.
 * Schedule this via Temporal's cron schedule or the schedules API:
 *
 *   workflowId: "idempotency-cleanup"
 *   cronSchedule: "0 * * * *"   // every hour
 *
 * Alternatively, this workflow sleeps internally so it can be started
 * once and left running.
 */
export async function IdempotencyCleanupWorkflow(): Promise<void> {
  const ONE_HOUR_MS = 60 * 60 * 1000;

  // Infinite loop — Temporal handles persistence across deploys
  while (true) {
    await cleanupActs.cleanupExpiredIdempotencyKeys();
    await sleep(ONE_HOUR_MS);
  }
}
