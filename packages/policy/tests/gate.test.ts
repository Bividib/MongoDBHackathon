import type {
  ApprovalRequest,
  CollectionAction,
  CollectionActionChannel,
  CollectionActionKind,
  CollectionActionStatus,
  EvidenceRef,
} from "@runwayops/domain";
import { describe, expect, it } from "vitest";

import { mintGatePassAt } from "../src/gate.js";

// --- Helpers ---

function makeAction(overrides: Partial<CollectionAction> = {}): CollectionAction {
  return {
    id: "act-1",
    companyId: "co-1",
    customerId: "cust-1",
    actionKind: "request_payment",
    channel: "email",
    tone: "friendly",
    status: "approved",
    priorityScore: 0.8,
    evidenceConfidence: 0.9,
    relationshipRiskPenalty: 0,
    actionEffortPenalty: 0,
    requiresApproval: true,
    recommendedAt: new Date("2026-05-01T10:00:00Z"),
    dueAt: null,
    approvedAt: new Date("2026-05-01T11:00:00Z"),
    rejectedAt: null,
    executedAt: null,
    completedAt: null,
    reason: "Invoice overdue by 14 days",
    evidenceRefs: [
      { kind: "invoice", id: "inv-1", summary: "Invoice #123" },
    ] as EvidenceRef[],
    createdAt: new Date("2026-05-01T10:00:00Z"),
    updatedAt: new Date("2026-05-01T11:00:00Z"),
    ...overrides,
  } as CollectionAction;
}

function makeApproval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: "apr-1",
    companyId: "co-1",
    subjectKind: "collection_action",
    subjectId: "act-1",
    status: "approved",
    requestedAt: new Date("2026-05-01T10:00:00Z"),
    decision: {
      decision: "approved",
      decidedByUserId: "user-1",
      decidedAt: new Date("2026-05-01T11:00:00Z"),
    },
    evidenceRefs: [{ kind: "invoice", id: "inv-1" }] as EvidenceRef[],
    createdAt: new Date("2026-05-01T10:00:00Z"),
    updatedAt: new Date("2026-05-01T11:00:00Z"),
    ...overrides,
  } as ApprovalRequest;
}

const NOW = new Date("2026-05-01T12:00:00Z");

describe("mintGatePass — integration", () => {
  it("returns branded GatePassedAction on success", () => {
    const action = makeAction();
    const approval = makeApproval();
    const result = mintGatePassAt(approval, action, "idem-1", NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action.idempotencyKey).toBe("idem-1");
      expect(result.action.gatePassedAt).toEqual(NOW);
      expect(result.action.id).toBe("act-1");
      // Branded action is frozen
      expect(Object.isFrozen(result.action)).toBe(true);
    }
  });

  it("returns PolicyError for payment initiation", () => {
    const action = makeAction({ actionKind: "initiate_payment" as CollectionActionKind });
    const result = mintGatePassAt(undefined, action, "idem-2", NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfPaymentInitiation");
    }
  });

  it("returns PolicyError for missing evidence", () => {
    const action = makeAction({ evidenceRefs: [] as EvidenceRef[] });
    const result = mintGatePassAt(undefined, action, "idem-3", NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfMissingEvidence");
    }
  });

  it("returns PolicyError for autonomous send (not approved)", () => {
    const action = makeAction({ status: "proposed", channel: "email" });
    const result = mintGatePassAt(undefined, action, "idem-4", NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfAutonomousSend");
    }
  });

  it("returns PolicyError for expired approval", () => {
    const approval = makeApproval({
      decision: {
        decision: "approved",
        decidedByUserId: "user-1",
        decidedAt: new Date("2026-04-30T10:00:00Z"), // >24h ago
      },
    });
    const action = makeAction({ actionKind: "request_payment" });
    const result = mintGatePassAt(approval, action, "idem-5", NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfApprovalExpired");
    }
  });

  it("returns PolicyError for obligation-safe claim in reason", () => {
    const action = makeAction({
      reason: "Payroll is covered, supplier is sorted",
    });
    const approval = makeApproval();
    const result = mintGatePassAt(approval, action, "idem-6", NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfClaimsObligationSafe");
    }
  });
});

// --- Property test: determinism ---

describe("mintGatePass — determinism property", () => {
  const ACTION_KINDS: CollectionActionKind[] = [
    "request_payment",
    "request_partial_payment",
    "confirm_promise",
    "resolve_dispute",
    "manual_review_paid_claim",
    "founder_escalation",
    "propose_payment_plan",
    "request_supplier_timing",
    "no_action",
  ];

  const STATUSES: CollectionActionStatus[] = [
    "proposed",
    "awaiting_approval",
    "approved",
    "rejected",
    "executing",
    "completed",
    "cancelled",
    "failed",
    "expired",
  ];

  const CHANNELS: CollectionActionChannel[] = [
    "email",
    "sms",
    "phone_task",
    "letter",
    "portal",
    "in_app",
    "internal",
  ];

  it("produces the same result for the same inputs across multiple runs", () => {
    // Test a representative cross-product sample
    for (const kind of ACTION_KINDS) {
      for (const status of STATUSES.slice(0, 3)) {
        for (const channel of CHANNELS.slice(0, 3)) {
          const action = makeAction({
            actionKind: kind,
            status,
            channel,
            // no_action needs internal channel and no customer
            ...(kind === "no_action"
              ? { channel: "internal" as CollectionActionChannel, customerId: undefined }
              : {}),
          });
          const approval =
            status === "approved" ? makeApproval() : undefined;

          const result1 = mintGatePassAt(approval, action, "idem-det", NOW);
          const result2 = mintGatePassAt(approval, action, "idem-det", NOW);

          // Same ok status
          expect(result1.ok).toBe(result2.ok);

          if (!result1.ok && !result2.ok) {
            expect(result1.rule).toBe(result2.rule);
            expect(result1.reason).toBe(result2.reason);
          }
          if (result1.ok && result2.ok) {
            expect(result1.action.idempotencyKey).toBe(
              result2.action.idempotencyKey,
            );
          }
        }
      }
    }
  });
});
