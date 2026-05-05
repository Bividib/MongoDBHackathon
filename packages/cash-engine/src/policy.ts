import type { CashEnginePolicy } from "./types.ts";

export const DEFAULT_CASH_ENGINE_POLICY: CashEnginePolicy = {
  highConfidenceThreshold: 0.8,
  mediumConfidenceThreshold: 0.5,
  criticalObligationWindowDays: 7,
  watchObligationWindowDays: 14,
  immediateInterventionWindowDays: 2,
  defaultInvoiceConfidence: 0.45,
  staleInvoiceConfidence: 0.25
};

export function resolvePolicy(policy?: Partial<CashEnginePolicy>): CashEnginePolicy {
  return {
    ...DEFAULT_CASH_ENGINE_POLICY,
    ...policy
  };
}

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function classifyConfidence(
  confidence: number,
  policy: Pick<CashEnginePolicy, "highConfidenceThreshold" | "mediumConfidenceThreshold"> = DEFAULT_CASH_ENGINE_POLICY
): "high" | "medium" | "low" {
  if (confidence >= policy.highConfidenceThreshold) return "high";
  if (confidence >= policy.mediumConfidenceThreshold) return "medium";
  return "low";
}
