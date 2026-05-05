import { daysUntil } from "./dates.ts";
import { clampProbability } from "./policy.ts";
import type { CashEnginePolicy, CustomerPaymentStats, PromiseToPay, PromiseType } from "./types.ts";

export const BASE_CONFIDENCE_BY_PROMISE_TYPE: Record<PromiseType, number> = {
  firm: 0.75,
  conditional: 0.45,
  vague: 0.25,
  partial: 0.55,
  disputed: 0.15,
  cannot_pay: 0.05,
  already_paid_claim: 0.35
};

export type PromiseConfidenceComponents = {
  baseConfidence: number;
  customerReliabilityFactor: number;
  evidenceConfidence: number;
  recencyFactor: number;
  conditionPenalty: number;
  disputePenalty: number;
  finalConfidence: number;
};

export function customerReliabilityFactor(
  promise: Pick<PromiseToPay, "promiseType">,
  stats?: CustomerPaymentStats
): number {
  if (!stats) return 1;

  const keptRate =
    promise.promiseType === "conditional"
      ? stats.conditionalPromiseKeptRate ?? stats.promiseKeptRate ?? 0.6
      : stats.promiseKeptRate ?? 0.6;
  const disputeRate = stats.disputeRate ?? 0;
  const brokenPenalty = Math.min((stats.brokenPromiseCount ?? 0) * 0.03, 0.18);
  const daysLatePenalty = Math.min(Math.max(stats.averageDaysLate ?? 0, 0) * 0.01, 0.2);

  return clampBetween(0.65 + keptRate * 0.7 - disputeRate * 0.25 - brokenPenalty - daysLatePenalty, 0.55, 1.35);
}

export function recencyFactor(promise: Pick<PromiseToPay, "createdAt">, asOfDate: Date | string): number {
  if (!promise.createdAt) return 1;

  const ageDays = Math.max(0, daysUntil(promise.createdAt, asOfDate));
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.95;
  if (ageDays <= 90) return 0.85;
  return 0.75;
}

export function conditionPenalty(promise: Pick<PromiseToPay, "promiseType" | "conditionText">): number {
  if (promise.promiseType !== "conditional") return 1;
  return promise.conditionText && promise.conditionText.trim().length > 0 ? 0.95 : 0.8;
}

export function disputePenalty(
  promise: Pick<PromiseToPay, "promiseType">,
  stats?: Pick<CustomerPaymentStats, "disputeRate">
): number {
  if (promise.promiseType === "disputed") return 0.5;
  return clampBetween(1 - (stats?.disputeRate ?? 0) * 0.3, 0.7, 1);
}

export function calculatePromiseConfidence(
  promise: PromiseToPay,
  stats: CustomerPaymentStats | undefined,
  asOfDate: Date | string,
  _policy?: Partial<CashEnginePolicy>
): PromiseConfidenceComponents {
  if (promise.outcome === "kept") {
    return fixedOutcomeConfidence(1);
  }

  if (promise.outcome === "partially_kept" || promise.outcome === "late") {
    return fixedOutcomeConfidence(0.4);
  }

  if (promise.outcome === "broken" || promise.outcome === "disputed" || promise.outcome === "superseded") {
    return fixedOutcomeConfidence(0);
  }

  if (promise.promiseType === "already_paid_claim" && promise.matchedPaymentId) {
    return fixedOutcomeConfidence(0.95);
  }

  const baseConfidence = BASE_CONFIDENCE_BY_PROMISE_TYPE[promise.promiseType];
  const customerFactor = customerReliabilityFactor(promise, stats);
  const evidenceConfidence = clampProbability(promise.evidenceConfidence ?? promise.confidenceAtCreation ?? 1);
  const recent = recencyFactor(promise, asOfDate);
  const conditional = conditionPenalty(promise);
  const dispute = disputePenalty(promise, stats);
  const finalConfidence = clampProbability(baseConfidence * customerFactor * evidenceConfidence * recent * conditional * dispute);

  return {
    baseConfidence,
    customerReliabilityFactor: customerFactor,
    evidenceConfidence,
    recencyFactor: recent,
    conditionPenalty: conditional,
    disputePenalty: dispute,
    finalConfidence
  };
}

function fixedOutcomeConfidence(finalConfidence: number): PromiseConfidenceComponents {
  return {
    baseConfidence: finalConfidence,
    customerReliabilityFactor: 1,
    evidenceConfidence: 1,
    recencyFactor: 1,
    conditionPenalty: 1,
    disputePenalty: 1,
    finalConfidence
  };
}

function clampBetween(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
