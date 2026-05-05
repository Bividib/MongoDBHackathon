import type {
  CurrencyCode,
  EvidenceRef,
  InvoiceStatus,
  Money,
  PaymentProviderStatus,
  PromiseOutcome,
  PromiseType,
  RiskStatus
} from "@runwayops/domain";

export type {
  CurrencyCode,
  EvidenceRef,
  InvoiceStatus,
  Money,
  PaymentProviderStatus,
  PromiseOutcome,
  PromiseType,
  RiskStatus
} from "@runwayops/domain";

export type DateInput = Date | string;

// Cash-engine inputs are explicit projections over the domain model. They use
// shared domain primitives but stay small enough for deterministic forecast tests
// and integration adapters.
export type Invoice = {
  id: string;
  companyId: string;
  customerId: string;
  customerName?: string;
  invoiceNumber?: string;
  issueDate: DateInput;
  dueDate: DateInput;
  status: InvoiceStatus;
  amountDue: Money;
  amountPaid?: Money;
  evidenceRefs?: EvidenceRef[];
};

export type Payment = {
  id: string;
  companyId: string;
  customerId?: string | undefined;
  invoiceId?: string | undefined;
  paymentDate: DateInput;
  amount: Money;
  providerStatus?: Extract<PaymentProviderStatus, "pending" | "posted" | "failed" | "reversed" | "settled">;
  evidenceRefs?: EvidenceRef[];
};

export type BankTransaction = {
  id: string;
  companyId: string;
  postedDate: DateInput;
  amount: Money;
  direction: "credit" | "debit";
  counterpartyName?: string;
  reference?: string;
  providerTransactionId?: string;
  idempotencyKey?: string;
  knownPayerAccountId?: string;
  paymentLinkEventId?: string;
  status?: "pending" | "posted" | "cancelled" | "reversed";
  evidenceRefs?: EvidenceRef[];
};

export type Criticality = "low" | "medium" | "high" | "critical";

export type CriticalObligation = {
  id: string;
  companyId: string;
  obligationType: "payroll" | "tax" | "rent" | "loan" | "supplier" | "contractor" | "other";
  counterpartyName: string;
  dueDate: DateInput;
  amount: Money;
  criticality: Criticality;
  status: "scheduled" | "paid" | "cancelled" | "due" | "deferred" | "overdue";
  evidenceRefs?: EvidenceRef[];
};

export type SupplierBill = {
  id: string;
  companyId: string;
  supplierId?: string;
  supplierName: string;
  dueDate: DateInput;
  amount: Money;
  criticality?: Criticality;
  status: "open" | "scheduled" | "paid" | "void";
  evidenceRefs?: EvidenceRef[];
};

export type PromiseToPay = {
  id: string;
  companyId: string;
  customerId: string;
  invoiceId?: string;
  sourceMessageId?: string;
  amountPromised?: Money;
  promisedDate?: DateInput;
  promiseType: PromiseType;
  conditionText?: string;
  extractedText: string;
  confidenceAtCreation?: number;
  evidenceConfidence?: number;
  evidenceRefs: EvidenceRef[];
  outcome: PromiseOutcome;
  actualPaymentDate?: DateInput;
  actualAmountReceived?: Money;
  matchedPaymentId?: string;
  createdAt?: DateInput;
  createdBy: "ai" | "human";
  approvedByUserId?: string;
};

export type CustomerPaymentStats = {
  customerId: string;
  averageDaysLate?: number;
  promiseKeptRate?: number;
  conditionalPromiseKeptRate?: number;
  disputeRate?: number;
  paymentAfterActionRate?: number;
  brokenPromiseCount?: number;
  lastSuccessfulChannel?: "email" | "sms" | "phone" | "letter" | "portal";
  lastSuccessfulTone?: "friendly" | "neutral" | "firm";
  relationshipRisk?: number;
  actionEffectiveness?: Partial<Record<CollectionActionKind, number>>;
  evidenceRefs?: EvidenceRef[];
};

export type CashEnginePolicy = {
  highConfidenceThreshold: number;
  mediumConfidenceThreshold: number;
  criticalObligationWindowDays: number;
  watchObligationWindowDays: number;
  immediateInterventionWindowDays: number;
  defaultInvoiceConfidence: number;
  staleInvoiceConfidence: number;
  materialShortfallAmount?: Money;
};

export type ForecastCashFlowKind =
  | "invoice"
  | "promise"
  | "payment"
  | "bank_transaction"
  | "supplier_bill"
  | "critical_obligation";

export type ForecastCashFlow = {
  id: string;
  kind: ForecastCashFlowKind;
  sourceId: string;
  date: DateInput;
  amount: Money;
  confidence: number;
  customerId?: string | undefined;
  invoiceId?: string | undefined;
  promiseId?: string | undefined;
  obligationId?: string | undefined;
  evidenceRefs: EvidenceRef[];
  label?: string | undefined;
};

export type ConfidenceBand = {
  date: DateInput;
  low: Money;
  expected: Money;
  high: Money;
  evidenceRefs: EvidenceRef[];
};

export type ForecastScenario = {
  name: "conservative" | "base" | "optimistic";
  startingCash: Money;
  expectedInflows: Money;
  expectedOutflows: Money;
  endingCash: Money;
  riskStatus: RiskStatus;
  shortfallAmount?: Money | undefined;
};

export type ObligationCoverageStatus =
  | "covered_by_actual"
  | "covered_by_high_confidence"
  | "dependent_on_medium_confidence"
  | "shortfall_actionable"
  | "shortfall_unavoidable";

export type ObligationRisk = {
  obligationId: string;
  dueDate: DateInput;
  amount: Money;
  riskStatus: RiskStatus;
  coverageStatus: ObligationCoverageStatus;
  shortfallAmount?: Money | undefined;
  dependentInflowIds: string[];
  evidenceRefs: EvidenceRef[];
};

export type CashForecast = {
  forecastId: string;
  companyId: string;
  generatedAt: Date;
  asOfDate: Date;
  horizonDays: 7 | 14 | 30 | 90;
  triggerEventIds: string[];
  cashBalance: Money;
  expectedInflows: ForecastCashFlow[];
  confidenceWeightedInflows: ForecastCashFlow[];
  expectedOutflows: ForecastCashFlow[];
  riskStatus: RiskStatus;
  scenarios: ForecastScenario[];
  confidenceBands: ConfidenceBand[];
  shortfallAmount?: Money | undefined;
  obligationRisks: ObligationRisk[];
  evidenceRefs: EvidenceRef[];
};

export type ComputeCashForecastInput = {
  forecastId?: string;
  companyId: string;
  generatedAt?: DateInput;
  asOfDate: DateInput;
  horizonDays: 7 | 14 | 30 | 90;
  triggerEventIds?: string[];
  cashBalance: Money;
  invoices?: Invoice[];
  payments?: Payment[];
  promises?: PromiseToPay[];
  supplierBills?: SupplierBill[];
  criticalObligations?: CriticalObligation[];
  customerStats?: CustomerPaymentStats[];
  bankTransactions?: BankTransaction[];
  policy?: Partial<CashEnginePolicy> | undefined;
};

/**
 * Engine-internal intent vocabulary. Distinct from
 * @runwayops/domain `CollectionActionKind` — this set lists what the
 * deterministic ranker can output. The mapper in `domain-mappers.ts`
 * translates these to the domain canonical kinds before persistence.
 */
export type CollectionActionKind =
  | "send_payment_reminder"
  | "request_partial_payment"
  | "confirm_promise"
  | "resolve_dispute"
  | "manual_review_paid_claim"
  | "phone_follow_up";

/**
 * Ephemeral output of the ranker. Recomputed every tick. Carries the inputs
 * to ranking (priorityScore, factors, penalties) and a stable candidate key
 * (actionId is a deterministic hash of company+customer+invoice+kind+day —
 * NOT a UUID and NOT a persisted entity id). Convert to a persisted
 * domain CollectionAction via `toDomainCollectionActionDraft` at selection
 * time.
 */
export type RankedCollectionActionCandidate = {
  actionId: string;
  kind: CollectionActionKind;
  companyId: string;
  customerId: string;
  invoiceId: string;
  priorityScore: number;
  expectedCashImpact: Money;
  probabilityOfPayment: number;
  obligationUrgency: number;
  actionEffectiveness: number;
  evidenceConfidence: number;
  relationshipRiskPenalty: number;
  actionEffortPenalty: number;
  recommendedChannel: "email" | "sms" | "phone" | "letter" | "portal";
  recommendedTone: "friendly" | "neutral" | "firm";
  explanation: string;
  evidenceRefs: EvidenceRef[];
};

/**
 * Backwards-compatible alias for the pre-split shape. New code should
 * reference `RankedCollectionActionCandidate` directly.
 */
export type RankedCollectionAction = RankedCollectionActionCandidate;

export type RankNextBestActionsInput = {
  companyId: string;
  asOfDate: DateInput;
  invoices: Invoice[];
  promises?: PromiseToPay[];
  customerStats?: CustomerPaymentStats[];
  forecast?: CashForecast;
  nearTermShortfall?: Money;
  policy?: Partial<CashEnginePolicy>;
  maxActions?: number;
};

export type PaymentMatchCandidate = {
  bankTransactionId: string;
  invoiceId?: string;
  promiseId?: string | undefined;
  confidence: number;
  matchingFactors: string[];
  requiresManualReview: boolean;
};

export type RankPaymentMatchCandidatesInput = {
  bankTransaction: BankTransaction;
  invoices?: Invoice[];
  promises?: PromiseToPay[];
  manualReviewThreshold?: number;
};

export type DedupedBankTransactions = {
  unique: BankTransaction[];
  duplicates: BankTransaction[];
};
