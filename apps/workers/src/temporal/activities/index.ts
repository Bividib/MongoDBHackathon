// Aggregated activity surface registered with the Temporal worker.
//
// The structure is: each activity is exported as a named function, and the
// aggregate object mirrors the names. Workflow code imports the *types*
// from this module via `proxyActivities<typeof activities>`.

export * from "./types.js";
export { initActivityContext, getActivityContext } from "./context.js";

export { getNow } from "./system.js";
export { cleanupExpiredIdempotencyKeys } from "./cleanup.js";
export { loadCompanyPolicy } from "./policy.js";
export { loadFinancialFactsForForecast } from "./facts.js";
export {
  computeCashForecast,
  rankCollectionsActions,
  recomputeCashForecast,
  rerankCollectionActions,
  replanForecast
} from "./forecast.js";
export {
  retrieveCustomerMemory,
  retrieveEvidenceForTopActions,
  validateEvidence
} from "./evidence.js";
export {
  classifyReply,
  draftCustomerActions,
  draftFollowUpIfNeeded,
  draftMessage,
  draftMessages,
  draftSupplierActions,
  extractPromise,
  loadCustomerMessage
} from "./messaging.js";
export {
  checkPaymentMatch,
  classifyPromiseOutcome,
  createOrUpdatePromise,
  loadPromise,
  updateCustomerReliability,
  upsertPromiseToPay
} from "./promises.js";
export { createApprovalRequest, createApprovalRequests } from "./approvals.js";
export {
  closeOrEscalate,
  computeShortfall,
  executeApprovedActions,
  identifyCollectableInvoices,
  identifySupplierTimingOptions,
  openCase,
  openEscalationCase,
  revokeExternalAction
} from "./case.js";
export {
  emitDomainEvent,
  writeAuditEvent,
  writeAuditEvents,
  writeMemoryAndAudit
} from "./audit.js";
