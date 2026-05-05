import { describe, expect, it } from "vitest";
import type { EvidenceRef } from "../src/schemas/index.js";
import {
  applyPolicyValidators,
  rejectIfClaimsObligationSafe,
  rejectIfLegalAdvice,
  rejectIfMissingEvidence,
  rejectIfProposesPaymentInitiation,
  rejectIfTaxAdvice,
} from "../src/validators/policy.js";

const evidence: EvidenceRef = {
  kind: "communication_message",
  id: "msg_1",
  summary: "ok",
};

describe("rejectIfProposesPaymentInitiation", () => {
  it("rejects text proposing payment initiation", () => {
    const result = rejectIfProposesPaymentInitiation({
      text: "We will initiate the payment for you on Monday.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfProposesPaymentInitiation");
    }
  });

  it("rejects 'just take the money' phrasing", () => {
    const result = rejectIfProposesPaymentInitiation({
      text: "Just take the money from our account.",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects when payment_initiation_request flag is set", () => {
    const result = rejectIfProposesPaymentInitiation({
      text: "All good.",
      safetyFlags: ["payment_initiation_request"],
    });
    expect(result.ok).toBe(false);
  });

  it("passes for neutral chase text", () => {
    const result = rejectIfProposesPaymentInitiation({
      text: "Could you confirm when payment will be made?",
    });
    expect(result.ok).toBe(true);
  });
});

describe("rejectIfClaimsObligationSafe", () => {
  it("rejects 'payroll is safe' claim", () => {
    const result = rejectIfClaimsObligationSafe({ text: "Payroll is safe for next month." });
    expect(result.ok).toBe(false);
  });

  it("rejects 'tax is covered' claim", () => {
    const result = rejectIfClaimsObligationSafe({ text: "Tax is covered for the quarter." });
    expect(result.ok).toBe(false);
  });

  it("rejects 'mark payroll as safe' instruction", () => {
    const result = rejectIfClaimsObligationSafe({ text: "Marked payroll as safe." });
    expect(result.ok).toBe(false);
  });

  it("rejects when payroll_safety_claim flag is set", () => {
    const result = rejectIfClaimsObligationSafe({
      text: "All good.",
      safetyFlags: ["payroll_safety_claim"],
    });
    expect(result.ok).toBe(false);
  });

  it("passes when only computing numbers without making the call", () => {
    const result = rejectIfClaimsObligationSafe({
      text: "Cash position is GBP 12,000 against payroll of GBP 9,000 this month.",
    });
    expect(result.ok).toBe(true);
  });
});

describe("rejectIfMissingEvidence", () => {
  it("rejects with zero evidence refs", () => {
    const result = rejectIfMissingEvidence({ evidenceRefs: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects when below the requested minimum", () => {
    const result = rejectIfMissingEvidence({ evidenceRefs: [evidence] }, 2);
    expect(result.ok).toBe(false);
  });

  it("passes with one evidence ref", () => {
    const result = rejectIfMissingEvidence({ evidenceRefs: [evidence] });
    expect(result.ok).toBe(true);
  });
});

describe("rejectIfLegalAdvice", () => {
  it("rejects insolvency advice", () => {
    const result = rejectIfLegalAdvice({
      text: "We recommend you start insolvency proceedings against the customer.",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects litigation advice", () => {
    const result = rejectIfLegalAdvice({
      text: "You should file a claim under the late payment statute.",
    });
    expect(result.ok).toBe(false);
  });

  it("passes when surfacing that the customer mentioned legal threat", () => {
    const result = rejectIfLegalAdvice({
      text: "Customer mentioned consulting their lawyers; route to a human.",
    });
    expect(result.ok).toBe(true);
  });
});

describe("rejectIfTaxAdvice", () => {
  it("rejects VAT reclaim advice", () => {
    const result = rejectIfTaxAdvice({
      text: "You can reclaim VAT on this invoice through your next VAT return.",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects tax-treatment advice", () => {
    const result = rejectIfTaxAdvice({
      text: "Under HMRC rules, this should be written off for tax purposes.",
    });
    expect(result.ok).toBe(false);
  });

  it("passes when describing cash impact without treatment advice", () => {
    const result = rejectIfTaxAdvice({
      text: "The outstanding tax obligation due 2026-05-22 is GBP 4,200.",
    });
    expect(result.ok).toBe(true);
  });
});

describe("applyPolicyValidators", () => {
  it("returns the first refusal", () => {
    const result = applyPolicyValidators({
      text: "Just take the money. Payroll is safe.",
      evidenceRefs: [evidence],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["rejectIfProposesPaymentInitiation", "rejectIfClaimsObligationSafe"]).toContain(result.rule);
    }
  });

  it("passes a clean target", () => {
    const result = applyPolicyValidators({
      text: "Could you confirm when payment will be made?",
      evidenceRefs: [evidence],
    });
    expect(result.ok).toBe(true);
  });
});
