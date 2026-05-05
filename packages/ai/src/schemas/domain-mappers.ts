import { money, type EvidenceRef, type Money, type PromiseType } from "@runwayops/domain";

import {
  applyPolicyValidators,
  rejectIfClaimsObligationSafe,
  rejectIfLegalAdvice,
  rejectIfMissingEvidence,
  rejectIfProposesPaymentInitiation,
  rejectIfTaxAdvice,
  type PolicyResult,
  type PolicyTarget,
  type RefusalRule,
} from "../validators/policy.js";

import type { AuditExplanation, AuditInput } from "./audit-explanation.js";
import type { DraftChannel, DraftMessageInput, DraftTone, MessageDraft } from "./draft-message.js";
import type { EvidenceSummary } from "./evidence-summary.js";
import type { PromiseExtraction } from "./promise-extraction.js";
import type {
  ReplyClassification,
  ReplyClassificationName,
} from "./reply-classification.js";
import type { RecommendedAction, SafetyFlag } from "./common.js";

export type ProposalAccepted<T> = { ok: true; proposal: T };

export type ProposalRejected = {
  ok: false;
  rule: RefusalRule | "schemaInvariant";
  reason: string;
};

export type ProposalResult<T> = ProposalAccepted<T> | ProposalRejected;

function refuseFromPolicy(result: PolicyResult): ProposalRejected {
  if (result.ok) {
    throw new Error("refuseFromPolicy called with a passing result");
  }
  return { ok: false, rule: result.rule, reason: result.reason };
}

function refuseSchema(reason: string): ProposalRejected {
  return { ok: false, rule: "schemaInvariant", reason };
}

// ---------------------------------------------------------------------------
// 1. Reply classification -> triage action proposal
// ---------------------------------------------------------------------------

export type TriageActionProposal = {
  classification: ReplyClassificationName;
  recommendedAction: RecommendedAction;
  requiresApproval: true;
  evidenceRefs: EvidenceRef[];
  safetyFlags: SafetyFlag[];
  riskReason: string;
  uncertaintyReason: string;
  confidence: number;
  promisedDate?: Date;
  amountPromised?: Money;
  conditionText?: string;
  disputeReason?: string;
};

function buildTriageBaseProposal(classification: ReplyClassification): TriageActionProposal {
  const base: TriageActionProposal = {
    classification: classification.classification,
    recommendedAction: classification.recommended_action,
    requiresApproval: true,
    evidenceRefs: classification.evidence_refs,
    safetyFlags: classification.safety_flags,
    riskReason: classification.risk_reason,
    uncertaintyReason: classification.uncertainty_reason,
    confidence: classification.confidence,
  };

  if (classification.promised_date) {
    base.promisedDate = new Date(`${classification.promised_date}T00:00:00.000Z`);
  }

  if (classification.amount_minor && classification.currency) {
    base.amountPromised = money(classification.amount_minor, classification.currency);
  }

  if (classification.condition_text) {
    base.conditionText = classification.condition_text;
  }

  if (classification.dispute_reason) {
    base.disputeReason = classification.dispute_reason;
  }

  return base;
}

export function replyClassificationToTriageProposal(
  classification: ReplyClassification,
): ProposalResult<TriageActionProposal> {
  if (!classification.requires_approval) {
    return refuseSchema("Triage proposals must always require approval; classification.requires_approval was false.");
  }

  if (classification.classification === "conditional_promise" && !classification.condition_text) {
    return refuseSchema("Conditional promises must include condition_text.");
  }

  const target: PolicyTarget = {
    text: [classification.condition_text ?? "", classification.dispute_reason ?? ""].filter(Boolean).join("\n"),
    classification: classification.classification,
    recommendedAction: classification.recommended_action,
    safetyFlags: classification.safety_flags,
    evidenceRefs: classification.evidence_refs,
  };

  const policy = applyPolicyValidators(target, [
    (t) => rejectIfMissingEvidence(t, 1),
    rejectIfProposesPaymentInitiation,
    rejectIfClaimsObligationSafe,
    rejectIfLegalAdvice,
    rejectIfTaxAdvice,
  ]);

  if (!policy.ok) {
    return refuseFromPolicy(policy);
  }

  return { ok: true, proposal: buildTriageBaseProposal(classification) };
}

// ---------------------------------------------------------------------------
// 2. Promise extraction -> PromiseToPay proposal
// ---------------------------------------------------------------------------

export type PromiseToPayProposal = {
  promiseType: PromiseType;
  amountPromised?: Money;
  promisedDate?: Date;
  conditionText?: string;
  extractedText: string;
  confidenceAtCreation: number;
  evidenceRefs: EvidenceRef[];
  sourceMessageId?: string;
  createdBy: "ai";
  safetyFlags: SafetyFlag[];
  requiresApproval: true;
};

export function promiseExtractionToProposal(
  extraction: PromiseExtraction,
  extractedText: string,
): ProposalResult<PromiseToPayProposal> {
  if (!extraction.has_promise || !extraction.promise_type) {
    return refuseSchema("Promise extraction did not yield a promise to map.");
  }

  if (extraction.promise_type === "conditional" && !extraction.condition_text) {
    return refuseSchema("Conditional promise is missing condition_text.");
  }

  const trimmedExtractedText = extractedText.trim();
  if (trimmedExtractedText.length === 0) {
    return refuseSchema("PromiseToPay proposal requires non-empty extractedText.");
  }

  const target: PolicyTarget = {
    text: extraction.condition_text ?? "",
    classification: extraction.classification,
    recommendedAction: extraction.recommended_action,
    safetyFlags: extraction.safety_flags,
    evidenceRefs: extraction.evidence_refs,
  };

  const policy = applyPolicyValidators(target, [
    (t) => rejectIfMissingEvidence(t, 1),
    rejectIfProposesPaymentInitiation,
    rejectIfClaimsObligationSafe,
    rejectIfLegalAdvice,
    rejectIfTaxAdvice,
  ]);
  if (!policy.ok) {
    return refuseFromPolicy(policy);
  }

  const proposal: PromiseToPayProposal = {
    promiseType: extraction.promise_type,
    extractedText: trimmedExtractedText,
    confidenceAtCreation: extraction.cash_confidence,
    evidenceRefs: extraction.evidence_refs,
    createdBy: "ai",
    safetyFlags: extraction.safety_flags,
    requiresApproval: true,
  };

  if (extraction.amount_promised_minor && extraction.currency) {
    proposal.amountPromised = money(extraction.amount_promised_minor, extraction.currency);
  }

  if (extraction.promised_date) {
    proposal.promisedDate = new Date(`${extraction.promised_date}T00:00:00.000Z`);
  }

  if (extraction.condition_text) {
    proposal.conditionText = extraction.condition_text;
  }

  if (extraction.source_message_id) {
    proposal.sourceMessageId = extraction.source_message_id;
  }

  return { ok: true, proposal };
}

// ---------------------------------------------------------------------------
// 3. Draft message -> CollectionAction proposal
// ---------------------------------------------------------------------------

export type CollectionActionType =
  | "email"
  | "sms"
  | "phone_task"
  | "founder_escalation"
  | "no_action";

export type CollectionActionProposal = {
  type: CollectionActionType;
  reason: string;
  draftSubject: string;
  draftBody: string;
  channel: DraftChannel;
  tone: DraftTone;
  callToAction: string;
  evidenceRefs: EvidenceRef[];
  evidenceConfidence: number;
  requiresApproval: true;
  safetyFlags: SafetyFlag[];
  approvalNotes: string | null;
  recommendedAction: RecommendedAction;
};

function channelToActionType(channel: DraftChannel): CollectionActionType {
  switch (channel) {
    case "email":
      return "email";
    case "sms":
      return "sms";
    case "phone_task":
      return "phone_task";
    case "internal_note":
      return "no_action";
  }
}

export function draftMessageToCollectionActionProposal(
  draft: MessageDraft,
  context?: { actionInput?: DraftMessageInput },
): ProposalResult<CollectionActionProposal> {
  if (!draft.requires_approval) {
    return refuseSchema("Drafts must always require approval; draft.requires_approval was false.");
  }

  const target: PolicyTarget = {
    text: [draft.body, draft.subject, draft.call_to_action, draft.approval_notes ?? ""].join("\n"),
    classification: draft.classification,
    recommendedAction: draft.recommended_action,
    safetyFlags: draft.safety_flags,
    evidenceRefs: draft.evidence_refs,
  };

  const policy = applyPolicyValidators(target, [
    (t) => rejectIfMissingEvidence(t, 1),
    rejectIfProposesPaymentInitiation,
    rejectIfClaimsObligationSafe,
    rejectIfLegalAdvice,
    rejectIfTaxAdvice,
  ]);
  if (!policy.ok) {
    return refuseFromPolicy(policy);
  }

  const proposal: CollectionActionProposal = {
    type: channelToActionType(draft.channel),
    reason: context?.actionInput?.action_type
      ? `Draft generated for ${context.actionInput.action_type}.`
      : `Draft generated for ${draft.classification}.`,
    draftSubject: draft.subject,
    draftBody: draft.body,
    channel: draft.channel,
    tone: draft.tone,
    callToAction: draft.call_to_action,
    evidenceRefs: draft.evidence_refs,
    evidenceConfidence: draft.confidence,
    requiresApproval: true,
    safetyFlags: draft.safety_flags,
    approvalNotes: draft.approval_notes,
    recommendedAction: draft.recommended_action,
  };

  return { ok: true, proposal };
}

// ---------------------------------------------------------------------------
// 4. Evidence summary -> AuditEvent payload
// ---------------------------------------------------------------------------

export type AuditEventProposalPayload = {
  action: string;
  summary: string;
  evidenceRefs: EvidenceRef[];
  notes?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export type AuditEventProposalContext = {
  eventName: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export function evidenceSummaryToAuditEventPayload(
  summary: EvidenceSummary,
  context: AuditEventProposalContext,
): ProposalResult<AuditEventProposalPayload> {
  const target: PolicyTarget = {
    text: summary.summary,
    classification: summary.classification,
    recommendedAction: summary.recommended_action,
    safetyFlags: summary.safety_flags,
    evidenceRefs: summary.evidence_refs,
  };

  const policy = applyPolicyValidators(target, [
    (t) => rejectIfMissingEvidence(t, 1),
    rejectIfProposesPaymentInitiation,
    rejectIfClaimsObligationSafe,
    rejectIfLegalAdvice,
    rejectIfTaxAdvice,
  ]);
  if (!policy.ok) {
    return refuseFromPolicy(policy);
  }

  const payload: AuditEventProposalPayload = {
    action: context.eventName,
    summary: summary.summary,
    evidenceRefs: summary.evidence_refs,
  };

  if (summary.missing_evidence.length > 0) {
    payload.notes = `Missing evidence noted: ${summary.missing_evidence.join("; ")}`;
  }

  if (context.before) {
    payload.before = context.before;
  }

  if (context.after) {
    payload.after = context.after;
  }

  return { ok: true, proposal: payload };
}

// ---------------------------------------------------------------------------
// 5. Audit explanation -> AuditEvent payload (covers AuditInput-driven flow)
// ---------------------------------------------------------------------------

export function auditExplanationToAuditEventPayload(
  explanation: AuditExplanation,
  input: Pick<AuditInput, "event_name" | "decision">,
): ProposalResult<AuditEventProposalPayload> {
  const target: PolicyTarget = {
    text: [explanation.explanation, explanation.audit_summary].join("\n"),
    classification: explanation.classification,
    recommendedAction: explanation.recommended_action,
    safetyFlags: explanation.safety_flags,
    evidenceRefs: explanation.evidence_refs,
  };

  const policy = applyPolicyValidators(target, [
    (t) => rejectIfMissingEvidence(t, 1),
    rejectIfProposesPaymentInitiation,
    rejectIfClaimsObligationSafe,
    rejectIfLegalAdvice,
    rejectIfTaxAdvice,
  ]);
  if (!policy.ok) {
    return refuseFromPolicy(policy);
  }

  const payload: AuditEventProposalPayload = {
    action: input.event_name,
    summary: `${input.decision}. ${explanation.audit_summary}`,
    evidenceRefs: explanation.evidence_refs,
  };

  return { ok: true, proposal: payload };
}
