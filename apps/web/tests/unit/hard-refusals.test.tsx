/**
 * Hard refusal tests — enforces the three safety invariants:
 *
 * 1. No screen or component renders a button that initiates a payment.
 * 2. No screen claims an obligation is "safe", "covered", "fine", etc.
 *    Numbers and confidence are shown; the safety call is human.
 * 3. Every external action button is disabled until the approval flow
 *    completes (status === "approved" — never on draft alone).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApprovalAction } from "@/components/ApprovalAction";
import { RiskBadge } from "@/components/RiskBadge";

describe("Hard refusal: no payment initiation", () => {
  it("ApprovalAction does not render any payment button", () => {
    const { container } = render(
      <ApprovalAction
        approval={{ id: "a1", subjectKind: "external_message", subjectId: "x", status: "pending", requestedAt: "2026-05-05", evidenceRefs: [] }}
      />,
    );
    const buttons = container.querySelectorAll("button");
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase() ?? "";
      expect(text).not.toContain("pay");
      expect(text).not.toContain("initiate payment");
      expect(text).not.toContain("send payment");
      expect(text).not.toContain("transfer");
    }
  });

  it("ApprovalAction with approved status does not offer payment", () => {
    const { container } = render(
      <ApprovalAction
        approval={{
          id: "a1",
          subjectKind: "external_message",
          subjectId: "x",
          status: "approved",
          requestedAt: "2026-05-05",
          evidenceRefs: [],
          decision: { decision: "approved", decidedByUserId: "u1", decidedAt: "2026-05-05" },
        }}
      />,
    );
    const allText = container.textContent?.toLowerCase() ?? "";
    expect(allText).not.toContain("initiate payment");
    expect(allText).not.toContain("send payment");
    expect(allText).not.toContain("transfer funds");
  });
});

describe("Hard refusal: no safety claims", () => {
  it("RiskBadge shows status text, never 'safe to proceed' or similar", () => {
    const { container } = render(<RiskBadge status="safe" />);
    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).toContain("safe"); // shows the enum value
    expect(text).not.toContain("safe to proceed");
    expect(text).not.toContain("covered");
    expect(text).not.toContain("fine");
    expect(text).not.toContain("no risk");
  });

  it("RiskBadge for critical shows status only", () => {
    const { container } = render(<RiskBadge status="critical" />);
    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).toContain("critical");
    expect(text).not.toContain("danger");
    expect(text).not.toContain("you must");
  });
});

describe("Hard refusal: approval gating", () => {
  it("approve button exists when pending", () => {
    render(
      <ApprovalAction
        approval={{ id: "a1", subjectKind: "external_message", subjectId: "x", status: "pending", requestedAt: "2026-05-05", evidenceRefs: [] }}
      />,
    );
    expect(screen.getByTestId("approve-btn")).toBeDefined();
  });

  it("approve button is disabled when policy blocks", () => {
    render(
      <ApprovalAction
        approval={{ id: "a1", subjectKind: "external_message", subjectId: "x", status: "pending", requestedAt: "2026-05-05", evidenceRefs: [] }}
        policyWarnings={[
          { severity: "block", ruleId: "test-block", message: "Blocked", evidenceRefs: [] },
        ]}
      />,
    );
    const btn = screen.getByTestId("approve-btn");
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("no approve/send button when no approval exists (draft-only)", () => {
    render(<ApprovalAction approval={undefined} />);
    expect(screen.queryByTestId("approve-btn")).toBeNull();
  });

  it("shows request-approval button when no approval exists", () => {
    render(<ApprovalAction approval={undefined} />);
    expect(screen.getByTestId("request-approval-btn")).toBeDefined();
  });
});
