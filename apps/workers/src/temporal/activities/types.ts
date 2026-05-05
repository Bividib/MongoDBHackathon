// Activity input/output types.
//
// Activities return plain JSON-serialisable data because Temporal serialises
// activity arguments and results into history. We intentionally keep these
// shapes narrower than the full domain types — workflow code does not need
// the entire forecast payload, just the keys it branches on.
//
// Real implementations (Session 1+) will translate between repository
// surfaces and these activity shapes. The shapes are stable; the bodies are
// stubs in this round.

import type {
  ApprovalDecisionKind,
  ApprovalSubjectKind,
  PromiseType,
  RiskStatus
} from "@runwayops/domain";

export interface ActivityCommonInput {
  companyId: string;
  /**
   * Idempotency key for any mutation downstream. Workflow code derives this
   * from deterministic workflow inputs and step names. Activity bodies that
   * mutate must consult an `idempotency_keys` table keyed on this value.
   */
  idempotencyKey: string;
}

// ── system ────────────────────────────────────────────────────────────────

export interface GetNowOutput {
  nowIso: string;
}

// ── policy / facts ────────────────────────────────────────────────────────

export interface LoadCompanyPolicyInput {
  companyId: string;
}

export interface CompanyPolicySummary {
  companyId: string;
  highConfidenceThreshold: number;
  mediumConfidenceThreshold: number;
  approvalWindowMs: number;
  humanOverrideWindowMs: number;
  promiseGraceMs: number;
  caseReplanIntervalMs: number;
}

export interface LoadFinancialFactsInput {
  companyId: string;
  asOfDate: string;
  horizonDays: 7 | 14 | 30 | 90;
}

export interface FinancialFactsSummary {
  asOfDate: string;
  invoiceCount: number;
  pendingPromiseCount: number;
  obligationCount: number;
  cashBalanceMinor: number;
  currency: string;
}

// ── forecast / ranking ────────────────────────────────────────────────────

export interface ComputeCashForecastInput extends ActivityCommonInput {
  asOfDate: string;
  horizonDays: 7 | 14 | 30 | 90;
  triggerEventIds: string[];
}

export interface CashForecastSummary {
  forecastId: string;
  asOfDate: string;
  cashBalanceMinor: number;
  currency: string;
  riskStatus: RiskStatus;
  shortfallMinor?: number | undefined;
}

export interface RankCollectionsActionsInput extends ActivityCommonInput {
  forecastId: string;
  maxActions: number;
  asOfDate: string;
}

export interface RankedActionSummary {
  actionId: string;
  invoiceId: string;
  customerId: string;
  priorityScore: number;
  expectedCashImpactMinor: number;
  currency: string;
}

export interface RetrieveEvidenceInput extends ActivityCommonInput {
  actionIds: string[];
}

export interface EvidenceBundleSummary {
  actionId: string;
  evidenceRefIds: string[];
  evidenceConfidence: number;
}

// ── messaging / drafts ────────────────────────────────────────────────────

export interface DraftMessagesInput extends ActivityCommonInput {
  actionIds: string[];
}

export interface MessageDraftSummary {
  draftId: string;
  actionId: string;
  channel: "email" | "sms" | "phone" | "letter" | "portal";
  tone: "friendly" | "neutral" | "firm";
}

export interface DraftFollowUpInput extends ActivityCommonInput {
  messageEventId: string;
  promiseId?: string | undefined;
  classification: string;
}

export type DraftFollowUpOutput =
  | { kind: "skipped"; reason: string }
  | { kind: "drafted"; draft: MessageDraftSummary };

export interface DraftCustomerActionsInput extends ActivityCommonInput {
  caseId: string;
  invoiceIds: string[];
}

export interface DraftSupplierActionsInput extends ActivityCommonInput {
  caseId: string;
  supplierIds: string[];
}

// ── approvals ─────────────────────────────────────────────────────────────

export interface CreateApprovalRequestsInput extends ActivityCommonInput {
  subjects: Array<{
    subjectKind: ApprovalSubjectKind;
    subjectId: string;
    riskSummary: string;
  }>;
}

export interface ApprovalRequestSummary {
  approvalRequestId: string;
  subjectKind: ApprovalSubjectKind;
  subjectId: string;
  /** decision is undefined while pending; set after a signal arrives. */
  decision?: ApprovalDecisionKind | undefined;
}

// ── messages / replies ────────────────────────────────────────────────────

export interface LoadCustomerMessageInput {
  companyId: string;
  messageEventId: string;
}

export interface CustomerMessageSummary {
  messageEventId: string;
  customerId: string;
  threadId: string;
  bodyText: string;
  receivedAtIso: string;
}

export interface ClassifyReplyInput extends ActivityCommonInput {
  messageEventId: string;
  bodyText: string;
}

export interface ReplyClassificationSummary {
  classification: string;
  confidence: number;
  hasPromiseHint: boolean;
}

export interface ExtractPromiseInput extends ActivityCommonInput {
  messageEventId: string;
  bodyText: string;
  classification: string;
}

export interface PromiseExtractionSummary {
  hasPromise: boolean;
  promiseType?: PromiseType | undefined;
  amountPromisedMinor?: number | undefined;
  currency?: string | undefined;
  promisedDateIso?: string | undefined;
  conditionText?: string | undefined;
  cashConfidence: number;
}

export interface UpsertPromiseInput extends ActivityCommonInput {
  customerId: string;
  invoiceId?: string | undefined;
  messageEventId: string;
  extraction: PromiseExtractionSummary;
}

export interface PromiseSummary {
  promiseId: string;
  customerId: string;
  invoiceId?: string | undefined;
  promiseType: PromiseType;
  promisedDateIso?: string | undefined;
  outcome:
    | "pending"
    | "kept"
    | "partially_kept"
    | "late"
    | "broken"
    | "superseded"
    | "disputed";
}

// ── memory / evidence ─────────────────────────────────────────────────────

export interface RetrieveCustomerMemoryInput extends ActivityCommonInput {
  customerId: string;
}

export interface CustomerMemorySummary {
  customerId: string;
  averageDaysLate?: number;
  promiseKeptRate?: number;
  conditionalPromiseKeptRate?: number;
  preferredChannel?: "email" | "sms" | "phone" | "letter" | "portal";
}

export interface ValidateEvidenceInput extends ActivityCommonInput {
  evidenceRefIds: string[];
}

export interface EvidenceValidation {
  ok: boolean;
  reason?: string;
}

// ── promise monitoring ────────────────────────────────────────────────────

export interface LoadPromiseInput {
  companyId: string;
  promiseId: string;
}

export interface PromiseDetailSummary extends PromiseSummary {
  amountPromisedMinor?: number | undefined;
  currency?: string | undefined;
  graceUntilIso: string;
}

export interface CheckPaymentMatchInput extends ActivityCommonInput {
  promiseId: string;
}

export interface PaymentMatchSummary {
  matched: boolean;
  paymentId?: string | undefined;
  amountReceivedMinor?: number | undefined;
  currency?: string | undefined;
  paymentDateIso?: string | undefined;
  matchConfidence: number;
}

export interface ClassifyPromiseOutcomeInput extends ActivityCommonInput {
  promiseId: string;
  match: PaymentMatchSummary;
}

export interface PromiseOutcomeSummary {
  outcome: "kept" | "partially_kept" | "late" | "broken";
  shortfallMinor?: number | undefined;
  currency?: string | undefined;
}

export interface UpdateCustomerReliabilityInput extends ActivityCommonInput {
  customerId: string;
  promiseId: string;
  outcome: PromiseOutcomeSummary;
}

// ── case mode ─────────────────────────────────────────────────────────────

export interface OpenCaseInput extends ActivityCommonInput {
  caseId: string;
  obligationId: string;
}

export interface CaseRecordSummary {
  caseId: string;
  obligationId: string;
  openedAtIso: string;
}

export interface ComputeShortfallInput extends ActivityCommonInput {
  caseId: string;
  obligationId: string;
  asOfDate: string;
}

export interface ShortfallSummary {
  shortfallMinor: number;
  currency: string;
  riskStatus: RiskStatus;
}

export interface IdentifyCollectableInvoicesInput extends ActivityCommonInput {
  caseId: string;
  shortfallMinor: number;
  currency: string;
}

export interface CollectableInvoicesSummary {
  invoiceIds: string[];
  totalCollectableMinor: number;
  currency: string;
}

export interface IdentifySupplierTimingInput extends ActivityCommonInput {
  caseId: string;
  obligationId: string;
}

export interface SupplierTimingSummary {
  supplierIds: string[];
  totalDeferralMinor: number;
  currency: string;
}

export interface ReplanForecastInput extends ActivityCommonInput {
  caseId: string;
  asOfDate: string;
  triggerEventIds: string[];
}

export interface ExecuteApprovedActionsInput extends ActivityCommonInput {
  caseId: string;
  approvedActionIds: string[];
}

export interface ExecutionSummary {
  successfulActionIds: string[];
  failedActionIds: string[];
}

export interface RevokeExternalActionInput extends ActivityCommonInput {
  caseId: string;
  actionId: string;
  reason: string;
}

export interface OpenEscalationCaseInput extends ActivityCommonInput {
  fromPromiseId?: string;
  fromCaseId?: string;
  reason: string;
}

export interface CloseOrEscalateInput extends ActivityCommonInput {
  caseId: string;
  resolutionSummary: string;
  evidenceIds: string[];
  closedByUserId: string;
}

export interface CaseClosureSummary {
  caseId: string;
  status: "closed" | "escalated";
  closedAtIso: string;
}

// ── audit & domain events ─────────────────────────────────────────────────

export interface WriteAuditEventInput extends ActivityCommonInput {
  action: string;
  targetKind: string;
  targetId: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface AuditEventSummary {
  auditEventId: string;
}

export interface EmitDomainEventInput extends ActivityCommonInput {
  type: string;
  aggregateKind: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  causationEventId?: string;
}

export interface DomainEventEmissionSummary {
  eventId: string;
  type: string;
  occurredAtIso: string;
}
