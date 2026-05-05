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

export {
  type InvoiceRow,
  listOpenInvoicesForCompany,
  listOverdueInvoicesForCompany,
  getInvoiceById,
} from "./invoices.js";

export {
  type PaymentRow,
  listRecentPaymentsForCompany,
  listPaymentsForInvoice,
  getPaymentById,
} from "./payments.js";

export {
  type BankAccountRow,
  type BankTransactionRow,
  getTotalCashBalance,
  listRecentBankTransactionsForCompany,
  listBankAccountsForCompany,
} from "./bank.js";

export {
  type CriticalObligationRow,
  listOpenCriticalObligationsForCompany,
  getCriticalObligationById,
} from "./critical-obligations.js";

export {
  getCashEnginePolicyForCompany,
} from "./company-policy.js";

export {
  type ForecastFactInputs,
  type LoadForecastFactsInput,
  loadFinancialFactsForForecast,
} from "./forecast-facts.js";

export {
  type IntegrationTokenRow,
  type IntegrationTokenType,
  type IntegrationTokenView,
  type UpsertIntegrationTokenInput,
  upsertIntegrationToken,
  getIntegrationToken,
  getIntegrationTokenPair,
} from "./integration-tokens.js";

export {
  type IntegrationConnectionRow,
  type SyncJobRow,
  type BeginSyncJobInput,
  type CompleteSyncJobInput,
  type FailSyncJobInput,
  listActiveConnectionsForCompany,
  getIntegrationConnectionById,
  beginSyncJob,
  completeSyncJob,
  failSyncJob,
} from "./integrations.js";
