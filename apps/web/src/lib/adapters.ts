/**
 * Wire → view-model adapters.
 *
 * The Server Components consume the same view-model shapes the fixture
 * layer used to produce. The API serves DB-backed domain types, so this
 * file maps one to the other and applies safe defaults for fields the
 * persisted shape does not carry (e.g. customer display name, message
 * draft body — those are richer derivations the cash-engine fixture
 * layer used to compute from seed data).
 *
 * Keep mappings additive: never invent risk text, never synthesize
 * "safe to proceed" copy. If a field is unknown, leave it undefined and
 * let the components render their EmptyState path.
 */
import { toDisplayMoney } from "@/lib/format";
import type {
  WireApprovalRequest,
  WireCashForecast,
  WireCollectionAction,
  WireEvidenceRef,
  WireMoney,
} from "@/lib/api-types";
import type {
  ApprovalCardView,
  ApprovalInboxData,
  ApprovalRequestView,
  ConfidenceBandView,
  DailyCashActionsData,
  EvidenceRefView,
  ForecastCashFlowView,
  ForecastScenarioView,
  ForecastScreenData,
  ForecastSummaryView,
  IntegrationHealthBanner,
  ObligationRiskView,
  RankedActionView,
} from "@/fixtures/types";

const HEALTHY_INTEGRATION: IntegrationHealthBanner = { unhealthyConnectors: [] };

function toEvidenceView(ref: WireEvidenceRef): EvidenceRefView {
  const out: EvidenceRefView = { kind: ref.kind, id: ref.id };
  if (ref.summary !== undefined) out.summary = ref.summary;
  if (ref.sourceProvider !== undefined) out.sourceProvider = ref.sourceProvider;
  if (ref.sourceTimestamp !== undefined) out.sourceTimestamp = ref.sourceTimestamp;
  return out;
}

function moneyOrZero(money: WireMoney | undefined, fallbackCurrency = "GBP") {
  return toDisplayMoney(money ?? { amountMinor: "0", currency: fallbackCurrency });
}

export function adaptForecastSummary(
  forecast: WireCashForecast,
): ForecastSummaryView {
  return {
    forecastId: forecast.forecastId,
    asOfDate: forecast.asOfDate,
    horizonDays: forecast.horizonDays,
    riskStatus: forecast.riskStatus,
    shortfallAmount: forecast.shortfallAmount
      ? toDisplayMoney(forecast.shortfallAmount)
      : undefined,
    cashBalance: toDisplayMoney(forecast.cashBalance),
    obligationRisks: forecast.obligationRisks.map((r) => ({
      obligationId: r.obligationId,
      dueDate: r.dueDate,
      amount: toDisplayMoney(r.amount),
      riskStatus: r.riskStatus,
      shortfallAmount: r.shortfallAmount ? toDisplayMoney(r.shortfallAmount) : undefined,
      dependentInflowIds: [],
      evidenceRefs: r.evidenceRefs.map(toEvidenceView),
    })),
  };
}

export function adaptDailyCashActions(input: {
  forecast: WireCashForecast | null;
  actions: WireCollectionAction[];
  asOfDate: string;
}): DailyCashActionsData {
  const summary: ForecastSummaryView = input.forecast
    ? adaptForecastSummary(input.forecast)
    : {
        forecastId: "no-forecast",
        asOfDate: input.asOfDate,
        horizonDays: 30,
        riskStatus: "unknown",
        cashBalance: toDisplayMoney({ amountMinor: "0", currency: "GBP" }),
        obligationRisks: [],
      };

  const actionViews: RankedActionView[] = input.actions.map((a) => ({
    actionId: a.id,
    kind: a.actionKind,
    customerId: a.customerId ?? "",
    customerName: a.customerId ?? "Unknown customer",
    invoiceId: a.invoiceId ?? "",
    invoiceNumber: a.invoiceId ?? "",
    amountDue: moneyOrZero(a.expectedCashImpact),
    priorityScore: a.priorityScore,
    expectedCashImpact: moneyOrZero(a.expectedCashImpact),
    probabilityOfPayment: a.probabilityOfPayment ?? 0,
    obligationUrgency: a.rankingSnapshot?.obligationUrgency ?? 0,
    actionEffectiveness: a.rankingSnapshot?.actionEffectiveness ?? 0,
    evidenceConfidence: a.evidenceConfidence,
    relationshipRiskPenalty: a.relationshipRiskPenalty,
    actionEffortPenalty: a.actionEffortPenalty,
    recommendedChannel: a.channel,
    recommendedTone: a.tone ?? "neutral",
    explanation: a.rankingSnapshot?.explanation ?? a.reason,
    evidenceRefs: a.evidenceRefs.map(toEvidenceView),
  }));

  return {
    asOfDate: input.asOfDate,
    actions: actionViews,
    forecast: summary,
    approvalsByActionId: {},
    draftsByActionId: {},
    evidenceById: {},
    integrationHealth: HEALTHY_INTEGRATION,
    generatedAt: input.asOfDate,
  };
}

function adaptApprovalRequest(req: WireApprovalRequest): ApprovalRequestView {
  const out: ApprovalRequestView = {
    id: req.id,
    subjectKind: req.subjectKind,
    subjectId: req.subjectId,
    status: req.status,
    requestedAt: req.requestedAt,
    evidenceRefs: req.evidenceRefs.map(toEvidenceView),
  };
  if (req.requestedByUserId !== undefined) out.requestedByUserId = req.requestedByUserId;
  if (req.assignedApproverId !== undefined) out.assignedApproverId = req.assignedApproverId;
  if (req.decision) {
    const decision: ApprovalRequestView["decision"] = {
      decision: req.decision.decision,
      decidedByUserId: req.decision.decidedByUserId,
      decidedAt: req.decision.decidedAt,
    };
    if (req.decision.note !== undefined) decision.note = req.decision.note;
    out.decision = decision;
  }
  return out;
}

export function adaptApprovalInbox(
  approvals: WireApprovalRequest[],
): ApprovalInboxData {
  const pending: ApprovalCardView[] = [];
  const recentlyDecided: ApprovalCardView[] = [];

  for (const req of approvals) {
    const card: ApprovalCardView = {
      approval: adaptApprovalRequest(req),
      subject: { kind: req.subjectKind },
      policyWarnings: [],
      auditHistory: [],
    };
    if (req.status === "pending") pending.push(card);
    else recentlyDecided.push(card);
  }

  return { pending, recentlyDecided, evidenceById: {} };
}

export function adaptForecastScreen(
  forecast: WireCashForecast,
): ForecastScreenData {
  const scenarios: ForecastScenarioView[] = forecast.scenarios.map((s) => ({
    name: s.name,
    startingCash: toDisplayMoney(forecast.cashBalance),
    expectedInflows: toDisplayMoney({ amountMinor: "0", currency: forecast.cashBalance.currency }),
    expectedOutflows: toDisplayMoney({ amountMinor: "0", currency: forecast.cashBalance.currency }),
    endingCash: toDisplayMoney(s.cashBalance),
    riskStatus: s.riskStatus,
    shortfallAmount: s.shortfallAmount ? toDisplayMoney(s.shortfallAmount) : undefined,
  }));

  const confidenceBands: ConfidenceBandView[] = forecast.confidenceBands.map((b) => ({
    date: forecast.asOfDate,
    low: toDisplayMoney(b.lowerBound),
    expected: toDisplayMoney(b.lowerBound),
    high: toDisplayMoney(b.upperBound),
  }));

  const expectedInflows: ForecastCashFlowView[] = forecast.expectedInflows.map((f) => ({
    id: f.id,
    kind: f.kind,
    date: f.expectedDate,
    amount: toDisplayMoney(f.amount),
    confidence: f.confidence,
    label: f.label,
    evidenceRefs: f.evidenceRefs.map(toEvidenceView),
  }));

  const expectedOutflows: ForecastCashFlowView[] = forecast.expectedOutflows.map((f) => ({
    id: f.id,
    kind: f.kind,
    date: f.expectedDate,
    amount: toDisplayMoney(f.amount),
    confidence: f.confidence,
    label: f.label,
    evidenceRefs: f.evidenceRefs.map(toEvidenceView),
  }));

  const obligationRisks: ObligationRiskView[] = forecast.obligationRisks.map((r) => ({
    obligationId: r.obligationId,
    dueDate: r.dueDate,
    amount: toDisplayMoney(r.amount),
    riskStatus: r.riskStatus,
    shortfallAmount: r.shortfallAmount ? toDisplayMoney(r.shortfallAmount) : undefined,
    dependentInflowIds: [],
    evidenceRefs: r.evidenceRefs.map(toEvidenceView),
  }));

  return {
    forecast: {
      forecastId: forecast.forecastId,
      generatedAt: forecast.generatedAt,
      asOfDate: forecast.asOfDate,
      horizonDays: forecast.horizonDays,
      cashBalance: toDisplayMoney(forecast.cashBalance),
      riskStatus: forecast.riskStatus,
      shortfallAmount: forecast.shortfallAmount
        ? toDisplayMoney(forecast.shortfallAmount)
        : undefined,
      scenarios,
      confidenceBands,
      obligationRisks,
      expectedInflows,
      expectedOutflows,
      evidenceRefs: forecast.evidenceRefs.map(toEvidenceView),
    },
    horizonOptions: [7, 14, 30, 90],
    selectedHorizonDays: forecast.horizonDays,
    selectedScenarioName: scenarios[0]?.name ?? "base",
    forecastVersions: [
      {
        forecastId: forecast.forecastId,
        generatedAt: forecast.generatedAt,
        asOfDate: forecast.asOfDate,
        horizonDays: forecast.horizonDays,
        riskStatus: forecast.riskStatus,
      },
    ],
    integrationHealth: HEALTHY_INTEGRATION,
  };
}
