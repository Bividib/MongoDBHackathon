import type {
  ApprovalRequest,
  CollectionAction,
  CollectionActionKind,
  EvidenceKind,
} from "@runwayops/domain";

/**
 * Context required by the policy engine to evaluate a proposed action.
 * Pure data — no I/O handles, no DB connections.
 */
export type PolicyContext = {
  /** The approval associated with this action, if one exists. */
  approval: ApprovalRequest | undefined;
  /** Identity of the system/AI actor that proposed the action. */
  proposerActorId: string;
  /** Identity of the human who approved (if approved). */
  approverActorId: string | undefined;
  /** Current wall-clock time for TTL checks. */
  now: Date;
};

/** A named rule that contributed to a policy decision. */
export type PolicyRuleName =
  | "rejectIfPaymentInitiation"
  | "rejectIfMissingEvidence"
  | "rejectIfAutonomousSend"
  | "rejectIfApprovalExpired"
  | "rejectIfActorMismatch"
  | "rejectIfClaimsObligationSafe";

export type PolicyDeny = {
  allowed: false;
  rule: PolicyRuleName;
  reason: string;
};

export type PolicyAllow = {
  allowed: true;
  requiredApprovers: readonly string[];
};

export type PolicyVerdict = PolicyAllow | PolicyDeny;

/** Per-actionKind approval requirements. */
export type ApprovalRequirements = {
  requiredApproverRole: string;
  requiredEvidenceKinds: readonly EvidenceKind[];
  ttlHours: number;
};

/**
 * Branded type: the ONLY type external dispatch connectors accept.
 * Cannot be constructed except via `mintGatePass`.
 */
declare const GATE_PASS_BRAND: unique symbol;

export type GatePassedAction = CollectionAction & {
  readonly [GATE_PASS_BRAND]: true;
  readonly idempotencyKey: string;
  readonly gatePassedAt: Date;
};

export type PolicyError = {
  ok: false;
  rule: PolicyRuleName;
  reason: string;
};

export type GatePassResult =
  | { ok: true; action: GatePassedAction }
  | PolicyError;

/**
 * Internal-only helper to construct the branded type.
 * NOT exported from the package public API — only used inside mintGatePass.
 */
export function _brandAction(
  action: CollectionAction,
  idempotencyKey: string,
  now: Date,
): GatePassedAction {
  return Object.freeze({
    ...action,
    [Symbol.for("GATE_PASS_BRAND") as unknown as typeof GATE_PASS_BRAND]: true as const,
    idempotencyKey,
    gatePassedAt: now,
  }) as unknown as GatePassedAction;
}
