/**
 * Screen-level view-model types consumed by pages and components.
 * These mirror the ui-product-flow.md data contracts but use
 * DisplayMoney (string-based) so they are RSC-serialisable.
 */
import type { DisplayMoney } from "@/lib/format";

/* ---------- shared ---------- */

export type EvidenceRefView = {
  kind: string;
  id: string;
  summary?: string;
  sourceProvider?: string;
  sourceTimestamp?: string;
};

export type AuditEventView = {
  id: string;
  actorType: string;
  actorId?: string;
  action: string;
  targetKind: string;
  targetId: string;
  occurredAt: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  evidenceRefs: EvidenceRefView[];
  correlationId?: string;
};

export type IntegrationHealthBanner = {
  unhealthyConnectors: Array<{
    provider: string;
    lastSuccessfulSyncAt?: string;
    status: string;
  }>;
};

export type MessageDraftView = {
  draftId: string;
  channel: string;
  tone: string;
  subject?: string;
  bodyMarkdown: string;
  generatedAt: string;
  evidenceRefs: EvidenceRefView[];
};

export type ApprovalRequestView = {
  id: string;
  subjectKind: string;
  subjectId: string;
  status: string;
  requestedByUserId?: string;
  assignedApproverId?: string;
  requestedAt: string;
  evidenceRefs: EvidenceRefView[];
  decision?: {
    decision: string;
    decidedByUserId: string;
    decidedAt: string;
    note?: string;
  };
};

export type PolicyWarningView = {
  severity: "info" | "warn" | "block";
  ruleId: string;
  message: string;
  evidenceRefs: EvidenceRefView[];
};

/* ---------- Daily Cash Actions ---------- */

export type RankedActionView = {
  actionId: string;
  kind: string;
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceNumber: string;
  amountDue: DisplayMoney;
  priorityScore: number;
  expectedCashImpact: DisplayMoney;
  probabilityOfPayment: number;
  obligationUrgency: number;
  actionEffectiveness: number;
  evidenceConfidence: number;
  relationshipRiskPenalty: number;
  actionEffortPenalty: number;
  recommendedChannel: string;
  recommendedTone: string;
  explanation: string;
  evidenceRefs: EvidenceRefView[];
};

export type ForecastSummaryView = {
  forecastId: string;
  asOfDate: string;
  horizonDays: number;
  riskStatus: string;
  shortfallAmount?: DisplayMoney;
  cashBalance: DisplayMoney;
  obligationRisks: ObligationRiskView[];
};

export type DailyCashActionsData = {
  asOfDate: string;
  actions: RankedActionView[];
  forecast: ForecastSummaryView;
  approvalsByActionId: Record<string, ApprovalRequestView | undefined>;
  draftsByActionId: Record<string, MessageDraftView | undefined>;
  evidenceById: Record<string, EvidenceRefView>;
  integrationHealth: IntegrationHealthBanner;
  generatedAt: string;
};

/* ---------- Approval Inbox ---------- */

export type ApprovalSubjectView = {
  kind: string;
  draft?: MessageDraftView;
  collectionActionId?: string;
  customerId?: string;
  customerName?: string;
  invoiceId?: string;
};

export type ApprovalCardView = {
  approval: ApprovalRequestView;
  subject: ApprovalSubjectView;
  policyWarnings: PolicyWarningView[];
  auditHistory: AuditEventView[];
};

export type ApprovalInboxData = {
  pending: ApprovalCardView[];
  recentlyDecided: ApprovalCardView[];
  evidenceById: Record<string, EvidenceRefView>;
};

/* ---------- Forecast ---------- */

export type ObligationRiskView = {
  obligationId: string;
  obligationType?: string;
  counterpartyName?: string;
  dueDate: string;
  amount: DisplayMoney;
  riskStatus: string;
  coverageStatus?: string;
  shortfallAmount?: DisplayMoney;
  dependentInflowIds: string[];
  evidenceRefs: EvidenceRefView[];
};

export type ForecastCashFlowView = {
  id: string;
  kind: string;
  date: string;
  amount: DisplayMoney;
  confidence: number;
  label?: string;
  evidenceRefs: EvidenceRefView[];
};

export type ConfidenceBandView = {
  date: string;
  low: DisplayMoney;
  expected: DisplayMoney;
  high: DisplayMoney;
};

export type ForecastScenarioView = {
  name: string;
  startingCash: DisplayMoney;
  expectedInflows: DisplayMoney;
  expectedOutflows: DisplayMoney;
  endingCash: DisplayMoney;
  riskStatus: string;
  shortfallAmount?: DisplayMoney;
};

export type ForecastVersionView = {
  forecastId: string;
  generatedAt: string;
  asOfDate: string;
  horizonDays: number;
  riskStatus: string;
};

export type ForecastScreenData = {
  forecast: {
    forecastId: string;
    generatedAt: string;
    asOfDate: string;
    horizonDays: number;
    cashBalance: DisplayMoney;
    riskStatus: string;
    shortfallAmount?: DisplayMoney;
    scenarios: ForecastScenarioView[];
    confidenceBands: ConfidenceBandView[];
    obligationRisks: ObligationRiskView[];
    expectedInflows: ForecastCashFlowView[];
    expectedOutflows: ForecastCashFlowView[];
    evidenceRefs: EvidenceRefView[];
  };
  horizonOptions: number[];
  selectedHorizonDays: number;
  selectedScenarioName: string;
  forecastVersions: ForecastVersionView[];
  integrationHealth: IntegrationHealthBanner;
};
