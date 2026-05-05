import { describe, expect, it } from "vitest";

import {
  approvalRequestSchema,
  auditEventSchema,
  bankTransactionSchema,
  cashForecastSchema,
  collectionActionSchema,
  companySchema,
  customerSchema,
  domainEventSchema,
  evidenceRefSchema,
  invoiceSchema,
  money,
  obligationSchema,
  paymentSchema,
  promiseToPaySchema
} from "../src/index.js";

const now = new Date("2026-05-04T12:00:00.000Z");
const tomorrow = new Date("2026-05-05T12:00:00.000Z");
const nextWeek = new Date("2026-05-11T12:00:00.000Z");

const invoiceEvidence = {
  kind: "invoice" as const,
  id: "inv_001",
  summary: "Invoice INV-001 is overdue and still open.",
  sourceProvider: "xero",
  sourceTimestamp: now
};

const paymentEvidence = {
  kind: "payment" as const,
  id: "pay_001",
  summary: "Payment PAY-001 was posted by Xero.",
  sourceProvider: "xero",
  sourceTimestamp: now
};

describe("domain schemas", () => {
  it("validates evidence refs", () => {
    expect(evidenceRefSchema.parse(invoiceEvidence).sourceTimestamp).toEqual(now);

    expect(evidenceRefSchema.safeParse({ kind: "invoice", id: "" }).success).toBe(false);
  });

  it("validates a company", () => {
    const company = companySchema.parse({
      id: "co_001",
      displayName: "Acme Trading",
      legalName: "Acme Trading Ltd",
      baseCurrency: "gbp",
      countryCode: "gb",
      timezone: "Europe/London",
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    expect(company.baseCurrency).toBe("GBP");
    expect(company.countryCode).toBe("GB");
  });

  it("validates a customer", () => {
    const customer = customerSchema.parse({
      id: "cus_001",
      companyId: "co_001",
      displayName: "Bright Studio",
      legalName: "Bright Studio Ltd",
      externalRefs: [
        {
          provider: "xero",
          objectType: "contact",
          objectId: "xero-contact-1",
          lastSyncedAt: now
        }
      ],
      relationshipTier: "strategic",
      defaultContactId: "contact_001",
      status: "active",
      notes: "Prefers concise finance emails.",
      createdAt: now,
      updatedAt: now
    });

    expect(customer.externalRefs).toHaveLength(1);
  });

  it("validates an invoice and enforces currency consistency", () => {
    const invoice = invoiceSchema.parse({
      id: "inv_001",
      companyId: "co_001",
      customerId: "cus_001",
      sourceObjectId: "src_inv_001",
      invoiceNumber: "INV-001",
      issueDate: "2026-04-01T00:00:00.000Z",
      dueDate: "2026-04-30T00:00:00.000Z",
      status: "overdue",
      amountDue: money("125000", "GBP"),
      amountPaid: money("25000", "GBP"),
      lineItems: [
        {
          id: "line_001",
          invoiceId: "inv_001",
          description: "Monthly services",
          quantity: "1",
          lineAmount: money("125000", "GBP")
        }
      ],
      lastSourceUpdatedAt: now,
      evidenceRefs: [invoiceEvidence],
      createdAt: now,
      updatedAt: now
    });

    expect(invoice.amountDue.amountMinor).toBe(125000n);

    expect(
      invoiceSchema.safeParse({
        ...invoice,
        amountPaid: money("25000", "USD")
      }).success
    ).toBe(false);
  });

  it("validates a payment", () => {
    const payment = paymentSchema.parse({
      id: "pay_001",
      companyId: "co_001",
      customerId: "cus_001",
      invoiceId: "inv_001",
      sourceObjectId: "src_pay_001",
      bankTransactionId: "bank_txn_001",
      paymentDate: now,
      amount: money("25000", "GBP"),
      providerStatus: "posted",
      evidenceRefs: [paymentEvidence],
      createdAt: now,
      updatedAt: now
    });

    expect(payment.providerStatus).toBe("posted");
  });

  it("validates a bank transaction and requires signed direction", () => {
    const bankTransaction = bankTransactionSchema.parse({
      id: "bank_txn_001",
      companyId: "co_001",
      bankAccountId: "bank_acc_001",
      sourceObjectId: "src_bank_txn_001",
      postedAt: now,
      type: "credit",
      status: "posted",
      amount: money("25000", "GBP"),
      counterpartyName: "Bright Studio Ltd",
      reference: "INV-001",
      matchedPaymentIds: ["pay_001"],
      evidenceRefs: [
        {
          kind: "bank_transaction",
          id: "bank_txn_001",
          summary: "Bank credit references INV-001.",
          sourceProvider: "open_banking",
          sourceTimestamp: now
        }
      ],
      createdAt: now,
      updatedAt: now
    });

    expect(bankTransaction.matchedPaymentIds).toEqual(["pay_001"]);

    expect(
      bankTransactionSchema.safeParse({
        ...bankTransaction,
        type: "debit"
      }).success
    ).toBe(false);
  });

  it("validates a critical obligation", () => {
    const obligation = obligationSchema.parse({
      id: "obl_001",
      companyId: "co_001",
      obligationType: "payroll",
      counterpartyName: "Payroll",
      dueDate: nextWeek,
      amount: money("500000", "GBP"),
      criticality: "critical",
      recurrenceRule: "FREQ=MONTHLY",
      manualOrSource: "manual",
      status: "scheduled",
      evidenceRefs: [
        {
          kind: "obligation",
          id: "obl_001",
          summary: "Payroll obligation entered by finance manager."
        }
      ],
      createdAt: now,
      updatedAt: now
    });

    expect(obligation.obligationType).toBe("payroll");
  });

  it("validates a promise-to-pay", () => {
    const promise = promiseToPaySchema.parse({
      id: "ptp_001",
      companyId: "co_001",
      customerId: "cus_001",
      invoiceId: "inv_001",
      sourceMessageId: "msg_001",
      amountPromised: money("100000", "GBP"),
      promisedDate: tomorrow,
      promiseType: "conditional",
      conditionText: "Payment depends on PO re-approval.",
      extractedText: "We should be able to pay once the PO is re-approved tomorrow.",
      confidenceAtCreation: 0.72,
      evidenceRefs: [
        {
          kind: "communication_message",
          id: "msg_001",
          summary: "Customer gave a conditional payment promise."
        }
      ],
      outcome: "pending",
      createdBy: "ai",
      approvedByUserId: "user_approver",
      createdAt: now,
      updatedAt: now
    });

    expect(promise.promiseType).toBe("conditional");

    expect(
      promiseToPaySchema.safeParse({
        ...promise,
        conditionText: undefined
      }).success
    ).toBe(false);
  });

  it("validates a cash forecast", () => {
    const forecast = cashForecastSchema.parse({
      forecastId: "forecast_001",
      companyId: "co_001",
      generatedAt: now,
      asOfDate: now,
      horizonDays: 14,
      triggerEventIds: ["payment.received:pay_001"],
      cashBalance: money("350000", "GBP"),
      expectedInflows: [
        {
          id: "flow_in_001",
          direction: "inflow",
          kind: "promise_to_pay",
          sourceId: "ptp_001",
          expectedDate: tomorrow,
          amount: money("100000", "GBP"),
          probability: 0.72,
          confidence: 0.8,
          evidenceRefs: [invoiceEvidence]
        }
      ],
      confidenceWeightedInflows: [
        {
          id: "flow_weighted_001",
          direction: "inflow",
          kind: "promise_to_pay",
          sourceId: "ptp_001",
          expectedDate: tomorrow,
          amount: money("72000", "GBP"),
          probability: 0.72,
          confidence: 0.8,
          evidenceRefs: [invoiceEvidence]
        }
      ],
      expectedOutflows: [
        {
          id: "flow_out_001",
          direction: "outflow",
          kind: "obligation",
          sourceId: "obl_001",
          expectedDate: nextWeek,
          amount: money("500000", "GBP"),
          probability: 1,
          confidence: 1,
          evidenceRefs: [
            {
              kind: "obligation",
              id: "obl_001",
              summary: "Payroll due in the forecast horizon."
            }
          ]
        }
      ],
      riskStatus: "watch",
      scenarios: [
        {
          id: "scenario_base",
          name: "Base case",
          riskStatus: "watch",
          cashBalance: money("350000", "GBP"),
          shortfallAmount: money("50000", "GBP"),
          evidenceRefs: [invoiceEvidence]
        }
      ],
      confidenceBands: [
        {
          id: "band_80",
          label: "80 percent confidence",
          lowerBound: money("250000", "GBP"),
          upperBound: money("450000", "GBP"),
          confidenceLevel: 0.8
        }
      ],
      shortfallAmount: money("50000", "GBP"),
      obligationRisks: [
        {
          obligationId: "obl_001",
          dueDate: nextWeek,
          amount: money("500000", "GBP"),
          riskStatus: "watch",
          coverageAmount: money("450000", "GBP"),
          shortfallAmount: money("50000", "GBP"),
          reason: "Payroll depends on a conditional promise landing first.",
          evidenceRefs: [invoiceEvidence]
        }
      ],
      evidenceRefs: [invoiceEvidence]
    });

    expect(forecast.riskStatus).toBe("watch");

    expect(
      cashForecastSchema.safeParse({
        ...forecast,
        evidenceRefs: []
      }).success
    ).toBe(false);
  });

  it("validates a collection action with split kind/channel/tone", () => {
    const action = collectionActionSchema.parse({
      id: "action_001",
      companyId: "co_001",
      customerId: "cus_001",
      invoiceId: "inv_001",
      promiseToPayId: "ptp_001",
      actionKind: "request_payment",
      channel: "email",
      tone: "firm",
      status: "awaiting_approval",
      priorityScore: 82.5,
      expectedCashImpact: money("100000", "GBP"),
      probabilityOfPayment: 0.72,
      evidenceConfidence: 0.86,
      relationshipRiskPenalty: 3,
      actionEffortPenalty: 1,
      requiresApproval: true,
      recommendedAt: now,
      dueAt: tomorrow,
      reason: "Conditional promise affects payroll coverage.",
      draftMessageId: "draft_001",
      assignedToUserId: "user_approver",
      evidenceRefs: [invoiceEvidence],
      createdAt: now,
      updatedAt: now
    });

    expect(action.requiresApproval).toBe(true);
    expect(action.actionKind).toBe("request_payment");
    expect(action.channel).toBe("email");
  });

  it("rejects a collection action where channel=internal but kind != no_action", () => {
    expect(
      collectionActionSchema.safeParse({
        id: "action_002",
        companyId: "co_001",
        customerId: "cus_001",
        actionKind: "request_payment",
        channel: "internal",
        status: "proposed",
        priorityScore: 50,
        evidenceConfidence: 0.7,
        requiresApproval: true,
        recommendedAt: now,
        reason: "test",
        evidenceRefs: [invoiceEvidence],
        createdAt: now,
        updatedAt: now
      }).success,
    ).toBe(false);
  });

  it("validates an approval request", () => {
    const approval = approvalRequestSchema.parse({
      id: "approval_001",
      companyId: "co_001",
      subjectKind: "collection_action",
      subjectId: "action_001",
      status: "approved",
      requestedByUserId: "user_requester",
      assignedApproverId: "user_approver",
      requestedAt: now,
      decision: {
        decision: "approved",
        decidedByUserId: "user_approver",
        decidedAt: now,
        note: "Approved with current wording."
      },
      riskSummary: "Message is external and requires approval.",
      evidenceRefs: [invoiceEvidence],
      createdAt: now,
      updatedAt: now
    });

    expect(approval.decision?.decision).toBe("approved");

    expect(
      approvalRequestSchema.safeParse({
        ...approval,
        status: "edited",
        decision: {
          decision: "edited",
          decidedByUserId: "user_approver",
          decidedAt: now
        }
      }).success
    ).toBe(false);
  });

  it("validates an audit event", () => {
    const auditEvent = auditEventSchema.parse({
      id: "audit_001",
      companyId: "co_001",
      actorType: "user",
      actorId: "user_approver",
      action: "approval.granted",
      targetKind: "approval",
      targetId: "approval_001",
      occurredAt: now,
      summary: "Approver approved the collection email.",
      before: { status: "pending" },
      after: { status: "approved" },
      evidenceRefs: [
        {
          kind: "approval",
          id: "approval_001",
          summary: "Approval request approved."
        }
      ],
      correlationId: "corr_001",
      causationEventId: "evt_001"
    });

    expect(auditEvent.actorType).toBe("user");
  });

  it("validates a domain event", () => {
    const domainEvent = domainEventSchema.parse({
      id: "evt_001",
      companyId: "co_001",
      type: "payment.received",
      occurredAt: now,
      aggregateKind: "payment",
      aggregateId: "pay_001",
      payload: {
        paymentId: "pay_001",
        amountMinor: "25000",
        currency: "GBP"
      },
      evidenceRefs: [paymentEvidence],
      idempotencyKey: "xero:payment:pay_001",
      correlationId: "corr_001"
    });

    expect(domainEvent.type).toBe("payment.received");
  });
});
