import type { CollectionAction } from "@runwayops/domain";

import { requirementsFor } from "./approval-matrix.js";
import { ALL_RULES } from "./rules.js";
import type { PolicyContext, PolicyVerdict } from "./types.js";

/**
 * evaluatePolicy — the core deterministic rules engine.
 *
 * Pure function. No I/O. Given a proposed collection action and a policy
 * context, returns either an Allow verdict (with required approver roles)
 * or a Deny verdict (with the failing rule name and reason).
 *
 * Rules are evaluated in documented order (see ALL_RULES). First denial
 * wins. If all rules pass, the verdict is Allow.
 */
export function evaluatePolicy(
  action: CollectionAction,
  ctx: PolicyContext,
): PolicyVerdict {
  for (const rule of ALL_RULES) {
    const result = rule(action, ctx);
    if (result !== null && !result.allowed) {
      return result;
    }
  }

  const requirements = requirementsFor(action.actionKind);
  return {
    allowed: true,
    requiredApprovers: [requirements.requiredApproverRole],
  };
}
