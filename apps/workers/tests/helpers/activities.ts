import type * as activities from "../../src/temporal/activities/index.js";

/**
 * Canned activity implementations for replay tests. The real activity
 * stubs already return canned data, so the mock implementations mirror
 * them — but defining them in the test helpers means tests stay isolated
 * from any future real wiring inside the activity bodies.
 */
export const mockActivities: typeof activities = {
  getNow: async () => ({ nowIso: "2026-05-04T09:00:00.000Z" }),

  loadCompanyPolicy: async (input) => ({
    companyId: input.companyId,
    highConfidenceThreshold: 0.8,
    mediumConfidenceThreshold: 0.5,
    approvalWindowMs: 60 * 60 * 1000,
    humanOverrideWindowMs: 30 * 60 * 1000,
    promiseGraceMs: 2 * 24 * 60 * 60 * 1000,
    caseReplanIntervalMs: 24 * 60 * 60 * 1000
  }),

  loadFinancialFactsForForecast: async (input) => ({
    asOfDate: input.asOfDate,
    invoiceCount: 12,
    pendingPromiseCount: 3,
    obligationCount: 2,
    cashBalanceMinor: 250_000_00,
    currency: "GBP"
  }),

  computeCashForecast: async (input) => ({
    forecastId: `forecast:${input.companyId}:${input.asOfDate}`,
    asOfDate: input.asOfDate,
    cashBalanceMinor: 250_000_00,
    currency: "GBP",
    riskStatus: "watch",
    shortfallMinor: 35_000_00
  }),

  rankCollectionsActions: async (input) => {
    const max = Math.min(Math.max(input.maxActions, 1), 5);
    return Array.from({ length: max }, (_, i) => ({
      actionId: `${input.idempotencyKey}:action:${i + 1}`,
      invoiceId: `invoice:${input.forecastId}:${i + 1}`,
      customerId: `customer:${input.forecastId}:${i + 1}`,
      priorityScore: 100 - i * 5,
      expectedCashImpactMinor: 10_000_00 - i * 1_000_00,
      currency: "GBP"
    }));
  },

  recomputeCashForecast: async (input) => ({
    forecastId: `forecast:${input.companyId}:${input.asOfDate}`,
    asOfDate: input.asOfDate,
    cashBalanceMinor: 250_000_00,
    currency: "GBP",
    riskStatus: "watch",
    shortfallMinor: 35_000_00
  }),

  rerankCollectionActions: async (input) =>
    Array.from({ length: Math.min(Math.max(input.maxActions, 1), 5) }, (_, i) => ({
      actionId: `${input.idempotencyKey}:rerank:${i + 1}`,
      invoiceId: `invoice:rerank:${i + 1}`,
      customerId: `customer:rerank:${i + 1}`,
      priorityScore: 90 - i * 5,
      expectedCashImpactMinor: 9_000_00 - i * 500_00,
      currency: "GBP"
    })),

  replanForecast: async (input) => ({
    forecastId: `forecast:${input.companyId}:${input.caseId}:${input.asOfDate}`,
    asOfDate: input.asOfDate,
    cashBalanceMinor: 250_000_00,
    currency: "GBP",
    riskStatus: "high",
    shortfallMinor: 22_500_00
  }),

  retrieveEvidenceForTopActions: async (input) =>
    input.actionIds.map((actionId) => ({
      actionId,
      evidenceRefIds: [`evidence:${actionId}:invoice`, `evidence:${actionId}:thread`],
      evidenceConfidence: 0.72
    })),

  retrieveCustomerMemory: async (input) => ({
    customerId: input.customerId,
    averageDaysLate: 4.5,
    promiseKeptRate: 0.78,
    conditionalPromiseKeptRate: 0.42,
    preferredChannel: "email"
  }),

  validateEvidence: async (input) =>
    input.evidenceRefIds.length > 0 ? { ok: true } : { ok: false, reason: "no_evidence_provided" },

  loadCustomerMessage: async (input) => ({
    messageEventId: input.messageEventId,
    customerId: `customer:${input.companyId}:demo`,
    threadId: `thread:${input.messageEventId}`,
    bodyText: "We should be able to pay Friday once the PO is re-approved.",
    receivedAtIso: "2026-05-04T10:15:00.000Z"
  }),

  classifyReply: async () => ({
    classification: "conditional_promise",
    confidence: 0.74,
    hasPromiseHint: true
  }),

  extractPromise: async () => ({
    hasPromise: true,
    promiseType: "conditional",
    promisedDateIso: "2026-05-08",
    conditionText: "PO re-approval",
    cashConfidence: 0.42
  }),

  draftMessages: async (input) =>
    input.actionIds.map((actionId) => ({
      draftId: `${input.idempotencyKey}:draft:${actionId}`,
      actionId,
      channel: "email",
      tone: "neutral"
    })),

  draftMessage: async (input) => ({
    draftId: `${input.idempotencyKey}:draft:single`,
    actionId: input.actionIds[0] ?? `${input.idempotencyKey}:no-action`,
    channel: "email",
    tone: "neutral"
  }),

  draftFollowUpIfNeeded: async (input) => {
    if (input.classification === "already_paid" || input.classification === "dispute") {
      return { kind: "skipped", reason: input.classification };
    }
    return {
      kind: "drafted",
      draft: {
        draftId: `${input.idempotencyKey}:followup`,
        actionId: `${input.idempotencyKey}:action`,
        channel: "email",
        tone: "neutral"
      }
    };
  },

  draftCustomerActions: async (input) =>
    input.invoiceIds.map((invoiceId, i) => ({
      draftId: `${input.idempotencyKey}:customer-draft:${i + 1}`,
      actionId: `${input.idempotencyKey}:customer-action:${invoiceId}`,
      channel: "email",
      tone: "firm"
    })),

  draftSupplierActions: async (input) =>
    input.supplierIds.map((supplierId, i) => ({
      draftId: `${input.idempotencyKey}:supplier-draft:${i + 1}`,
      actionId: `${input.idempotencyKey}:supplier-action:${supplierId}`,
      channel: "email",
      tone: "neutral"
    })),

  loadPromise: async (input) => ({
    promiseId: input.promiseId,
    customerId: `customer:${input.companyId}:demo`,
    invoiceId: `invoice:${input.companyId}:demo`,
    promiseType: "conditional",
    promisedDateIso: "2026-05-08",
    outcome: "pending",
    amountPromisedMinor: 12_500_00,
    currency: "GBP",
    graceUntilIso: "2026-05-10"
  }),

  upsertPromiseToPay: async (input) => ({
    promiseId: `${input.idempotencyKey}:promise`,
    customerId: input.customerId,
    invoiceId: input.invoiceId,
    promiseType: input.extraction.promiseType ?? "vague",
    promisedDateIso: input.extraction.promisedDateIso,
    outcome: "pending"
  }),

  createOrUpdatePromise: async (input) => ({
    promiseId: `${input.idempotencyKey}:promise`,
    customerId: input.customerId,
    invoiceId: input.invoiceId,
    promiseType: input.extraction.promiseType ?? "vague",
    promisedDateIso: input.extraction.promisedDateIso,
    outcome: "pending"
  }),

  checkPaymentMatch: async (input) => ({
    matched: true,
    paymentId: `${input.idempotencyKey}:payment`,
    amountReceivedMinor: 12_500_00,
    currency: "GBP",
    paymentDateIso: "2026-05-09",
    matchConfidence: 0.91
  }),

  classifyPromiseOutcome: async (input) =>
    input.match.matched ? { outcome: "kept" } : { outcome: "broken" },

  updateCustomerReliability: async () => ({ ok: true }),

  createApprovalRequests: async (input) =>
    input.subjects.map((subject) => ({
      approvalRequestId: `${input.idempotencyKey}:approval:${subject.subjectId}`,
      subjectKind: subject.subjectKind,
      subjectId: subject.subjectId
    })),

  createApprovalRequest: async (input) => {
    const first = input.subjects[0];
    if (!first) throw new Error("createApprovalRequest: no subjects");
    return {
      approvalRequestId: `${input.idempotencyKey}:approval:${first.subjectId}`,
      subjectKind: first.subjectKind,
      subjectId: first.subjectId
    };
  },

  openCase: async (input) => ({
    caseId: input.caseId,
    obligationId: input.obligationId,
    openedAtIso: "2026-05-04T09:00:00.000Z"
  }),

  computeShortfall: async () => ({
    shortfallMinor: 22_500_00,
    currency: "GBP",
    riskStatus: "high"
  }),

  identifyCollectableInvoices: async (input) => ({
    invoiceIds: [
      `${input.idempotencyKey}:invoice:1`,
      `${input.idempotencyKey}:invoice:2`,
      `${input.idempotencyKey}:invoice:3`
    ],
    totalCollectableMinor: 28_000_00,
    currency: input.currency
  }),

  identifySupplierTimingOptions: async (input) => ({
    supplierIds: [`${input.idempotencyKey}:supplier:1`],
    totalDeferralMinor: 5_500_00,
    currency: "GBP"
  }),

  executeApprovedActions: async (input) => ({
    successfulActionIds: input.approvedActionIds,
    failedActionIds: []
  }),

  revokeExternalAction: async () => ({ revoked: true }),

  openEscalationCase: async (input) => ({
    caseId: `${input.idempotencyKey}:escalation`,
    obligationId: "obligation:escalated",
    openedAtIso: "2026-05-04T09:00:00.000Z"
  }),

  closeOrEscalate: async (input) => ({
    caseId: input.caseId,
    status: "closed",
    closedAtIso: "2026-05-04T18:00:00.000Z"
  }),

  writeAuditEvent: async (input) => ({ auditEventId: `${input.idempotencyKey}:audit` }),

  writeAuditEvents: async (inputs) =>
    inputs.map((input) => ({ auditEventId: `${input.idempotencyKey}:audit` })),

  writeMemoryAndAudit: async (input) => ({ auditEventId: `${input.idempotencyKey}:audit` }),

  emitDomainEvent: async (input) => ({
    eventId: `${input.idempotencyKey}:event`,
    type: input.type,
    occurredAtIso: "2026-05-04T09:00:00.000Z"
  })
};
