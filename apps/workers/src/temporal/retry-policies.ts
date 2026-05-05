import type { RetryPolicy } from "@temporalio/common";

/**
 * Named retry policies referenced by workflow code at activity call sites.
 *
 * The disposition taxonomy (RETRY / FAIL_FAST / COMPENSATE / HUMAN_INTERVENTION)
 * lives in `docs/workflows.md`. This file is the binding from disposition to
 * Temporal `RetryPolicy`. Compensation and human-intervention dispositions are
 * implemented as workflow control flow on top of FAIL_FAST policies; a retry
 * policy alone cannot express "undo and pause."
 */

const SECOND = 1000;

/**
 * RETRY: transient failures. Default policy for pure reads and idempotent
 * mutations.
 */
export const RETRY_TRANSIENT: RetryPolicy = {
  initialInterval: 1 * SECOND,
  backoffCoefficient: 2,
  maximumInterval: 60 * SECOND,
  maximumAttempts: 10,
  nonRetryableErrorTypes: [
    "ValidationError",
    "PolicyViolationError",
    "InvalidArgumentError"
  ]
};

/**
 * FAIL_FAST: programmer or input errors. The activity is attempted once;
 * any failure surfaces immediately to the workflow, which transitions to
 * a paused-for-human state.
 */
export const FAIL_FAST: RetryPolicy = {
  initialInterval: 1 * SECOND,
  backoffCoefficient: 1,
  maximumInterval: 1 * SECOND,
  maximumAttempts: 1
};

/**
 * COMPENSATE: side effect was partially applied and must be undone. The
 * compensating activity itself uses RETRY_COMPENSATE_BOUNDED; the original
 * activity that emits the side effect uses FAIL_FAST so we don't double-apply
 * on retry. If the compensation fails its bounded retries the workflow
 * falls through to HUMAN_INTERVENTION.
 */
export const RETRY_COMPENSATE_BOUNDED: RetryPolicy = {
  initialInterval: 2 * SECOND,
  backoffCoefficient: 2,
  maximumInterval: 30 * SECOND,
  maximumAttempts: 3,
  nonRetryableErrorTypes: ["ValidationError", "PolicyViolationError"]
};

/**
 * HUMAN_INTERVENTION: not a retry policy on its own. Activities that fail in
 * a way that requires operator action must use FAIL_FAST; the workflow then
 * conditions on a `human_override` / `case_close_request` style signal.
 *
 * Re-exported here so workflow code can read a single import for taxonomy.
 */
export const HUMAN_INTERVENTION: RetryPolicy = FAIL_FAST;

/**
 * Named map for lookup by activity name. Workflows may use this to apply
 * the right policy without spreading literals throughout the file. Keys
 * mirror activity names exactly.
 */
export const ACTIVITY_RETRY_POLICY = {
  // Pure reads (RETRY)
  loadCompanyPolicy: RETRY_TRANSIENT,
  loadFinancialFactsForForecast: RETRY_TRANSIENT,
  loadCustomerMessage: RETRY_TRANSIENT,
  loadPromise: RETRY_TRANSIENT,
  retrieveCustomerMemory: RETRY_TRANSIENT,
  retrieveEvidenceForTopActions: RETRY_TRANSIENT,
  // AI calls (RETRY — idempotent functions of input)
  classifyReply: RETRY_TRANSIENT,
  extractPromise: RETRY_TRANSIENT,
  draftMessage: RETRY_TRANSIENT,
  draftMessages: RETRY_TRANSIENT,
  draftCustomerActions: RETRY_TRANSIENT,
  draftSupplierActions: RETRY_TRANSIENT,
  draftFollowUpIfNeeded: RETRY_TRANSIENT,
  // Deterministic engine wrappers (RETRY — failure is upstream load failure)
  computeCashForecast: RETRY_TRANSIENT,
  rankCollectionsActions: RETRY_TRANSIENT,
  rerankCollectionActions: RETRY_TRANSIENT,
  recomputeCashForecast: RETRY_TRANSIENT,
  replanForecast: RETRY_TRANSIENT,
  identifyCollectableInvoices: RETRY_TRANSIENT,
  identifySupplierTimingOptions: RETRY_TRANSIENT,
  computeShortfall: RETRY_TRANSIENT,
  checkPaymentMatch: RETRY_TRANSIENT,
  classifyPromiseOutcome: RETRY_TRANSIENT,
  // Idempotent mutations (RETRY)
  upsertPromiseToPay: RETRY_TRANSIENT,
  createOrUpdatePromise: RETRY_TRANSIENT,
  createApprovalRequest: RETRY_TRANSIENT,
  createApprovalRequests: RETRY_TRANSIENT,
  updateCustomerReliability: RETRY_TRANSIENT,
  openCase: RETRY_TRANSIENT,
  closeOrEscalate: RETRY_TRANSIENT,
  writeAuditEvent: RETRY_TRANSIENT,
  writeAuditEvents: RETRY_TRANSIENT,
  writeMemoryAndAudit: RETRY_TRANSIENT,
  emitDomainEvent: RETRY_TRANSIENT,
  getNow: RETRY_TRANSIENT,
  // FAIL_FAST
  validateEvidence: FAIL_FAST,
  // COMPENSATE/HUMAN_INTERVENTION dispositions: see workflow code for the
  // control-flow that wraps these.
  executeApprovedActions: FAIL_FAST,
  revokeExternalAction: RETRY_COMPENSATE_BOUNDED,
  openEscalationCase: HUMAN_INTERVENTION
} as const satisfies Record<string, RetryPolicy>;

export type ActivityName = keyof typeof ACTIVITY_RETRY_POLICY;
