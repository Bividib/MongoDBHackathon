/**
 * Fixture layer: calls cash-engine functions with seed data,
 * then maps results into RSC-serialisable view models.
 *
 * This file runs server-side only.
 */
import {
  computeCashForecast,
  rankNextBestActions,
  money,
} from "@runwayops/cash-engine";

import { toDisplayMoney, formatDate } from "@/lib/format";
import type {
  DailyCashActionsData,
  ApprovalInboxData,
  ForecastScreenData,
  RankedActionView,
  ForecastSummaryView,
  ApprovalCardView,
  ApprovalRequestView,
  MessageDraftView,
  AuditEventView,
  EvidenceRefView,
  ObligationRiskView,
  ForecastCashFlowView,
  ConfidenceBandView,
  ForecastScenarioView,
  PolicyWarningView,
  IntegrationHealthBanner,
} from "./types";

import {
  invoices,
  invoicesById,
  promises,
  customerStats,
  obligations,
  supplierBills,
  bankTransactions,
  customersById,
  customers,
  AS_OF_DATE,
  COMPANY,
} from "./seed";

/* ------------------------------------------------------------------ */
/*  Compute via cash-engine                                           */
/* ------------------------------------------------------------------ */

const cashBalance = money(3_200_000, "GBP");

const forecast = computeCashForecast({
  companyId: COMPANY.id,
  asOfDate: AS_OF_DATE,
  horizonDays: 30,
  cashBalance,
  invoices,
  promises,
  supplierBills,
  criticalObligations: obligations,
  customerStats,
  bankTransactions,
});

const rankedActions = rankNextBestActions({
  companyId: COMPANY.id,
  asOfDate: AS_OF_DATE,
  invoices,
  promises,
  customerStats,
  forecast,
  maxActions: 5,
});

/* ------------------------------------------------------------------ */
/*  Helper: convert engine evidence refs                               */
/* ------------------------------------------------------------------ */

function toEvidenceView(ref: { kind: string; id: string; summary?: string; sourceProvider?: string; sourceTimestamp?: string | Date }): EvidenceRefView {
  return {
    kind: ref.kind,
    id: ref.id,
    summary: ref.summary,
    sourceProvider: ref.sourceProvider,
    sourceTimestamp: ref.sourceTimestamp instanceof Date
      ? ref.sourceTimestamp.toISOString()
      : ref.sourceTimestamp,
  };
}

/* ------------------------------------------------------------------ */
/*  Build all evidence index                                          */
/* ------------------------------------------------------------------ */

function buildEvidenceIndex(): Record<string, EvidenceRefView> {
  const map: Record<string, EvidenceRefView> = {};
  for (const action of rankedActions) {
    for (const ref of action.evidenceRefs) {
      map[ref.id] = toEvidenceView(ref);
    }
  }
  for (const ref of forecast.evidenceRefs) {
    map[ref.id] = toEvidenceView(ref);
  }
  return map;
}

const evidenceIndex = buildEvidenceIndex();

/* ------------------------------------------------------------------ */
/*  Mock: message drafts per action                                   */
/* ------------------------------------------------------------------ */

function makeDraft(actionId: string, inv: typeof invoices[0], channel: string, tone: string): MessageDraftView {
  const cust = customersById[inv.customerId];
  return {
    draftId: `draft-${actionId}`,
    channel,
    tone,
    subject: `Re: Invoice ${inv.invoiceNumber ?? inv.id}`,
    bodyMarkdown: `Dear ${cust?.displayName ?? "Customer"},\n\nThis is a reminder regarding invoice **${inv.invoiceNumber ?? inv.id}** for **${toDisplayMoney(inv.amountDue).formatted}**, which is now overdue.\n\nPlease arrange payment at your earliest convenience.\n\nKind regards,\nMeridian Tech Solutions`,
    generatedAt: AS_OF_DATE.toISOString(),
    evidenceRefs: (inv.evidenceRefs ?? []).map(toEvidenceView),
  };
}

/* ------------------------------------------------------------------ */
/*  Mock: approval requests                                           */
/* ------------------------------------------------------------------ */

function makeApproval(actionId: string, status: string): ApprovalRequestView {
  return {
    id: `apr-${actionId}`,
    subjectKind: "external_message",
    subjectId: actionId,
    status,
    requestedByUserId: "user-operator-01",
    requestedAt: AS_OF_DATE.toISOString(),
    evidenceRefs: [{ kind: "collection_action", id: actionId }],
  };
}

/* ------------------------------------------------------------------ */
/*  Mock: audit events                                                */
/* ------------------------------------------------------------------ */

function makeAuditEvents(actionId: string, approved: boolean): AuditEventView[] {
  const base: AuditEventView = {
    id: `audit-${actionId}-req`,
    actorType: "user",
    actorId: "user-operator-01",
    action: "approval.requested",
    targetKind: "collection_action",
    targetId: actionId,
    occurredAt: AS_OF_DATE.toISOString(),
    summary: "Approval requested for collection action",
    evidenceRefs: [{ kind: "collection_action", id: actionId }],
    correlationId: `corr-${actionId}`,
  };
  if (!approved) return [base];
  return [
    base,
    {
      ...base,
      id: `audit-${actionId}-grant`,
      actorId: "user-approver-01",
      action: "approval.granted",
      summary: "Approval granted",
    },
    {
      ...base,
      id: `audit-${actionId}-sent`,
      actorType: "system",
      actorId: undefined,
      action: "external_message.sent",
      summary: "Message sent to customer",
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Integration health fixture                                        */
/* ------------------------------------------------------------------ */

const healthyIntegration: IntegrationHealthBanner = {
  unhealthyConnectors: [],
};

const staleXeroIntegration: IntegrationHealthBanner = {
  unhealthyConnectors: [
    {
      provider: "xero",
      lastSuccessfulSyncAt: new Date(
        AS_OF_DATE.getTime() - 14 * 3_600_000,
      ).toISOString(),
      status: "stale",
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  Public getters                                                    */
/* ------------------------------------------------------------------ */

export function getDailyCashActionsData(
  opts: { integrationHealthy?: boolean } = {},
): DailyCashActionsData {
  const actionViews: RankedActionView[] = rankedActions.map((a) => {
    const inv = invoicesById[a.invoiceId];
    const cust = customersById[a.customerId];
    return {
      actionId: a.actionId,
      kind: a.kind,
      customerId: a.customerId,
      customerName: cust?.displayName ?? a.customerId,
      invoiceId: a.invoiceId,
      invoiceNumber: inv?.invoiceNumber ?? a.invoiceId,
      amountDue: toDisplayMoney(inv?.amountDue ?? money(0, "GBP")),
      priorityScore: a.priorityScore,
      expectedCashImpact: toDisplayMoney(a.expectedCashImpact),
      probabilityOfPayment: a.probabilityOfPayment,
      obligationUrgency: a.obligationUrgency,
      actionEffectiveness: a.actionEffectiveness,
      evidenceConfidence: a.evidenceConfidence,
      relationshipRiskPenalty: a.relationshipRiskPenalty,
      actionEffortPenalty: a.actionEffortPenalty,
      recommendedChannel: a.recommendedChannel,
      recommendedTone: a.recommendedTone,
      explanation: a.explanation,
      evidenceRefs: a.evidenceRefs.map(toEvidenceView),
    };
  });

  const approvalsByActionId: Record<string, ApprovalRequestView | undefined> = {};
  const draftsByActionId: Record<string, MessageDraftView | undefined> = {};

  for (const a of rankedActions) {
    const inv = invoicesById[a.invoiceId];
    if (inv) {
      draftsByActionId[a.actionId] = makeDraft(
        a.actionId,
        inv,
        a.recommendedChannel,
        a.recommendedTone,
      );
    }
    approvalsByActionId[a.actionId] = undefined; // no approval yet
  }

  const obligationRiskViews: ObligationRiskView[] = forecast.obligationRisks.map(
    (r) => {
      const obl = obligations.find((o) => o.id === r.obligationId);
      return {
        obligationId: r.obligationId,
        obligationType: obl?.obligationType,
        counterpartyName: obl?.counterpartyName,
        dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString() : String(r.dueDate),
        amount: toDisplayMoney(r.amount),
        riskStatus: r.riskStatus,
        coverageStatus: r.coverageStatus,
        shortfallAmount: r.shortfallAmount ? toDisplayMoney(r.shortfallAmount) : undefined,
        dependentInflowIds: r.dependentInflowIds,
        evidenceRefs: r.evidenceRefs.map(toEvidenceView),
      };
    },
  );

  return {
    asOfDate: AS_OF_DATE.toISOString(),
    actions: actionViews,
    forecast: {
      forecastId: forecast.forecastId,
      asOfDate: forecast.asOfDate instanceof Date ? forecast.asOfDate.toISOString() : String(forecast.asOfDate),
      horizonDays: forecast.horizonDays,
      riskStatus: forecast.riskStatus,
      shortfallAmount: forecast.shortfallAmount
        ? toDisplayMoney(forecast.shortfallAmount)
        : undefined,
      cashBalance: toDisplayMoney(forecast.cashBalance),
      obligationRisks: obligationRiskViews,
    },
    approvalsByActionId,
    draftsByActionId,
    evidenceById: evidenceIndex,
    integrationHealth: opts.integrationHealthy === false
      ? staleXeroIntegration
      : healthyIntegration,
    generatedAt: AS_OF_DATE.toISOString(),
  };
}

export function getApprovalInboxData(): ApprovalInboxData {
  // Create one pending and one recently-decided approval card
  const pendingCards: ApprovalCardView[] = [];
  const decidedCards: ApprovalCardView[] = [];

  if (rankedActions.length >= 1) {
    const a = rankedActions[0]!;
    const inv = invoicesById[a.invoiceId];
    const cust = customersById[a.customerId];
    pendingCards.push({
      approval: makeApproval(a.actionId, "pending"),
      subject: {
        kind: "external_message",
        draft: inv
          ? makeDraft(a.actionId, inv, a.recommendedChannel, a.recommendedTone)
          : undefined,
        collectionActionId: a.actionId,
        customerId: a.customerId,
        customerName: cust?.displayName,
        invoiceId: a.invoiceId,
      },
      policyWarnings: cust?.relationshipTier === "strategic"
        ? [
            {
              severity: "warn",
              ruleId: "strategic_customer_review",
              message:
                "Strategic customer — review wording carefully before sending.",
              evidenceRefs: [{ kind: "customer", id: a.customerId }],
            },
          ]
        : [],
      auditHistory: makeAuditEvents(a.actionId, false),
    });
  }

  if (rankedActions.length >= 2) {
    const a = rankedActions[1]!;
    const inv = invoicesById[a.invoiceId];
    const cust = customersById[a.customerId];
    decidedCards.push({
      approval: {
        ...makeApproval(a.actionId, "approved"),
        decision: {
          decision: "approved",
          decidedByUserId: "user-approver-01",
          decidedAt: AS_OF_DATE.toISOString(),
        },
      },
      subject: {
        kind: "external_message",
        draft: inv
          ? makeDraft(a.actionId, inv, a.recommendedChannel, a.recommendedTone)
          : undefined,
        collectionActionId: a.actionId,
        customerId: a.customerId,
        customerName: cust?.displayName,
        invoiceId: a.invoiceId,
      },
      policyWarnings: [],
      auditHistory: makeAuditEvents(a.actionId, true),
    });
  }

  // Add a policy-blocked card
  if (rankedActions.length >= 3) {
    const a = rankedActions[2]!;
    const inv = invoicesById[a.invoiceId];
    const cust = customersById[a.customerId];
    pendingCards.push({
      approval: makeApproval(a.actionId, "pending"),
      subject: {
        kind: "external_message",
        draft: inv
          ? makeDraft(a.actionId, inv, a.recommendedChannel, a.recommendedTone)
          : undefined,
        collectionActionId: a.actionId,
        customerId: a.customerId,
        customerName: cust?.displayName,
        invoiceId: a.invoiceId,
      },
      policyWarnings: [
        {
          severity: "block",
          ruleId: "no_legal_threats_without_cfo",
          message: "Legal threat language detected — CFO approval required.",
          evidenceRefs: [{ kind: "policy", id: "policy-legal-block" }],
        },
      ],
      auditHistory: makeAuditEvents(a.actionId, false),
    });
  }

  return {
    pending: pendingCards,
    recentlyDecided: decidedCards,
    evidenceById: evidenceIndex,
  };
}

export function getForecastScreenData(): ForecastScreenData {
  const scenarioViews: ForecastScenarioView[] = forecast.scenarios.map((s) => ({
    name: s.name,
    startingCash: toDisplayMoney(s.startingCash),
    expectedInflows: toDisplayMoney(s.expectedInflows),
    expectedOutflows: toDisplayMoney(s.expectedOutflows),
    endingCash: toDisplayMoney(s.endingCash),
    riskStatus: s.riskStatus,
    shortfallAmount: s.shortfallAmount ? toDisplayMoney(s.shortfallAmount) : undefined,
  }));

  const bandViews: ConfidenceBandView[] = forecast.confidenceBands.map((b) => ({
    date: b.date instanceof Date ? b.date.toISOString() : String(b.date),
    low: toDisplayMoney(b.low),
    expected: toDisplayMoney(b.expected),
    high: toDisplayMoney(b.high),
  }));

  const inflowViews: ForecastCashFlowView[] = forecast.expectedInflows.map((f) => ({
    id: f.id,
    kind: f.kind,
    date: f.date instanceof Date ? f.date.toISOString() : String(f.date),
    amount: toDisplayMoney(f.amount),
    confidence: f.confidence,
    label: f.label,
    evidenceRefs: f.evidenceRefs.map(toEvidenceView),
  }));

  const outflowViews: ForecastCashFlowView[] = forecast.expectedOutflows.map((f) => ({
    id: f.id,
    kind: f.kind,
    date: f.date instanceof Date ? f.date.toISOString() : String(f.date),
    amount: toDisplayMoney(f.amount),
    confidence: f.confidence,
    label: f.label,
    evidenceRefs: f.evidenceRefs.map(toEvidenceView),
  }));

  const obligationRiskViews: ObligationRiskView[] = forecast.obligationRisks.map(
    (r) => {
      const obl = obligations.find((o) => o.id === r.obligationId);
      return {
        obligationId: r.obligationId,
        obligationType: obl?.obligationType,
        counterpartyName: obl?.counterpartyName,
        dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString() : String(r.dueDate),
        amount: toDisplayMoney(r.amount),
        riskStatus: r.riskStatus,
        coverageStatus: r.coverageStatus,
        shortfallAmount: r.shortfallAmount ? toDisplayMoney(r.shortfallAmount) : undefined,
        dependentInflowIds: r.dependentInflowIds,
        evidenceRefs: r.evidenceRefs.map(toEvidenceView),
      };
    },
  );

  return {
    forecast: {
      forecastId: forecast.forecastId,
      generatedAt: forecast.generatedAt instanceof Date
        ? forecast.generatedAt.toISOString()
        : String(forecast.generatedAt),
      asOfDate: forecast.asOfDate instanceof Date
        ? forecast.asOfDate.toISOString()
        : String(forecast.asOfDate),
      horizonDays: forecast.horizonDays,
      cashBalance: toDisplayMoney(forecast.cashBalance),
      riskStatus: forecast.riskStatus,
      shortfallAmount: forecast.shortfallAmount
        ? toDisplayMoney(forecast.shortfallAmount)
        : undefined,
      scenarios: scenarioViews,
      confidenceBands: bandViews,
      obligationRisks: obligationRiskViews,
      expectedInflows: inflowViews,
      expectedOutflows: outflowViews,
      evidenceRefs: forecast.evidenceRefs.map(toEvidenceView),
    },
    horizonOptions: [7, 14, 30, 90],
    selectedHorizonDays: 30,
    selectedScenarioName: "base",
    forecastVersions: [
      {
        forecastId: forecast.forecastId,
        generatedAt: forecast.generatedAt instanceof Date
          ? forecast.generatedAt.toISOString()
          : String(forecast.generatedAt),
        asOfDate: forecast.asOfDate instanceof Date
          ? forecast.asOfDate.toISOString()
          : String(forecast.asOfDate),
        horizonDays: forecast.horizonDays,
        riskStatus: forecast.riskStatus,
      },
    ],
    integrationHealth: { unhealthyConnectors: [] },
  };
}

export { customers, customersById, invoicesById, obligations };
