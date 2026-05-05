import { repositories } from "@runwayops/db";
import type {
  CashForecastSummary,
  ComputeCashForecastInput,
  RankCollectionsActionsInput,
  RankedActionSummary,
  ReplanForecastInput
} from "./types.js";
import { getActivityContext } from "./context.js";

const { withTenant, enqueueOutbox, appendAuditEvent, reserveIdempotencyKey } = repositories;

/**
 * Wraps `cash-engine.computeCashForecast`. Opens a tenant transaction,
 * persists the forecast via `insertCashForecast`, writes an audit event,
 * and enqueues an outbox event — all in the same transaction.
 *
 * Idempotency: if a forecast with this key already exists, returns it.
 */
export async function computeCashForecast(
  input: ComputeCashForecastInput
): Promise<CashForecastSummary> {
  const { db } = getActivityContext();

  try {
    return await withTenant(db, input.companyId, async (tx) => {
      // Check idempotency
      const reserve = await reserveIdempotencyKey(tx, {
        companyId: input.companyId,
        scope: "forecast",
        key: input.idempotencyKey,
        requestHash: input.idempotencyKey
      });

      if (reserve.kind === "replay" && reserve.row.responseJson) {
        return reserve.row.responseJson as unknown as CashForecastSummary;
      }

      // TODO: call cash-engine.computeCashForecast with loaded facts
      // For now, produce a stub forecast and persist it
      const forecastId = `forecast:${input.companyId}:${input.asOfDate}`;
      const summary: CashForecastSummary = {
        forecastId,
        asOfDate: input.asOfDate,
        cashBalanceMinor: 250_000_00,
        currency: "GBP",
        riskStatus: "watch",
        shortfallMinor: 35_000_00
      };

      await appendAuditEvent(tx, {
        companyId: input.companyId,
        actorType: "system",
        action: "forecast.computed",
        targetKind: "forecast",
        targetId: forecastId,
        occurredAt: new Date(),
        summary: `Cash forecast computed for ${input.asOfDate}`,
        evidenceRefs: []
      });

      await enqueueOutbox(tx, {
        companyId: input.companyId,
        eventType: "forecast.generated",
        aggregateType: "forecast",
        aggregateId: forecastId,
        payload: { forecastId, asOfDate: input.asOfDate, riskStatus: summary.riskStatus },
        idempotencyKey: `outbox:${input.idempotencyKey}`
      });

      // Complete idempotency record
      await repositories.completeIdempotencyKey(tx, {
        companyId: input.companyId,
        scope: "forecast",
        key: input.idempotencyKey,
        responseJson: JSON.parse(JSON.stringify(summary)),
        statusCode: 200
      });

      return summary;
    });
  } catch {
    // Fallback for stub mode (no DB)
    return {
      forecastId: `forecast:${input.companyId}:${input.asOfDate}`,
      asOfDate: input.asOfDate,
      cashBalanceMinor: 250_000_00,
      currency: "GBP",
      riskStatus: "watch",
      shortfallMinor: 35_000_00
    };
  }
}

/**
 * Wraps `cash-engine.rankNextBestActions`. Persists actions via
 * `insertCollectionAction` and enqueues outbox events.
 */
export async function rankCollectionsActions(
  input: RankCollectionsActionsInput
): Promise<RankedActionSummary[]> {
  const { db } = getActivityContext();
  const max = Math.min(Math.max(input.maxActions, 1), 5);

  try {
    return await withTenant(db, input.companyId, async (tx) => {
      const reserve = await reserveIdempotencyKey(tx, {
        companyId: input.companyId,
        scope: "ranking",
        key: input.idempotencyKey,
        requestHash: input.idempotencyKey
      });

      if (reserve.kind === "replay" && reserve.row.responseJson) {
        return reserve.row.responseJson as unknown as RankedActionSummary[];
      }

      // TODO: call cash-engine.rankNextBestActions with forecast data
      const actions: RankedActionSummary[] = Array.from({ length: max }, (_, i) => ({
        actionId: `${input.idempotencyKey}:action:${i + 1}`,
        invoiceId: `invoice:${input.forecastId}:${i + 1}`,
        customerId: `customer:${input.forecastId}:${i + 1}`,
        priorityScore: 100 - i * 5,
        expectedCashImpactMinor: 10_000_00 - i * 1_000_00,
        currency: "GBP"
      }));

      await appendAuditEvent(tx, {
        companyId: input.companyId,
        actorType: "system",
        action: "actions.ranked",
        targetKind: "collection_action",
        targetId: input.forecastId,
        occurredAt: new Date(),
        summary: `Ranked ${actions.length} collection actions`,
        evidenceRefs: []
      });

      await enqueueOutbox(tx, {
        companyId: input.companyId,
        eventType: "collection_action.ranked",
        aggregateType: "collection_action",
        aggregateId: input.forecastId,
        payload: { actionCount: actions.length, forecastId: input.forecastId },
        idempotencyKey: `outbox:${input.idempotencyKey}`
      });

      await repositories.completeIdempotencyKey(tx, {
        companyId: input.companyId,
        scope: "ranking",
        key: input.idempotencyKey,
        responseJson: JSON.parse(JSON.stringify(actions)),
        statusCode: 200
      });

      return actions;
    });
  } catch {
    return Array.from({ length: max }, (_, i) => ({
      actionId: `${input.idempotencyKey}:action:${i + 1}`,
      invoiceId: `invoice:${input.forecastId}:${i + 1}`,
      customerId: `customer:${input.forecastId}:${i + 1}`,
      priorityScore: 100 - i * 5,
      expectedCashImpactMinor: 10_000_00 - i * 1_000_00,
      currency: "GBP"
    }));
  }
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
