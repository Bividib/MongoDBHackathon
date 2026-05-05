import type { CollectionActionKind, EvidenceKind } from "@runwayops/domain";

import type { ApprovalRequirements } from "./types.js";

/**
 * Per-actionKind approval requirements.
 *
 * - requiredApproverRole: the minimum organizational role required to approve.
 * - requiredEvidenceKinds: evidence types that MUST be attached to the action.
 * - ttlHours: how long an approval remains valid after it is granted.
 */
const APPROVAL_MATRIX: Readonly<
  Record<CollectionActionKind, ApprovalRequirements>
> = {
  request_payment: {
    requiredApproverRole: "finance_manager",
    requiredEvidenceKinds: ["invoice", "customer"],
    ttlHours: 24,
  },
  request_partial_payment: {
    requiredApproverRole: "finance_manager",
    requiredEvidenceKinds: ["invoice", "customer", "promise_to_pay"],
    ttlHours: 24,
  },
  confirm_promise: {
    requiredApproverRole: "operations_lead",
    requiredEvidenceKinds: ["promise_to_pay", "communication_message"],
    ttlHours: 48,
  },
  resolve_dispute: {
    requiredApproverRole: "finance_manager",
    requiredEvidenceKinds: ["invoice", "communication_message"],
    ttlHours: 12,
  },
  manual_review_paid_claim: {
    requiredApproverRole: "finance_manager",
    requiredEvidenceKinds: ["invoice", "bank_transaction"],
    ttlHours: 48,
  },
  founder_escalation: {
    requiredApproverRole: "founder",
    requiredEvidenceKinds: ["invoice", "customer", "obligation"],
    ttlHours: 4,
  },
  propose_payment_plan: {
    requiredApproverRole: "finance_manager",
    requiredEvidenceKinds: ["invoice", "customer", "promise_to_pay"],
    ttlHours: 24,
  },
  request_supplier_timing: {
    requiredApproverRole: "operations_lead",
    requiredEvidenceKinds: ["obligation"],
    ttlHours: 24,
  },
  no_action: {
    requiredApproverRole: "system",
    requiredEvidenceKinds: [],
    ttlHours: 0,
  },
} as const;

/**
 * Look up the approval requirements for a given action kind.
 */
export function requirementsFor(
  kind: CollectionActionKind,
): ApprovalRequirements {
  return APPROVAL_MATRIX[kind];
}
