import type { ApprovalRequest, CollectionAction } from "@runwayops/domain";

import { evaluatePolicy } from "./engine.js";
import type {
  GatePassResult,
  GatePassedAction,
  PolicyContext,
  PolicyError,
} from "./types.js";
import { _brandAction } from "./types.js";

/**
 * mintGatePass — the chokepoint every external dispatcher MUST use.
 *
 * This is the ONLY way to produce a `GatePassedAction`. The branded type
 * cannot be constructed by `as` casts or direct object construction
 * outside this module — the brand symbol is a module-private unique symbol
 * declared in types.ts.
 *
 * Evaluates the full policy engine. If the action passes, returns a
 * branded GatePassedAction that connectors can accept at compile time.
 * If the action fails, returns a typed PolicyError with { rule, reason }.
 */
export function mintGatePass(
  approval: ApprovalRequest | undefined,
  action: CollectionAction,
  idempotencyKey: string,
): GatePassResult {
  const ctx: PolicyContext = {
    approval,
    proposerActorId: action.assignedToUserId ?? "system",
    approverActorId: approval?.decision?.decidedByUserId,
    now: new Date(),
  };

  const verdict = evaluatePolicy(action, ctx);

  if (!verdict.allowed) {
    return {
      ok: false,
      rule: verdict.rule,
      reason: verdict.reason,
    };
  }

  return {
    ok: true,
    action: _brandAction(action, idempotencyKey, ctx.now),
  };
}

/**
 * mintGatePassAt — same as mintGatePass but accepts an explicit `now`
 * for deterministic testing of TTL-based rules.
 */
export function mintGatePassAt(
  approval: ApprovalRequest | undefined,
  action: CollectionAction,
  idempotencyKey: string,
  now: Date,
): GatePassResult {
  const ctx: PolicyContext = {
    approval,
    proposerActorId: action.assignedToUserId ?? "system",
    approverActorId: approval?.decision?.decidedByUserId,
    now,
  };

  const verdict = evaluatePolicy(action, ctx);

  if (!verdict.allowed) {
    return {
      ok: false,
      rule: verdict.rule,
      reason: verdict.reason,
    };
  }

  return {
    ok: true,
    action: _brandAction(action, idempotencyKey, now),
  };
}

/**
 * Type guard for use in connector code: accepts a dispatch payload
 * only if it is a GatePassedAction.
 */
export function isGatePassedAction(
  value: unknown,
): value is GatePassedAction {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.for("GATE_PASS_BRAND") in (value as Record<symbol, unknown>)
  );
}
