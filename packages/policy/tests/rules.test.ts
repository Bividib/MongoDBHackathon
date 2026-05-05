import type {
  ApprovalRequest,
  CollectionAction,
  CollectionActionKind,
  EvidenceRef,
} from "@runwayops/domain";
import { describe, expect, it } from "vitest";

import {
  rejectIfActorMismatch,
  rejectIfApprovalExpired,
  rejectIfAutonomousSend,
  rejectIfClaimsObligationSafe,
  rejectIfMissingEvidence,
  rejectIfPaymentInitiation,
} from "../src/rules.js";
import type { PolicyContext } from "../src/types.js";

// --- Helpers ---

function makeAction(overrides: Partial<CollectionAction> = {}): CollectionAction {
  const base: CollectionAction = {
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
  };
  return base;
}

function makeCtx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    approval: undefined,
    proposerActorId: "ai-system",
    approverActorId: "user-1",
    now: new Date("2026-05-01T12:00:00Z"),
    ...overrides,
  };
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

// --- rejectIfPaymentInitiation ---

describe("rejectIfPaymentInitiation", () => {
  it("rejects action kinds that imply moving money", () => {
    const action = makeAction({ actionKind: "initiate_payment" as CollectionActionKind });
    const result = rejectIfPaymentInitiation(action, makeCtx());
    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    if (!result!.allowed) {
      expect(result!.rule).toBe("rejectIfPaymentInitiation");
    }
  });

  it("allows normal collection action kinds", () => {
    const action = makeAction({ actionKind: "request_payment" });
    const result = rejectIfPaymentInitiation(action, makeCtx());
    expect(result).toBeNull();
  });
});

// --- rejectIfMissingEvidence ---

describe("rejectIfMissingEvidence", () => {
  it("rejects actions with no evidence refs", () => {
    const action = makeAction({ evidenceRefs: [] as EvidenceRef[] });
    const result = rejectIfMissingEvidence(action, makeCtx());
    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    if (!result!.allowed) {
      expect(result!.rule).toBe("rejectIfMissingEvidence");
    }
  });

  it("allows actions with at least one evidence ref", () => {
    const action = makeAction();
    const result = rejectIfMissingEvidence(action, makeCtx());
    expect(result).toBeNull();
  });

  it("allows no_action without evidence", () => {
    const action = makeAction({
      actionKind: "no_action",
      channel: "internal",
      evidenceRefs: [] as EvidenceRef[],
      customerId: undefined,
    });
    const result = rejectIfMissingEvidence(action, makeCtx());
    expect(result).toBeNull();
  });
});

// --- rejectIfAutonomousSend ---

describe("rejectIfAutonomousSend", () => {
  it("rejects non-internal channel when status is not approved", () => {
    const action = makeAction({ channel: "email", status: "proposed" });
    const result = rejectIfAutonomousSend(action, makeCtx());
    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    if (!result!.allowed) {
      expect(result!.rule).toBe("rejectIfAutonomousSend");
    }
  });

  it("allows internal channel regardless of status", () => {
    const action = makeAction({ channel: "internal", status: "proposed" });
    const result = rejectIfAutonomousSend(action, makeCtx());
    expect(result).toBeNull();
  });

  it("allows external channel when status is approved", () => {
    const action = makeAction({ channel: "email", status: "approved" });
    const result = rejectIfAutonomousSend(action, makeCtx());
    expect(result).toBeNull();
  });
});

// --- rejectIfApprovalExpired ---

describe("rejectIfApprovalExpired", () => {
  it("rejects when approval is older than TTL", () => {
    // request_payment has 24h TTL
    const approval = makeApproval({
      decision: {
        decision: "approved",
        decidedByUserId: "user-1",
        decidedAt: new Date("2026-05-01T10:00:00Z"),
      },
    });
    const ctx = makeCtx({
      approval,
      now: new Date("2026-05-02T11:00:00Z"), // 25h later
    });
    const action = makeAction({ actionKind: "request_payment" });
    const result = rejectIfApprovalExpired(action, ctx);
    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    if (!result!.allowed) {
      expect(result!.rule).toBe("rejectIfApprovalExpired");
    }
  });

  it("allows when approval is within TTL", () => {
    const approval = makeApproval({
      decision: {
        decision: "approved",
        decidedByUserId: "user-1",
        decidedAt: new Date("2026-05-01T10:00:00Z"),
      },
    });
    const ctx = makeCtx({
      approval,
      now: new Date("2026-05-01T20:00:00Z"), // 10h later, within 24h TTL
    });
    const action = makeAction({ actionKind: "request_payment" });
    const result = rejectIfApprovalExpired(action, ctx);
    expect(result).toBeNull();
  });

  it("passes when no approval is present", () => {
    const ctx = makeCtx({ approval: undefined });
    const action = makeAction();
    const result = rejectIfApprovalExpired(action, ctx);
    expect(result).toBeNull();
  });
});

// --- rejectIfActorMismatch ---

describe("rejectIfActorMismatch", () => {
  it("always passes (documents dual-hat allowance)", () => {
    const ctx = makeCtx({
      proposerActorId: "user-1",
      approverActorId: "user-1", // same person
    });
    const action = makeAction();
    const result = rejectIfActorMismatch(action, ctx);
    expect(result).toBeNull();
  });

  it("passes when actors are distinct", () => {
    const ctx = makeCtx({
      proposerActorId: "ai-system",
      approverActorId: "user-1",
    });
    const action = makeAction();
    const result = rejectIfActorMismatch(action, ctx);
    expect(result).toBeNull();
  });
});

// --- rejectIfClaimsObligationSafe ---

describe("rejectIfClaimsObligationSafe", () => {
  it("rejects when reason asserts payroll is safe", () => {
    const action = makeAction({
      reason: "Payroll is safe, no need to worry",
    });
    const result = rejectIfClaimsObligationSafe(action, makeCtx());
    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    if (!result!.allowed) {
      expect(result!.rule).toBe("rejectIfClaimsObligationSafe");
    }
  });

  it("rejects when metadata contains obligation-safe claim", () => {
    const action = makeAction({
      reason: "Follow up on invoice",
      metadata: { note: "confirmed that rent is covered" },
    });
    const result = rejectIfClaimsObligationSafe(action, makeCtx());
    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
  });

  it("allows normal action text", () => {
    const action = makeAction({
      reason: "Invoice overdue by 14 days, customer has not responded",
    });
    const result = rejectIfClaimsObligationSafe(action, makeCtx());
    expect(result).toBeNull();
  });

  it("rejects tax safety claim", () => {
    const action = makeAction({
      reason: "Tax will be paid on time",
    });
    const result = rejectIfClaimsObligationSafe(action, makeCtx());
    expect(result).not.toBeNull();
  });
});
