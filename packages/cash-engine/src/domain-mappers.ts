import type {
  CollectionAction as DomainCollectionAction,
  CollectionActionChannel as DomainCollectionActionChannel,
  CollectionActionKind as DomainCollectionActionKind,
  CollectionActionTone as DomainCollectionActionTone,
  EvidenceRef,
  ForecastCashFlow as DomainForecastCashFlow,
  ForecastCashFlowKind as DomainForecastCashFlowKind,
  RankingSnapshot,
} from "@runwayops/domain";

import type {
  CollectionActionKind as EngineCollectionActionKind,
  ForecastCashFlow as EngineForecastCashFlow,
  ForecastCashFlowKind as EngineForecastCashFlowKind,
  RankedCollectionActionCandidate,
} from "./types.ts";

/**
 * Cash-engine emits native runtime cash flows (no zod validation, simple
 * object shape) so the deterministic forecasters and rankers stay fast and
 * easy to test. Crossing into the API/persistence/UI boundary requires the
 * domain canonical shape (`@runwayops/domain` ForecastCashFlow). These
 * mappers project at that boundary.
 *
 * The mapper is the only place engine-internal kind names (`promise`,
 * `critical_obligation`) are translated to domain canonical names
 * (`promise_to_pay`, `obligation`). New engine kinds must add a row here
 * before they can be exposed externally.
 *
 * The mapper for `RankedCollectionAction` → domain `CollectionAction` lives
 * in the domain-mappers module that consumes the post-Phase-F CollectionAction
 * shape (with separate actionKind + channel fields). See packages/domain
 * actions.ts for the canonical type and packages/db repositories/actions.ts
 * for persistence.
 */

const ENGINE_KIND_TO_DOMAIN: Record<EngineForecastCashFlowKind, DomainForecastCashFlowKind> = {
  invoice: "invoice",
  promise: "promise_to_pay",
  payment: "payment",
  bank_transaction: "bank_transaction",
  supplier_bill: "supplier_bill",
  critical_obligation: "obligation",
};

function inferDirection(kind: EngineForecastCashFlowKind): "inflow" | "outflow" {
  switch (kind) {
    case "invoice":
    case "promise":
    case "payment":
    case "bank_transaction":
      return "inflow";
    case "supplier_bill":
    case "critical_obligation":
      return "outflow";
  }
}

export function toDomainForecastCashFlow(
  flow: EngineForecastCashFlow,
): DomainForecastCashFlow {
  const expectedDate = flow.date instanceof Date ? flow.date : new Date(flow.date);
  return {
    id: flow.id,
    direction: inferDirection(flow.kind),
    kind: ENGINE_KIND_TO_DOMAIN[flow.kind],
    sourceId: flow.sourceId,
    expectedDate,
    amount: flow.amount,
    probability: flow.confidence,
    confidence: flow.confidence,
    customerId: flow.customerId,
    invoiceId: flow.invoiceId,
    promiseId: flow.promiseId,
    obligationId: flow.obligationId,
    label: flow.label,
    evidenceRefs: flow.evidenceRefs,
  };
}

export function toDomainForecastCashFlows(
  flows: readonly EngineForecastCashFlow[],
): DomainForecastCashFlow[] {
  return flows.map(toDomainForecastCashFlow);
}

/**
 * Engine-intent → domain-intent mapping. The engine's vocabulary is its
 * ranking taxonomy; domain's vocabulary is the persistence + UI taxonomy.
 * Every engine kind must have a defined domain target so a candidate can
 * always be persisted.
 */
const ENGINE_ACTION_KIND_TO_DOMAIN: Record<
  EngineCollectionActionKind,
  DomainCollectionActionKind
> = {
  send_payment_reminder: "request_payment",
  request_partial_payment: "request_partial_payment",
  confirm_promise: "confirm_promise",
  resolve_dispute: "resolve_dispute",
  manual_review_paid_claim: "manual_review_paid_claim",
  phone_follow_up: "request_payment",
};

const ENGINE_CHANNEL_TO_DOMAIN: Record<
  RankedCollectionActionCandidate["recommendedChannel"],
  DomainCollectionActionChannel
> = {
  email: "email",
  sms: "sms",
  phone: "phone_task",
  letter: "letter",
  portal: "portal",
};

const ENGINE_TONE_TO_DOMAIN: Record<
  RankedCollectionActionCandidate["recommendedTone"],
  DomainCollectionActionTone
> = {
  friendly: "friendly",
  neutral: "formal",
  firm: "firm",
};

/**
 * Project a `RankedCollectionActionCandidate` (ephemeral ranker output) into
 * a draft of a domain `CollectionAction` ready for persistence. The caller
 * supplies the missing fields that only exist at selection time:
 *   - persistence id (UUID minted at insert)
 *   - status (always "proposed" at first persistence)
 *   - lifecycle timestamps (createdAt/updatedAt minted at insert)
 *   - approval/draft refs (set later in the lifecycle)
 *
 * The engine's ranking inputs are denormalized into `rankingSnapshot` so the
 * audit drawer can show *why* this candidate was selected without coupling
 * the persisted shape to engine internals.
 */
export type DomainCollectionActionDraft = Omit<
  DomainCollectionAction,
  | "id"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "approvedAt"
  | "rejectedAt"
  | "executedAt"
  | "completedAt"
  | "approvalId"
  | "draftMessageId"
  | "assignedToUserId"
>;

export function toDomainCollectionActionDraft(input: {
  ranked: RankedCollectionActionCandidate;
  recommendedAt: Date;
  evidenceRefs: EvidenceRef[];
  reason: string;
  dueAt?: Date;
}): DomainCollectionActionDraft {
  const { ranked, recommendedAt, evidenceRefs, reason, dueAt } = input;

  const rankingSnapshot: RankingSnapshot = {
    kind: ranked.kind,
    priorityScore: ranked.priorityScore,
    expectedCashImpactMinor: ranked.expectedCashImpact.amountMinor.toString(),
    probabilityOfPayment: ranked.probabilityOfPayment,
    obligationUrgency: ranked.obligationUrgency,
    actionEffectiveness: ranked.actionEffectiveness,
    evidenceConfidence: ranked.evidenceConfidence,
    relationshipRiskPenalty: ranked.relationshipRiskPenalty,
    actionEffortPenalty: ranked.actionEffortPenalty,
    explanation: ranked.explanation,
    recordedAt: recommendedAt.toISOString(),
  };

  return {
    companyId: ranked.companyId,
    customerId: ranked.customerId,
    invoiceId: ranked.invoiceId,
    actionKind: ENGINE_ACTION_KIND_TO_DOMAIN[ranked.kind],
    channel: ENGINE_CHANNEL_TO_DOMAIN[ranked.recommendedChannel],
    tone: ENGINE_TONE_TO_DOMAIN[ranked.recommendedTone],
    priorityScore: ranked.priorityScore,
    expectedCashImpact: ranked.expectedCashImpact,
    probabilityOfPayment: ranked.probabilityOfPayment,
    evidenceConfidence: ranked.evidenceConfidence,
    relationshipRiskPenalty: ranked.relationshipRiskPenalty,
    actionEffortPenalty: ranked.actionEffortPenalty,
    requiresApproval: true,
    recommendedAt,
    dueAt: dueAt ?? null,
    reason,
    evidenceRefs,
    rankingSnapshot,
  };
}
