export {
  type DbHandle,
  type DbClient,
  type DbTransaction,
  setTenant,
  getTenant,
  withTenant,
  assertTenant,
} from "./tenant.js";

export {
  type EnqueueOutboxInput,
  type OutboxEventRow,
  enqueueOutbox,
} from "./outbox.js";

export {
  type IdempotencyKeyRow,
  type ReserveInput,
  type ReserveResult,
  type CompleteInput,
  reserveIdempotencyKey,
  completeIdempotencyKey,
} from "./idempotency.js";

export {
  type SourceObjectRow,
  type UpsertSourceObjectInput,
  type UpsertSourceObjectResult,
  upsertSourceObject,
} from "./source.js";

export {
  type AppendAuditEventInput,
  type AuditEventRow,
  appendAuditEvent,
  listAuditEventsForTarget,
  listAuditEventsByCorrelation,
} from "./audit.js";

export {
  type PromiseRow,
  type RecordPromiseOutcomeInput,
  insertPromise,
  getPromiseById,
  listPendingPromisesForCompany,
  recordPromiseOutcome,
  rowToPromise,
} from "./promises.js";

export {
  type CashForecastRow,
  type ForecastScenarioRow,
  type InsertForecastInput,
  insertCashForecast,
  getLatestForecast,
  listForecastsForCompany,
  rowToCashForecast,
} from "./forecasts.js";

export {
  type ApprovalRequestRow,
  type ApprovalDecisionRow,
  type CreateApprovalRequestInput,
  type RecordApprovalDecisionInput,
  createApprovalRequest,
  recordApprovalDecision,
  getApprovalRequestById,
  listPendingApprovalsForCompany,
} from "./approvals.js";

export {
  type CollectionActionRow,
  type CollectionActionResultRow,
  type InsertCollectionActionInput,
  insertCollectionAction,
  transitionCollectionActionStatus,
  getCollectionActionById,
  listActionsByStatus,
  recordExecutionResult,
  listExecutionResultsForAction,
} from "./collection-actions.js";
