import type { CollectionAction } from "@runwayops/domain";

import { requirementsFor } from "./approval-matrix.js";
import type { PolicyContext, PolicyDeny, PolicyVerdict } from "./types.js";

const DENY = (rule: PolicyDeny["rule"], reason: string): PolicyDeny => ({
  allowed: false,
  rule,
  reason,
});

// --- Payment-initiation action kinds that imply moving money ---
// These kinds do not exist in the current domain enum, but if they ever
// appear (via extension or misconfiguration) the policy layer blocks them.
// Additionally, supplier_timing changes to "send" channel imply disbursement.
const PAYMENT_INITIATION_KINDS = new Set<string>([
  "initiate_payment",
  "send_payment",
  "disburse_funds",
  "wire_transfer",
]);

/**
 * Rule: rejectIfPaymentInitiation
 *
 * Why: RunwayOps does NOT initiate payments. Payment initiation is out of
 * MVP scope and out of the system's bounded permission set. Even if a
 * human approves it, the deterministic policy layer refuses because the
 * product must not move money.
 */
export function rejectIfPaymentInitiation(
  action: CollectionAction,
  _ctx: PolicyContext,
): PolicyVerdict | null {
  if (PAYMENT_INITIATION_KINDS.has(action.actionKind)) {
    return DENY(
      "rejectIfPaymentInitiation",
      `Action kind "${action.actionKind}" implies payment initiation. RunwayOps does not move money.`,
    );
  }
  return null;
}

/**
 * Rule: rejectIfMissingEvidence
 *
 * Why: Every action that can reach a customer or external system must
 * carry at least one evidence ref pointing back to the trusted facts
 * that justify it. Without evidence the action is not auditable.
 */
export function rejectIfMissingEvidence(
  action: CollectionAction,
  _ctx: PolicyContext,
): PolicyVerdict | null {
  if (action.actionKind === "no_action") {
    return null; // internal no-ops don't require evidence
  }
  if (!action.evidenceRefs || action.evidenceRefs.length === 0) {
    return DENY(
      "rejectIfMissingEvidence",
      "Action has no evidence refs. At least one evidence reference is required for auditability.",
    );
  }
  return null;
}

/**
 * Rule: rejectIfAutonomousSend
 *
 * Why: No external communication may leave the system without human
 * approval. If the channel is not "internal" and the action has not been
 * explicitly approved, it MUST be blocked. "No autonomous send" is a
 * product invariant — the spec requires human approval before every
 * external communication.
 */
export function rejectIfAutonomousSend(
  action: CollectionAction,
  _ctx: PolicyContext,
): PolicyVerdict | null {
  if (action.channel === "internal") {
    return null;
  }
  if (action.status !== "approved") {
    return DENY(
      "rejectIfAutonomousSend",
      `Action on channel "${action.channel}" has status "${action.status}" — only "approved" actions may dispatch externally.`,
    );
  }
  return null;
}

/**
 * Rule: rejectIfApprovalExpired
 *
 * Why: Approvals have a time-to-live per action kind. A stale approval
 * does not authorize dispatch because the underlying facts (cash position,
 * customer state, obligation urgency) may have changed since the human
 * reviewed them.
 */
export function rejectIfApprovalExpired(
  action: CollectionAction,
  ctx: PolicyContext,
): PolicyVerdict | null {
  if (!ctx.approval) {
    return null; // no approval present — other rules handle requirement
  }
  if (ctx.approval.status !== "approved") {
    return null; // not yet approved, TTL not relevant
  }
  const decision = ctx.approval.decision;
  if (!decision) {
    return null;
  }
  const requirements = requirementsFor(action.actionKind);
  if (requirements.ttlHours === 0) {
    return null; // no TTL constraint
  }
  const approvedAt = decision.decidedAt;
  const expiresAt = new Date(
    approvedAt.getTime() + requirements.ttlHours * 60 * 60 * 1000,
  );
  if (ctx.now > expiresAt) {
    return DENY(
      "rejectIfApprovalExpired",
      `Approval expired at ${expiresAt.toISOString()}. TTL for "${action.actionKind}" is ${requirements.ttlHours}h.`,
    );
  }
  return null;
}

/**
 * Rule: rejectIfActorMismatch
 *
 * Why: The system actor that proposed the action and the human who
 * approved it must be distinct identities to maintain separation of
 * concerns. If the same human acts in both roles, the audit entry MUST
 * record both hats explicitly — but the gate still ALLOWS it because
 * in small teams the same person often proposes and approves.
 *
 * This rule currently ALWAYS passes (returns null) — it exists to
 * document the invariant and to provide the hook for future enforcement
 * (e.g. requiring two distinct humans for high-value actions).
 *
 * Note: the audit layer is responsible for recording dual-hat usage.
 */
export function rejectIfActorMismatch(
  _action: CollectionAction,
  _ctx: PolicyContext,
): PolicyVerdict | null {
  // Per spec: "the gate still allows it" — this rule is a documentation
  // hook, not a hard refusal. Dual-hat is recorded at the audit layer.
  return null;
}

// --- Obligation-safety claim patterns ---
const OBLIGATION_SAFETY_PHRASES: readonly RegExp[] = [
  /\b(payroll|tax|rent|loan|supplier|obligation)s? (is|are|will be|should be|looks?) (safe|covered|fine|ok|okay|secured?|sorted|handled)\b/i,
  /\bno need to worry about (payroll|tax|rent|loan|supplier)\b/i,
  /\b(payroll|tax|rent|loan) will be (paid|made|funded) (on time|in full)\b/i,
  /\bmark(ed)? (payroll|tax|rent|loan|supplier) (as )?safe\b/i,
  /\b(can confirm|i confirm|confirmed) (that )?(payroll|tax|rent|loan)\b/i,
];

function textFieldsOf(action: CollectionAction): string {
  const parts: string[] = [action.reason];
  if (action.metadata) {
    parts.push(JSON.stringify(action.metadata));
  }
  return parts.join("\n");
}

/**
 * Rule: rejectIfClaimsObligationSafe
 *
 * Why: The AI and the human-facing text of an action MUST NOT assert
 * that payroll, tax, rent, loan, or supplier obligations are "safe" or
 * "covered". Only the deterministic cash engine plus a human approver
 * can make that call. If the action's reason or metadata contains such
 * a claim, the policy layer rejects it before it can reach a customer.
 */
export function rejectIfClaimsObligationSafe(
  action: CollectionAction,
  _ctx: PolicyContext,
): PolicyVerdict | null {
  const text = textFieldsOf(action);
  for (const pattern of OBLIGATION_SAFETY_PHRASES) {
    if (pattern.test(text)) {
      return DENY(
        "rejectIfClaimsObligationSafe",
        "Action text asserts an obligation (payroll/tax/rent/loan/supplier) is safe/covered. Only the deterministic engine plus a human can make the safety call.",
      );
    }
  }
  return null;
}

/**
 * Ordered list of all policy rules. Evaluated top-to-bottom; first
 * denial wins.
 */
export const ALL_RULES: ReadonlyArray<
  (action: CollectionAction, ctx: PolicyContext) => PolicyVerdict | null
> = [
  rejectIfPaymentInitiation,
  rejectIfMissingEvidence,
  rejectIfAutonomousSend,
  rejectIfApprovalExpired,
  rejectIfActorMismatch,
  rejectIfClaimsObligationSafe,
];
