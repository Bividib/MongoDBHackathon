// @runwayops/policy — Deterministic policy engine for RunwayOps.
// Pure function library. No DB, no AI, no HTTP.

export { requirementsFor } from "./approval-matrix.js";
export { evaluatePolicy } from "./engine.js";
export { isGatePassedAction, mintGatePass, mintGatePassAt } from "./gate.js";
export {
  rejectIfActorMismatch,
  rejectIfApprovalExpired,
  rejectIfAutonomousSend,
  rejectIfClaimsObligationSafe,
  rejectIfMissingEvidence,
  rejectIfPaymentInitiation,
  ALL_RULES,
} from "./rules.js";
export type {
  ApprovalRequirements,
  GatePassedAction,
  GatePassResult,
  PolicyAllow,
  PolicyContext,
  PolicyDeny,
  PolicyError,
  PolicyRuleName,
  PolicyVerdict,
} from "./types.js";
