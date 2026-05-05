import { describe, expect, it } from "vitest";

import {
  communicationMessageSchema,
  communicationThreadSchema,
  companyPolicySchema,
  integrationConnectionSchema,
  integrationHealthSchema,
  messageDraftSchema,
  retrievalAttemptSchema,
  sourceObjectSchema,
} from "../src/index.js";

const now = new Date("2026-05-04T12:00:00.000Z");
const later = new Date("2026-05-04T13:00:00.000Z");

describe("messageDraftSchema", () => {
  it("accepts a valid email draft with subject and evidence", () => {
    const parsed = messageDraftSchema.parse({
      id: "msg_1",
      companyId: "co_1",
      customerId: "cust_1",
      channel: "email",
      subject: "Reminder: invoice INV-001",
      bodyText: "Hi, this is a reminder about INV-001.",
      tone: "firm",
      generatedBy: "ai",
      evidenceRefs: [
        { kind: "invoice", id: "inv_1", summary: "Invoice INV-001 is overdue" },
      ],
      status: "awaiting_approval",
      createdAt: now,
      updatedAt: now,
    });

    expect(parsed.channel).toBe("email");
    expect(parsed.evidenceRefs).toHaveLength(1);
  });

  it("rejects email drafts without a subject", () => {
    expect(() =>
      messageDraftSchema.parse({
        id: "msg_2",
        companyId: "co_1",
        channel: "email",
        bodyText: "no subject here",
        tone: "friendly",
        generatedBy: "user",
        status: "draft",
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow();
  });

  it("permits sms drafts without a subject", () => {
    const parsed = messageDraftSchema.parse({
      id: "msg_3",
      companyId: "co_1",
      customerId: "cust_1",
      channel: "sms",
      bodyText: "Quick reminder about INV-001",
      tone: "friendly",
      generatedBy: "ai",
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    expect(parsed.subject).toBeUndefined();
  });
});

describe("integrationConnectionSchema + integrationHealthSchema", () => {
  it("accepts a connected Xero integration", () => {
    const parsed = integrationConnectionSchema.parse({
      id: "ic_1",
      companyId: "co_1",
      provider: "xero",
      displayName: "Xero — Demo Co Ltd",
      status: "connected",
      scopes: ["accounting.transactions", "accounting.contacts"],
      externalAccountId: "tenant_abc",
      connectedById: "user_1",
      connectedAt: now,
      lastSuccessfulSyncAt: later,
      createdAt: now,
      updatedAt: later,
    });

    expect(parsed.status).toBe("connected");
    expect(parsed.scopes).toHaveLength(2);
  });

  it("computes a health view with staleness", () => {
    const parsed = integrationHealthSchema.parse({
      connectionId: "ic_1",
      companyId: "co_1",
      provider: "xero",
      status: "stale",
      staleness: "stale",
      lastSyncAt: now,
      ageHours: 26.5,
      recentErrorCount: 1,
      evaluatedAt: later,
    });

    expect(parsed.staleness).toBe("stale");
  });

  it("rejects unknown providers", () => {
    expect(() =>
      integrationConnectionSchema.parse({
        id: "ic_2",
        companyId: "co_1",
        provider: "sap",
        displayName: "SAP",
        status: "connected",
        connectedById: "user_1",
        connectedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow();
  });
});

describe("retrievalAttemptSchema", () => {
  it("captures a successful retrieval", () => {
    const parsed = retrievalAttemptSchema.parse({
      id: "ret_1",
      companyId: "co_1",
      requestId: "req_1",
      queryKind: "customer_memory",
      queryText: "memory for customer cust_1",
      params: { customerId: "cust_1" },
      resultIds: ["evt_1", "evt_2"],
      resultCount: 2,
      latencyMs: 142,
      success: true,
      invokedByActorType: "ai",
      createdAt: now,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.resultIds).toHaveLength(2);
  });

  it("captures a failed retrieval with error", () => {
    const parsed = retrievalAttemptSchema.parse({
      id: "ret_2",
      companyId: "co_1",
      requestId: "req_2",
      queryKind: "evidence",
      queryText: "evidence for invoice inv_1",
      resultCount: 0,
      latencyMs: 5012,
      success: false,
      errorMessage: "timeout",
      invokedByActorType: "ai",
      createdAt: now,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.errorMessage).toBe("timeout");
  });
});

describe("communication schemas", () => {
  it("validates a thread + inbound message pair", () => {
    const thread = communicationThreadSchema.parse({
      id: "th_1",
      companyId: "co_1",
      customerId: "cust_1",
      channel: "email",
      subject: "Re: INV-001",
      isOpen: true,
      messageCount: 1,
      firstMessageAt: now,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const message = communicationMessageSchema.parse({
      id: "msg_1",
      companyId: "co_1",
      threadId: thread.id,
      customerId: "cust_1",
      direction: "inbound",
      channel: "email",
      senderType: "customer",
      bodyText: "Will pay Friday.",
      occurredAt: now,
      receivedAt: now,
    });

    expect(thread.isOpen).toBe(true);
    expect(message.direction).toBe("inbound");
  });

  it("rejects an inbound message without receivedAt", () => {
    expect(() =>
      communicationMessageSchema.parse({
        id: "msg_2",
        companyId: "co_1",
        threadId: "th_1",
        customerId: "cust_1",
        direction: "inbound",
        channel: "email",
        senderType: "customer",
        bodyText: "No receivedAt",
        occurredAt: now,
      }),
    ).toThrow();
  });

  it("rejects an outbound message without sentAt", () => {
    expect(() =>
      communicationMessageSchema.parse({
        id: "msg_3",
        companyId: "co_1",
        threadId: "th_1",
        customerId: "cust_1",
        direction: "outbound",
        channel: "email",
        senderType: "user",
        bodyText: "No sentAt",
        occurredAt: now,
      }),
    ).toThrow();
  });
});

describe("companyPolicySchema", () => {
  it("validates a collection policy with rules", () => {
    const parsed = companyPolicySchema.parse({
      id: "pol_1",
      companyId: "co_1",
      name: "Standard collections policy",
      kind: "collection",
      rules: [
        {
          id: "r1",
          ruleKind: "approval_required",
          description: "Founder approval required over £10k",
          predicate: { amountMinorAtLeast: 1000000, currency: "GBP" },
          action: { requireApprover: "founder" },
          priority: 10,
        },
      ],
      effectiveFrom: now,
      createdById: "user_1",
      createdAt: now,
      updatedAt: now,
    });

    expect(parsed.rules).toHaveLength(1);
    expect(parsed.rules[0]?.priority).toBe(10);
  });
});

describe("sourceObjectSchema", () => {
  it("requires a sha256 hex content hash", () => {
    const goodHash = "a".repeat(64);
    const parsed = sourceObjectSchema.parse({
      id: "src_1",
      companyId: "co_1",
      provider: "xero",
      objectType: "invoice",
      objectId: "INV-001",
      contentHash: goodHash,
      payload: { foo: "bar" },
      retrievedAt: now,
      createdAt: now,
    });

    expect(parsed.contentHash).toBe(goodHash);

    expect(() =>
      sourceObjectSchema.parse({
        id: "src_2",
        companyId: "co_1",
        provider: "xero",
        objectType: "invoice",
        objectId: "INV-002",
        contentHash: "tooshort",
        payload: {},
        retrievedAt: now,
        createdAt: now,
      }),
    ).toThrow();
  });
});
