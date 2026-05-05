// Activity proxies used by all workflows.
//
// The proxy is created with policy = RETRY_TRANSIENT (the default for
// idempotent reads and idempotent mutations). Workflows that need a
// different disposition for a specific activity create a second proxy
// with the appropriate policy and call from there. This makes the
// disposition explicit at the call site rather than buried in retry
// metadata.
//
// `import type` ONLY: pulls activity function signatures into workflow
// scope without importing activity bodies (which would violate the
// determinism rule).

import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "../activities/index.js";
import { FAIL_FAST, RETRY_COMPENSATE_BOUNDED, RETRY_TRANSIENT } from "../retry-policies.js";

const ONE_MINUTE = "1 minute" as const;
const FIVE_MINUTES = "5 minutes" as const;

/**
 * Default proxy: RETRY disposition. Use for pure reads, idempotent
 * mutations, and AI calls.
 */
export const acts = proxyActivities<typeof activities>({
  startToCloseTimeout: FIVE_MINUTES,
  scheduleToCloseTimeout: "1 hour",
  retry: RETRY_TRANSIENT
});

/**
 * FAIL_FAST proxy: validation errors and side-effecting calls that must
 * not double-apply. The workflow handles failures by transitioning to a
 * paused-for-human state.
 */
export const failFastActs = proxyActivities<typeof activities>({
  startToCloseTimeout: ONE_MINUTE,
  scheduleToCloseTimeout: ONE_MINUTE,
  retry: FAIL_FAST
});

/**
 * COMPENSATE proxy: bounded retries for compensating activities like
 * `revokeExternalAction`.
 */
export const compensateActs = proxyActivities<typeof activities>({
  startToCloseTimeout: FIVE_MINUTES,
  scheduleToCloseTimeout: "10 minutes",
  retry: RETRY_COMPENSATE_BOUNDED
});
