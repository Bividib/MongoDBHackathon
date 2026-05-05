import type {
  CashForecastSummary,
  ComputeCashForecastInput,
  RankCollectionsActionsInput,
  RankedActionSummary,
  ReplanForecastInput
} from "./types.js";

/**
 * Wraps `cash-engine.computeCashForecast`. Activity body is a stub returning
 * a canned forecast summary; the real wiring will instantiate the
 * `ComputeCashForecastInput` from loaded financial facts and call into
 * `@runwayops/cash-engine`.
 */
export async function computeCashForecast(
  input: ComputeCashForecastInput
): Promise<CashForecastSummary> {
  return {
    forecastId: `forecast:${input.companyId}:${input.asOfDate}`,
    asOfDate: input.asOfDate,
    cashBalanceMinor: 250_000_00,
    currency: "GBP",
    riskStatus: "watch",
    shortfallMinor: 35_000_00
  };
}

/**
 * Wraps `cash-engine.rankNextBestActions`. Stub returns three canned actions.
 */
export async function rankCollectionsActions(
  input: RankCollectionsActionsInput
): Promise<RankedActionSummary[]> {
  const max = Math.min(Math.max(input.maxActions, 1), 5);
  return Array.from({ length: max }, (_, i) => ({
    actionId: `${input.idempotencyKey}:action:${i + 1}`,
    invoiceId: `invoice:${input.forecastId}:${i + 1}`,
    customerId: `customer:${input.forecastId}:${i + 1}`,
    priorityScore: 100 - i * 5,
    expectedCashImpactMinor: 10_000_00 - i * 1_000_00,
    currency: "GBP"
  }));
}

/**
 * Recompute forecast in response to a customer reply or bank event.
 * The case workflow re-uses this with a new `idempotencyKey` per round.
 */
export async function recomputeCashForecast(
  input: ComputeCashForecastInput
): Promise<CashForecastSummary> {
  return computeCashForecast(input);
}

/**
 * Re-rank collection actions after the forecast changes.
 */
export async function rerankCollectionActions(
  input: RankCollectionsActionsInput
): Promise<RankedActionSummary[]> {
  return rankCollectionsActions(input);
}

/**
 * Re-plan during a critical-obligation case. Same shape as the daily
 * forecast; separated for naming clarity in case workflows.
 */
export async function replanForecast(input: ReplanForecastInput): Promise<CashForecastSummary> {
  return {
    forecastId: `forecast:${input.companyId}:${input.caseId}:${input.asOfDate}`,
    asOfDate: input.asOfDate,
    cashBalanceMinor: 250_000_00,
    currency: "GBP",
    riskStatus: "high",
    shortfallMinor: 22_500_00
  };
}
