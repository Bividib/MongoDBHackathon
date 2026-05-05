import { describe, expect, it } from "vitest";
import { MockModelRouter } from "../src/mock-adapter.js";
import {
  auditExplanationToAuditEventPayload,
  draftMessageToCollectionActionProposal,
  evidenceSummaryToAuditEventPayload,
  promiseExtractionToProposal,
  replyClassificationToTriageProposal,
  type CollectionActionProposal,
  type PromiseToPayProposal,
  type TriageActionProposal,
} from "../src/schemas/domain-mappers.js";
import type {
  EvidenceRef,
  EvidenceSummary,
  MessageDraft,
  PromiseExtraction,
  ReplyClassification,
} from "../src/schemas/index.js";

const TODAY = "2026-05-04";

const evidence: EvidenceRef = {
  kind: "communication_message",
  id: "msg_1",
  summary: "We will pay £1,200 this Friday.",
  sourceProvider: "manual_email",
};

const router = new MockModelRouter();

function buildClassificationFixture(reply: string): Promise<ReplyClassification> {
  return router.classifyReply({
    customer_reply: reply,
    today: TODAY,
    invoice_context: [],
    evidence_refs: [evidence],
  });
}

describe("replyClassificationToTriageProposal", () => {
  it("accepts a clean firm-promise classification", async () => {
    const classification = await buildClassificationFixture("We will pay £1,200 this Friday.");
    const result = replyClassificationToTriageProposal(classification);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const p: TriageActionProposal = result.proposal;
      expect(p.classification).toBe("firm_promise");
      expect(p.requiresApproval).toBe(true);
      expect(p.evidenceRefs.length).toBeGreaterThan(0);
    }
  });

  it("rejects when evidence is missing", () => {
    const classification: ReplyClassification = {
      classification: "firm_promise",
      confidence: 0.7,
      evidence_refs: [],
      recommended_action: "record_promise",
      requires_approval: true,
      risk_reason: "ok",
      uncertainty_reason: "ok",
      safety_flags: [],
      promised_date: null,
      amount_minor: null,
      currency: null,
      condition_text: null,
      dispute_reason: null,
    };
    const result = replyClassificationToTriageProposal(classification);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfMissingEvidence");
    }
  });

  it("rejects when classification implies obligation safety claim via flag", () => {
    const classification: ReplyClassification = {
      classification: "other",
      confidence: 0.4,
      evidence_refs: [evidence],
      recommended_action: "escalate_for_review",
      requires_approval: true,
      risk_reason: "ok",
      uncertainty_reason: "ok",
      safety_flags: ["payroll_safety_claim"],
      promised_date: null,
      amount_minor: null,
      currency: null,
      condition_text: null,
      dispute_reason: null,
    };
    const result = replyClassificationToTriageProposal(classification);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfClaimsObligationSafe");
    }
  });
});

describe("promiseExtractionToProposal", () => {
  it("accepts a firm promise and returns a typed PromiseToPayProposal", async () => {
    const extraction = await router.extractPromise({
      customer_reply: "We will pay £1,200 this Friday.",
      today: TODAY,
      evidence_refs: [evidence],
      invoice_context: [],
    });
    const result = promiseExtractionToProposal(extraction, "We will pay £1,200 this Friday.");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const p: PromiseToPayProposal = result.proposal;
      expect(p.promiseType).toBe("firm");
      expect(p.amountPromised?.amountMinor).toBe(120000n);
      expect(p.amountPromised?.currency).toBe("GBP");
      expect(p.requiresApproval).toBe(true);
      expect(p.createdBy).toBe("ai");
    }
  });

  it("rejects when has_promise is false", () => {
    const extraction: PromiseExtraction = {
      classification: "no_promise",
      has_promise: false,
      promise_type: null,
      amount_promised_minor: null,
      currency: null,
      promised_date: null,
      condition_text: null,
      payer_contact: null,
      source_message_id: null,
      cash_confidence: 0,
      confidence: 0.4,
      evidence_refs: [evidence],
      recommended_action: "no_action",
      requires_approval: true,
      risk_reason: "ok",
      uncertainty_reason: "ok",
      safety_flags: [],
    };
    const result = promiseExtractionToProposal(extraction, "we are looking into it");
    expect(result.ok).toBe(false);
  });

  it("rejects when conditional promise is missing condition text", () => {
    const extraction: PromiseExtraction = {
      classification: "promise_extracted",
      has_promise: true,
      promise_type: "conditional",
      amount_promised_minor: null,
      currency: null,
      promised_date: null,
      condition_text: null,
      payer_contact: null,
      source_message_id: null,
      cash_confidence: 0.5,
      confidence: 0.7,
      evidence_refs: [evidence],
      recommended_action: "record_promise",
      requires_approval: true,
      risk_reason: "ok",
      uncertainty_reason: "ok",
      safety_flags: [],
    };
    const result = promiseExtractionToProposal(extraction, "ok");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("schemaInvariant");
    }
  });
});

describe("draftMessageToCollectionActionProposal", () => {
  it("accepts a clean follow-up draft", async () => {
    const draft = await router.draftMessage({
      action_type: "follow_up",
      customer_name: "Alex",
      company_name: "RunwayOps Demo Ltd",
      channel: "email",
      tone: "polite",
      today: TODAY,
      invoice_context: [
        {
          invoice_id: "inv_1",
          invoice_number: "INV-1",
          amount_due_minor: "120000",
          currency: "GBP",
        },
      ],
      evidence_refs: [evidence],
    });
    const result = draftMessageToCollectionActionProposal(draft);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const p: CollectionActionProposal = result.proposal;
      expect(p.requiresApproval).toBe(true);
      expect(p.draftBody.length).toBeGreaterThan(0);
      expect(p.evidenceRefs.map((ref) => ref.id)).toContain(evidence.id);
    }
  });

  it("rejects a synthetic draft that contains payment-initiation phrasing", () => {
    const draft: MessageDraft = {
      classification: "customer_chaser_draft",
      channel: "email",
      tone: "polite",
      subject: "Follow up",
      body: "We will initiate the payment on your behalf and send a receipt.",
      call_to_action: "Confirm.",
      approval_notes: null,
      confidence: 0.6,
      evidence_refs: [evidence],
      recommended_action: "draft_follow_up",
      requires_approval: true,
      risk_reason: "ok",
      uncertainty_reason: "ok",
      safety_flags: [],
    };
    const result = draftMessageToCollectionActionProposal(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfProposesPaymentInitiation");
    }
  });

  it("rejects a synthetic draft that claims payroll is safe", () => {
    const draft: MessageDraft = {
      classification: "customer_chaser_draft",
      channel: "email",
      tone: "polite",
      subject: "Follow up",
      body: "Don't worry; payroll is safe even if this invoice is delayed.",
      call_to_action: "Confirm.",
      approval_notes: null,
      confidence: 0.6,
      evidence_refs: [evidence],
      recommended_action: "draft_follow_up",
      requires_approval: true,
      risk_reason: "ok",
      uncertainty_reason: "ok",
      safety_flags: [],
    };
    const result = draftMessageToCollectionActionProposal(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfClaimsObligationSafe");
    }
  });

  it("rejects a draft that emits legal advice", () => {
    const draft: MessageDraft = {
      classification: "customer_chaser_draft",
      channel: "email",
      tone: "polite",
      subject: "Follow up",
      body: "We recommend you file a claim under the late payment statute.",
      call_to_action: "Confirm.",
      approval_notes: null,
      confidence: 0.6,
      evidence_refs: [evidence],
      recommended_action: "draft_follow_up",
      requires_approval: true,
      risk_reason: "ok",
      uncertainty_reason: "ok",
      safety_flags: [],
    };
    const result = draftMessageToCollectionActionProposal(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfLegalAdvice");
    }
  });
});

describe("evidenceSummaryToAuditEventPayload", () => {
  it("accepts a clean summary", () => {
    const summary: EvidenceSummary = {
      classification: "evidence_summary",
      summary: "Customer reply received and classified as firm_promise.",
      missing_evidence: [],
      confidence: 0.7,
      evidence_refs: [evidence],
      recommended_action: "no_action",
      requires_approval: false,
      risk_reason: "ok",
      uncertainty_reason: "ok",
      safety_flags: [],
    };
    const result = evidenceSummaryToAuditEventPayload(summary, { eventName: "promise.proposed" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.action).toBe("promise.proposed");
      expect(result.proposal.evidenceRefs).toEqual([evidence]);
    }
  });

  it("rejects when summary contains tax advice", () => {
    const summary: EvidenceSummary = {
      classification: "evidence_summary",
      summary: "Under HMRC rules, you should reclaim VAT on this invoice.",
      missing_evidence: [],
      confidence: 0.7,
      evidence_refs: [evidence],
      recommended_action: "no_action",
      requires_approval: false,
      risk_reason: "ok",
      uncertainty_reason: "ok",
      safety_flags: [],
    };
    const result = evidenceSummaryToAuditEventPayload(summary, { eventName: "review" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfTaxAdvice");
    }
  });

  it("rejects when evidence is missing", () => {
    const summary: EvidenceSummary = {
      classification: "evidence_summary",
      summary: "Nothing.",
      missing_evidence: [],
      confidence: 0.5,
      evidence_refs: [],
      recommended_action: "no_action",
      requires_approval: false,
      risk_reason: "ok",
      uncertainty_reason: "ok",
      safety_flags: [],
    };
    const result = evidenceSummaryToAuditEventPayload(summary, { eventName: "review" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rule).toBe("rejectIfMissingEvidence");
    }
  });
});

describe("auditExplanationToAuditEventPayload", () => {
  it("accepts a clean explanation", async () => {
    const explanation = await router.generateAuditExplanation({
      event_name: "approval.granted",
      decision: "approved",
      evidence_refs: [evidence],
      policy_checks: ["evidence_present"],
    });
    const result = auditExplanationToAuditEventPayload(explanation, {
      event_name: "approval.granted",
      decision: "approved",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.action).toBe("approval.granted");
    }
  });
});
