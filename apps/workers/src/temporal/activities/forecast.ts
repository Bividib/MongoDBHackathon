import { randomUUID } from "node:crypto";

import {
  computeCashForecast as engineComputeCashForecast,
  rankNextBestActions as engineRankNextBestActions,
  toDomainCollectionActionDraft
} from "@runwayops/cash-engine";
import type {
  CashForecast as EngineCashForecast,
  ObligationRisk as EngineObligationRisk
} from "@runwayops/cash-engine";
import { repositories } from "@runwayops/db";
import type { Money, RiskStatus } from "@runwayops/domain";

import { getActivityContext } from "./context.js";
import { toDomainCashForecast } from "./engine-projection.js";
import type {
  CashForecastSummary,
  ComputeCashForecastInput,
  RankCollectionsActionsInput,
  RankedActionSummary,
  ReplanForecastInput
} from "./types.js";

type FactBundle = Awaited<ReturnType<typeof repositories.loadFinancialFactsForForecast>>;

const {
  withTenant,
  appendAuditEvent,
  enqueueOutbox,
  insertCashForecast,
  insertCollectionAction,
  loadFinancialFactsForForecast: loadFactsRepo,
  reserveIdempotencyKey,
  completeIdempotencyKey,
  getLatestForecast
} = repositories;

const DEFAULT_CURRENCY = "GBP" as const;

type JsonObject = { [key: string]: JsonValue };
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function toJsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function summariseForecast(input: {
  forecastId: string;
  asOfDate: string;
  cashBalanceMinor: bigint;
  currency: string;
  riskStatus: CashForecastSummary["riskStatus"];
  shortfallMinor?: bigint | undefined;
}): CashForecastSummary {
  const summary: CashForecastSummary = {
    forecastId: input.forecastId,
    asOfDate: input.asOfDate,
    cashBalanceMinor: Number(input.cashBalanceMinor),
    currency: input.currency,
    riskStatus: input.riskStatus
  };
  if (input.shortfallMinor !== undefined) {
    summary.shortfallMinor = Number(input.shortfallMinor);
  }
  return summary;
}

/**
 * Wraps `cash-engine.computeCashForecast`. Inside one tenant transaction:
 *   1. Reserve the activity-level idempotency key (replay returns the
 *      cached summary — workflows expect identical re-run results).
 *   2. Load the engine fact bundle via `loadFinancialFactsForForecast`.
 *   3. Run the deterministic engine forecaster.
 *   4. Project the engine output into the domain canonical shape, mint a
 *      UUID for persistence, and persist via `insertCashForecast`. The
 *      domain serializer round-trips bigint Money — never JSON.stringify
 *      the engine output directly.
 *   5. Audit + enqueue an outbox event for downstream consumers.
 *   6. Complete the idempotency record with the narrow workflow-facing
 *      summary.
 */
export async function computeCashForecast(
  input: ComputeCashForecastInput
): Promise<CashForecastSummary> {
  const { db } = getActivityContext();

  return withTenant(db, input.companyId, async (tx) => {
    const reserve = await reserveIdempotencyKey(tx, {
      companyId: input.companyId,
      scope: "forecast",
      key: input.idempotencyKey,
      requestHash: input.idempotencyKey
    });

    if (reserve.kind === "replay" && reserve.row.responseJson) {
      return reserve.row.responseJson as unknown as CashForecastSummary;
    }

    const facts = await loadFactsRepo(tx, {
      companyId: input.companyId,
      asOfDate: new Date(input.asOfDate),
      horizonDays: input.horizonDays,
      currency: DEFAULT_CURRENCY
    });

    const forecastId = randomUUID();
    const generatedAt = new Date();
    const engineForecast = engineComputeCashForecast({
      forecastId,
      companyId: input.companyId,
      generatedAt,
      asOfDate: input.asOfDate,
      horizonDays: input.horizonDays,
      triggerEventIds: input.triggerEventIds,
      cashBalance: facts.cashBalance,
      invoices: facts.invoices,
      payments: facts.payments,
      promises: facts.promises,
      criticalObligations: facts.criticalObligations,
      bankTransactions: facts.bankTransactions,
      ...(facts.policy ? { policy: facts.policy } : {})
    });

    const persisted = await insertCashForecast(
      tx,
      toDomainCashForecast({ engineForecast, forecastId })
    );

    const summary = summariseForecast({
      forecastId: persisted.forecastId,
      asOfDate: input.asOfDate,
      cashBalanceMinor: persisted.cashBalance.amountMinor,
      currency: persisted.cashBalance.currency,
      riskStatus: persisted.riskStatus,
      shortfallMinor: persisted.shortfallAmount?.amountMinor
    });

    await appendAuditEvent(tx, {
      companyId: input.companyId,
      actorType: "system",
      action: "forecast.computed",
      targetKind: "forecast",
      targetId: forecastId,
      occurredAt: generatedAt,
      summary: `Cash forecast ${summary.riskStatus} computed for ${input.asOfDate}`,
      evidenceRefs: persisted.evidenceRefs
    });

    await enqueueOutbox(tx, {
      companyId: input.companyId,
      eventType: "forecast.generated",
      aggregateType: "forecast",
      aggregateId: forecastId,
      payload: {
        forecastId,
        asOfDate: input.asOfDate,
        riskStatus: summary.riskStatus,
        shortfallMinor: summary.shortfallMinor ?? null
      },
      idempotencyKey: `outbox:${input.idempotencyKey}`
    });

    await completeIdempotencyKey(tx, {
      companyId: input.companyId,
      scope: "forecast",
      key: input.idempotencyKey,
      responseJson: toJsonObject(summary),
      statusCode: 200
    });

    return summary;
  });
}

/**
 * Wraps `cash-engine.rankNextBestActions`. Loads the persisted forecast
 * by id (so the engine can reason about shortfall + obligation urgency),
 * recomputes the engine fact bundle, runs the deterministic ranker, and
 * persists each candidate via `insertCollectionAction` after projecting
 * through the domain mapper. Returns the narrow workflow-facing summary.
 */
export async function rankCollectionsActions(
  input: RankCollectionsActionsInput
): Promise<RankedActionSummary[]> {
  const { db } = getActivityContext();
  const maxActions = Math.min(Math.max(input.maxActions, 1), 5);

  return withTenant(db, input.companyId, async (tx) => {
    const reserve = await reserveIdempotencyKey(tx, {
      companyId: input.companyId,
      scope: "ranking",
      key: input.idempotencyKey,
      requestHash: input.idempotencyKey
    });

    if (reserve.kind === "replay" && reserve.row.responseJson) {
      return reserve.row.responseJson as unknown as RankedActionSummary[];
    }

    const facts = await loadFactsRepo(tx, {
      companyId: input.companyId,
      asOfDate: new Date(input.asOfDate),
      horizonDays: 30,
      currency: DEFAULT_CURRENCY
    });

    const latestForecast = await getLatestForecast(tx, { companyId: input.companyId });
    const engineForecast = synthesiseEngineForecastForRanking({
      facts,
      latestForecastRiskStatus: latestForecast?.riskStatus,
      shortfallAmount: latestForecast?.shortfallAmount
    });

    const ranked = engineRankNextBestActions({
      companyId: input.companyId,
      asOfDate: input.asOfDate,
      invoices: facts.invoices,
      promises: facts.promises,
      forecast: engineForecast,
      ...(latestForecast?.shortfallAmount
        ? { nearTermShortfall: latestForecast.shortfallAmount }
        : {}),
      ...(facts.policy ? { policy: facts.policy } : {}),
      maxActions
    });

    const recommendedAt = new Date();
    const persistedActions: RankedActionSummary[] = [];

    for (const candidate of ranked) {
      const draft = toDomainCollectionActionDraft({
        ranked: candidate,
        recommendedAt,
        evidenceRefs: candidate.evidenceRefs,
        reason: candidate.explanation
      });

      const persisted = await insertCollectionAction(tx, {
        ...draft,
        status: "proposed"
      });

      persistedActions.push({
        actionId: persisted.id,
        invoiceId: candidate.invoiceId,
        customerId: candidate.customerId,
        priorityScore: candidate.priorityScore,
        expectedCashImpactMinor: Number(candidate.expectedCashImpact.amountMinor),
        currency: candidate.expectedCashImpact.currency
      });
    }

    await appendAuditEvent(tx, {
      companyId: input.companyId,
      actorType: "system",
      action: "actions.ranked",
      targetKind: "collection_action",
      targetId: input.forecastId,
      occurredAt: recommendedAt,
      summary: `Ranked ${persistedActions.length} collection actions`,
      evidenceRefs: ranked.flatMap((r) => r.evidenceRefs)
    });

    await enqueueOutbox(tx, {
      companyId: input.companyId,
      eventType: "collection_action.ranked",
      aggregateType: "collection_action",
      aggregateId: input.forecastId,
      payload: {
        forecastId: input.forecastId,
        actionCount: persistedActions.length
      },
      idempotencyKey: `outbox:${input.idempotencyKey}`
    });

    await completeIdempotencyKey(tx, {
      companyId: input.companyId,
      scope: "ranking",
      key: input.idempotencyKey,
      responseJson: toJsonObject({ actions: persistedActions }),
      statusCode: 200
    });

    return persistedActions;
  });
}

export async function recomputeCashForecast(
  input: ComputeCashForecastInput
): Promise<CashForecastSummary> {
  return computeCashForecast(input);
}

export async function rerankCollectionActions(
  input: RankCollectionsActionsInput
): Promise<RankedActionSummary[]> {
  return rankCollectionsActions(input);
}

export async function replanForecast(input: ReplanForecastInput): Promise<CashForecastSummary> {
  return computeCashForecast({
    companyId: input.companyId,
    idempotencyKey: input.idempotencyKey,
    asOfDate: input.asOfDate,
    horizonDays: 30,
    triggerEventIds: input.triggerEventIds
  });
}

/**
 * Build the minimal engine `CashForecast` shape the ranker reads. The
 * ranker only consults `riskStatus`, `shortfallAmount`, and the first
 * `obligationRisks[].dueDate` for urgency — not the dense flow arrays.
 * Synthesizing this from the latest persisted forecast plus today's
 * facts avoids a second engine compute on the ranking path.
 */
function synthesiseEngineForecastForRanking(input: {
  facts: FactBundle;
  latestForecastRiskStatus: RiskStatus | undefined;
  shortfallAmount: Money | undefined;
}): EngineCashForecast {
  const riskStatus = input.latestForecastRiskStatus ?? "safe";
  const firstObligation = input.facts.criticalObligations[0];
  const obligationRisks: EngineObligationRisk[] = firstObligation
    ? [
        {
          obligationId: firstObligation.id,
          dueDate: firstObligation.dueDate,
          amount: firstObligation.amount,
          riskStatus,
          coverageStatus: "covered_by_actual",
          dependentInflowIds: [],
          evidenceRefs: firstObligation.evidenceRefs ?? [
            { kind: "obligation", id: firstObligation.id }
          ]
        }
      ]
    : [];

  const synthetic: EngineCashForecast = {
    forecastId: "ranking-synth",
    companyId: input.facts.invoices[0]?.companyId ?? "",
    generatedAt: new Date(),
    asOfDate: new Date(),
    horizonDays: 30,
    triggerEventIds: [],
    cashBalance: input.facts.cashBalance,
    expectedInflows: [],
    confidenceWeightedInflows: [],
    expectedOutflows: [],
    riskStatus,
    scenarios: [],
    confidenceBands: [],
    obligationRisks,
    evidenceRefs: []
  };
  if (input.shortfallAmount !== undefined) {
    synthetic.shortfallAmount = input.shortfallAmount;
  }
  return synthetic;
}
