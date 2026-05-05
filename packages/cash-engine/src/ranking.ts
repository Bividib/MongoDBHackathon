import { calculatePromiseConfidence } from "./confidence.ts";
import { daysUntil } from "./dates.ts";
import { compareMoney, minMoney, zeroMoney } from "./money.ts";
import { resolvePolicy } from "./policy.ts";
import type {
  CollectionActionKind,
  CustomerPaymentStats,
  EvidenceRef,
  Invoice,
  Money,
  PromiseToPay,
  RankNextBestActionsInput,
  RankedCollectionAction,
  RiskStatus
} from "./types.ts";

export function rankNextBestActions(input: RankNextBestActionsInput): RankedCollectionAction[] {
  const statsByCustomer = new Map((input.customerStats ?? []).map((stats) => [stats.customerId, stats]));
  const promisesByInvoice = groupPendingPromisesByInvoice(input.promises ?? []);
  const shortfall = input.nearTermShortfall ?? input.forecast?.shortfallAmount;
  const riskStatus = input.forecast?.riskStatus ?? "safe";
  const policy = resolvePolicy(input.policy);

  const actions = input.invoices
    .filter((invoice) => isActionableInvoice(invoice))
    .map((invoice) => {
      const stats = statsByCustomer.get(invoice.customerId);
      const promises = promisesByInvoice.get(invoice.id) ?? [];
      const evidenceConfidence = evidenceConfidenceForInvoice(invoice, promises, stats, input.asOfDate);
      const probabilityOfPayment = probabilityOfPaymentAfterAction(invoice, promises, stats, input.asOfDate);
      const expectedCashImpact = expectedCashImpactForInvoice(invoice.amountDue, shortfall);
      const obligationUrgency = obligationUrgencyFactor(riskStatus, input.forecast?.obligationRisks?.[0]?.dueDate, input.asOfDate);
      const kind = actionKindForInvoice(invoice, promises, riskStatus);
      const actionEffectiveness = stats?.actionEffectiveness?.[kind] ?? stats?.paymentAfterActionRate ?? 0.65;
      const relationshipRiskPenalty = relationshipRiskPenaltyForInvoice(invoice, stats);
      const effortPenalty = actionEffortPenalty(kind);
      const priorityScore =
        cashImpactScore(expectedCashImpact) *
          probabilityOfPayment *
          obligationUrgency *
          actionEffectiveness *
          evidenceConfidence -
        relationshipRiskPenalty -
        effortPenalty;

      return {
        actionId: `action:${input.companyId}:${invoice.id}:${kind}`,
        kind,
        companyId: input.companyId,
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        priorityScore: roundScore(priorityScore),
        expectedCashImpact,
        probabilityOfPayment,
        obligationUrgency,
        actionEffectiveness,
        evidenceConfidence,
        relationshipRiskPenalty,
        actionEffortPenalty: effortPenalty,
        recommendedChannel: stats?.lastSuccessfulChannel ?? "email",
        recommendedTone: recommendedTone(riskStatus, stats),
        explanation: explanationForAction(kind, expectedCashImpact, probabilityOfPayment, obligationUrgency),
        evidenceRefs: collectActionEvidence(invoice, promises, stats)
      } satisfies RankedCollectionAction;
    })
    .filter((action) => compareMoney(action.expectedCashImpact, zeroMoney(action.expectedCashImpact.currency)) > 0);

  return actions
    .sort((left, right) => right.priorityScore - left.priorityScore || left.invoiceId.localeCompare(right.invoiceId))
    .slice(0, input.maxActions ?? actions.length);
}

function groupPendingPromisesByInvoice(promises: PromiseToPay[]): Map<string, PromiseToPay[]> {
  const grouped = new Map<string, PromiseToPay[]>();
  for (const promise of promises) {
    if (promise.outcome !== "pending" || !promise.invoiceId) continue;
    grouped.set(promise.invoiceId, [...(grouped.get(promise.invoiceId) ?? []), promise]);
  }
  return grouped;
}

function isActionableInvoice(invoice: Invoice): boolean {
  return ["sent", "authorised", "overdue", "partially_paid", "disputed"].includes(invoice.status) && invoice.amountDue.amountMinor > 0n;
}

function expectedCashImpactForInvoice(invoiceAmount: Money, shortfall: Money | undefined): Money {
  if (!shortfall || shortfall.amountMinor <= 0n) return invoiceAmount;
  return minMoney(invoiceAmount, shortfall);
}

function probabilityOfPaymentAfterAction(
  invoice: Invoice,
  promises: PromiseToPay[],
  stats: CustomerPaymentStats | undefined,
  asOfDate: Date | string
): number {
  const promiseProbability = promises.reduce(
    (highest, promise) => Math.max(highest, calculatePromiseConfidence(promise, stats, asOfDate).finalConfidence),
    0
  );
  const historicalProbability = stats?.paymentAfterActionRate ?? stats?.promiseKeptRate ?? 0.55;
  const overdueDays = Math.max(0, daysUntil(invoice.dueDate, asOfDate));
  const overduePenalty = overdueDays > 60 ? 0.25 : overdueDays > 30 ? 0.15 : overdueDays > 14 ? 0.05 : 0;
  const disputePenalty = invoice.status === "disputed" ? 0.3 : 0;
  return clampProbability(Math.max(promiseProbability, historicalProbability - overduePenalty - disputePenalty));
}

function evidenceConfidenceForInvoice(
  invoice: Invoice,
  promises: PromiseToPay[],
  stats: CustomerPaymentStats | undefined,
  asOfDate: Date | string
): number {
  const invoiceEvidence = invoice.evidenceRefs && invoice.evidenceRefs.length > 0 ? 0.95 : 0.75;
  const promiseEvidence = promises.length
    ? Math.max(...promises.map((promise) => calculatePromiseConfidence(promise, stats, asOfDate).evidenceConfidence))
    : 0.8;
  return clampProbability((invoiceEvidence + promiseEvidence) / 2);
}

function obligationUrgencyFactor(riskStatus: RiskStatus, nearestObligationDueDate: Date | string | undefined, asOfDate: Date | string): number {
  const riskFactor: Record<RiskStatus, number> = {
    safe: 1,
    watch: 1.1,
    high: 1.25,
    critical: 1.5
  };
  if (!nearestObligationDueDate) return riskFactor[riskStatus];

  const days = daysUntil(asOfDate, nearestObligationDueDate);
  const dueDateFactor = days <= 2 ? 1.5 : days <= 7 ? 1.3 : days <= 14 ? 1.1 : 1;
  return Math.max(riskFactor[riskStatus], dueDateFactor);
}

function actionKindForInvoice(invoice: Invoice, promises: PromiseToPay[], riskStatus: RiskStatus): CollectionActionKind {
  if (invoice.status === "disputed" || promises.some((promise) => promise.promiseType === "disputed")) return "resolve_dispute";
  if (promises.some((promise) => promise.promiseType === "already_paid_claim" && !promise.matchedPaymentId)) return "manual_review_paid_claim";
  if (riskStatus === "high" || riskStatus === "critical") return "request_partial_payment";
  if (promises.length > 0) return "confirm_promise";
  return "send_payment_reminder";
}

function relationshipRiskPenaltyForInvoice(invoice: Invoice, stats: CustomerPaymentStats | undefined): number {
  const statsPenalty = (stats?.relationshipRisk ?? 0) * 25;
  const disputePenalty = invoice.status === "disputed" ? 15 : 0;
  return roundScore(statsPenalty + disputePenalty);
}

function actionEffortPenalty(kind: CollectionActionKind): number {
  const penalties: Record<CollectionActionKind, number> = {
    send_payment_reminder: 2,
    request_partial_payment: 5,
    confirm_promise: 2,
    resolve_dispute: 10,
    manual_review_paid_claim: 8,
    phone_follow_up: 7
  };
  return penalties[kind];
}

function recommendedTone(riskStatus: RiskStatus, stats: CustomerPaymentStats | undefined): RankedCollectionAction["recommendedTone"] {
  if (stats?.lastSuccessfulTone) return stats.lastSuccessfulTone;
  if (riskStatus === "critical" || riskStatus === "high") return "firm";
  if (riskStatus === "watch") return "neutral";
  return "friendly";
}

function explanationForAction(kind: CollectionActionKind, expectedCashImpact: Money, probability: number, urgency: number): string {
  return `${kind} ranked from cash impact ${expectedCashImpact.currency} ${expectedCashImpact.amountMinor.toString()} minor units, payment probability ${probability.toFixed(2)}, and urgency ${urgency.toFixed(2)}.`;
}

function cashImpactScore(amount: Money): number {
  const absoluteMinor = amount.amountMinor < 0n ? -amount.amountMinor : amount.amountMinor;
  const cappedMinor = absoluteMinor > 1_000_000_000_000n ? 1_000_000_000_000n : absoluteMinor;
  return Number(cappedMinor) / 100;
}

function collectActionEvidence(invoice: Invoice, promises: PromiseToPay[], stats: CustomerPaymentStats | undefined): EvidenceRef[] {
  return [
    ...(invoice.evidenceRefs?.length ? invoice.evidenceRefs : [{ kind: "invoice" as const, id: invoice.id }]),
    ...promises.flatMap((promise) => (promise.evidenceRefs.length ? promise.evidenceRefs : [{ kind: "promise_to_pay" as const, id: promise.id }])),
    ...(stats?.evidenceRefs?.length ? stats.evidenceRefs : stats ? [{ kind: "customer_stat" as const, id: stats.customerId }] : [])
  ];
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
