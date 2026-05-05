import { and, desc, eq } from "drizzle-orm";

import {
  type CashForecast,
  type ForecastHorizonDays,
  type Money,
  money,
  type RiskStatus,
} from "@runwayops/domain";

import { cashForecasts, forecastScenarios } from "../schema/forecasts.js";
import {
  deserializeEvidenceRefs,
  serializeEvidenceRefs,
  type JsonObject,
} from "../schema/common.js";
import type { DbHandle } from "./tenant.js";

export type CashForecastRow = typeof cashForecasts.$inferSelect;
export type ForecastScenarioRow = typeof forecastScenarios.$inferSelect;

function toMoney(amountMinor: bigint | null, currency: string | null): Money {
  if (amountMinor === null || amountMinor === undefined || !currency) {
    return money("0", "GBP");
  }
  return money(amountMinor.toString(), currency);
}

/**
 * The forecast row stores the dense engine output as JSON in `forecast_json`
 * because the engine type carries arrays of cash flows and confidence bands
 * that are queried as a unit. The structured columns (cash balance, risk
 * status, shortfall, horizon) are denormalized for indexing only.
 *
 * Mapping back to the domain `CashForecast` type rebuilds the dense fields
 * from the JSON. Mismatched JSON shape returns a minimal forecast scoped
 * to the indexed columns; consumers should treat this as an integrity error
 * and refuse to render it.
 */
export function rowToCashForecast(row: CashForecastRow): CashForecast {
  const json = (row.forecastJson ?? {}) as Partial<CashForecast> & JsonObject;
  const cashBalance = toMoney(row.cashBalanceMinor, row.currency ?? "GBP");

  return {
    forecastId: row.id,
    companyId: row.companyId,
    generatedAt: row.generatedAt,
    asOfDate: new Date(row.asOfDate),
    horizonDays: row.horizonDays as ForecastHorizonDays,
    triggerEventIds: (row.triggerEventIds ?? []) as string[],
    cashBalance,
    expectedInflows: (json.expectedInflows ?? []) as CashForecast["expectedInflows"],
    confidenceWeightedInflows: (json.confidenceWeightedInflows ??
      []) as CashForecast["confidenceWeightedInflows"],
    expectedOutflows: (json.expectedOutflows ?? []) as CashForecast["expectedOutflows"],
    riskStatus: row.riskStatus as RiskStatus,
    scenarios: (json.scenarios ?? []) as CashForecast["scenarios"],
    confidenceBands: (json.confidenceBands ?? []) as CashForecast["confidenceBands"],
    shortfallAmount:
      row.shortfallAmountMinor !== null && row.shortfallAmountMinor !== undefined
        ? money(row.shortfallAmountMinor.toString(), row.currency ?? "GBP")
        : undefined,
    obligationRisks: (json.obligationRisks ?? []) as CashForecast["obligationRisks"],
    evidenceRefs: deserializeEvidenceRefs(row.evidenceRefs ?? []) as CashForecast["evidenceRefs"],
  };
}

export type InsertForecastInput = CashForecast & {
  forecastJson?: JsonObject;
};

/**
 * Persist a freshly computed forecast. The full forecast struct is stored
 * as JSON; indexed columns are denormalized for hot-path queries.
 */
export async function insertCashForecast(
  handle: DbHandle,
  input: InsertForecastInput,
): Promise<CashForecast> {
  const values: typeof cashForecasts.$inferInsert = {
    id: input.forecastId,
    companyId: input.companyId,
    generatedAt: input.generatedAt,
    asOfDate: input.asOfDate.toISOString().slice(0, 10),
    horizonDays: input.horizonDays,
    triggerEventIds: input.triggerEventIds,
    cashBalanceMinor: input.cashBalance.amountMinor,
    currency: input.cashBalance.currency,
    riskStatus: input.riskStatus,
    shortfallAmountMinor: input.shortfallAmount?.amountMinor ?? null,
    forecastJson:
      input.forecastJson ??
      ({
        expectedInflows: input.expectedInflows,
        confidenceWeightedInflows: input.confidenceWeightedInflows,
        expectedOutflows: input.expectedOutflows,
        scenarios: input.scenarios,
        confidenceBands: input.confidenceBands,
        obligationRisks: input.obligationRisks,
      } as unknown as JsonObject),
    evidenceRefs: serializeEvidenceRefs(input.evidenceRefs),
  };

  const inserted = await handle.insert(cashForecasts).values(values).returning();

  if (inserted.length !== 1) throw new Error("insertCashForecast: insert returned no row");
  return rowToCashForecast(inserted[0]!);
}

export async function getLatestForecast(
  handle: DbHandle,
  input: { companyId: string; horizonDays?: ForecastHorizonDays },
): Promise<CashForecast | null> {
  const conditions = [eq(cashForecasts.companyId, input.companyId)];
  if (input.horizonDays !== undefined) {
    conditions.push(eq(cashForecasts.horizonDays, input.horizonDays));
  }

  const rows = await handle
    .select()
    .from(cashForecasts)
    .where(and(...conditions))
    .orderBy(desc(cashForecasts.generatedAt))
    .limit(1);

  return rows.length === 1 ? rowToCashForecast(rows[0]!) : null;
}

export async function listForecastsForCompany(
  handle: DbHandle,
  input: { companyId: string; limit?: number },
): Promise<CashForecast[]> {
  const rows = await handle
    .select()
    .from(cashForecasts)
    .where(eq(cashForecasts.companyId, input.companyId))
    .orderBy(desc(cashForecasts.generatedAt))
    .limit(input.limit ?? 50);

  return rows.map(rowToCashForecast);
}
