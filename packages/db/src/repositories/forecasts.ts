import { and, desc, eq } from "drizzle-orm";

import {
  type CashForecast,
  type ConfidenceBand,
  type EvidenceRef,
  type ForecastCashFlow,
  type ForecastHorizonDays,
  type ForecastScenario,
  type Money,
  money,
  type ObligationRisk,
  type RiskStatus,
} from "@runwayops/domain";

import { cashForecasts, forecastScenarios } from "../schema/forecasts.js";
import {
  deserializeEvidenceRefs,
  serializeEvidenceRefs,
  type JsonObject,
  type JsonValue,
} from "../schema/common.js";
import type { DbHandle } from "./tenant.js";

export type CashForecastRow = typeof cashForecasts.$inferSelect;
export type ForecastScenarioRow = typeof forecastScenarios.$inferSelect;

// ---------------------------------------------------------------------------
// JSON-safe serialization for the dense forecast payload
//
// `cashForecasts.forecastJson` stores arrays whose elements carry domain
// types that are NOT JSON-safe by default:
//
//   * Money.amountMinor is bigint — JSON.stringify throws TypeError on bigint
//   * Date values turn into ISO strings on JSON.stringify but the typed
//     domain reader expects them back as Date instances
//   * EvidenceRef.sourceTimestamp is Date in domain but stored as ISO string
//     in jsonb (the same convention used by the audit/promise repos)
//
// Every read+write path that touches `forecast_json` must go through these
// helpers. Adding new dense fields means extending both directions.
// ---------------------------------------------------------------------------

type WireMoney = { amountMinor: string; currency: string };

type WireEvidenceRef = {
  kind: EvidenceRef["kind"];
  id: string;
  summary?: string;
  sourceProvider?: string;
  sourceTimestamp?: string;
};

type WireForecastCashFlow = Omit<
  ForecastCashFlow,
  "amount" | "expectedDate" | "evidenceRefs"
> & {
  amount: WireMoney;
  expectedDate: string;
  evidenceRefs: WireEvidenceRef[];
};

type WireConfidenceBand = Omit<ConfidenceBand, "lowerBound" | "upperBound"> & {
  lowerBound: WireMoney;
  upperBound: WireMoney;
};

type WireForecastScenario = Omit<
  ForecastScenario,
  "cashBalance" | "shortfallAmount" | "evidenceRefs"
> & {
  cashBalance: WireMoney;
  shortfallAmount?: WireMoney;
  evidenceRefs: WireEvidenceRef[];
};

type WireObligationRisk = Omit<
  ObligationRisk,
  "dueDate" | "amount" | "coverageAmount" | "shortfallAmount" | "evidenceRefs"
> & {
  dueDate: string;
  amount: WireMoney;
  coverageAmount?: WireMoney;
  shortfallAmount?: WireMoney;
  evidenceRefs: WireEvidenceRef[];
};

type WireForecastDense = {
  expectedInflows: WireForecastCashFlow[];
  confidenceWeightedInflows: WireForecastCashFlow[];
  expectedOutflows: WireForecastCashFlow[];
  scenarios: WireForecastScenario[];
  confidenceBands: WireConfidenceBand[];
  obligationRisks: WireObligationRisk[];
};

function moneyToWire(value: Money): WireMoney {
  return { amountMinor: value.amountMinor.toString(), currency: value.currency };
}

function moneyFromWire(value: WireMoney): Money {
  return money(value.amountMinor, value.currency);
}

function evidenceRefToWire(ref: EvidenceRef): WireEvidenceRef {
  const out: WireEvidenceRef = { kind: ref.kind, id: ref.id };
  if (ref.summary !== undefined) out.summary = ref.summary;
  if (ref.sourceProvider !== undefined) out.sourceProvider = ref.sourceProvider;
  if (ref.sourceTimestamp !== undefined)
    out.sourceTimestamp = ref.sourceTimestamp.toISOString();
  return out;
}

function evidenceRefFromWire(wire: WireEvidenceRef): EvidenceRef {
  const out: EvidenceRef = { kind: wire.kind, id: wire.id };
  if (wire.summary !== undefined) out.summary = wire.summary;
  if (wire.sourceProvider !== undefined) out.sourceProvider = wire.sourceProvider;
  if (wire.sourceTimestamp !== undefined) out.sourceTimestamp = new Date(wire.sourceTimestamp);
  return out;
}

function flowToWire(flow: ForecastCashFlow): WireForecastCashFlow {
  const wire: WireForecastCashFlow = {
    id: flow.id,
    direction: flow.direction,
    kind: flow.kind,
    expectedDate: flow.expectedDate.toISOString(),
    amount: moneyToWire(flow.amount),
    probability: flow.probability,
    confidence: flow.confidence,
    evidenceRefs: flow.evidenceRefs.map(evidenceRefToWire),
  };
  if (flow.sourceId !== undefined) wire.sourceId = flow.sourceId;
  if (flow.customerId !== undefined) wire.customerId = flow.customerId;
  if (flow.invoiceId !== undefined) wire.invoiceId = flow.invoiceId;
  if (flow.promiseId !== undefined) wire.promiseId = flow.promiseId;
  if (flow.obligationId !== undefined) wire.obligationId = flow.obligationId;
  if (flow.label !== undefined) wire.label = flow.label;
  return wire;
}

function flowFromWire(wire: WireForecastCashFlow): ForecastCashFlow {
  const flow: ForecastCashFlow = {
    id: wire.id,
    direction: wire.direction,
    kind: wire.kind,
    expectedDate: new Date(wire.expectedDate),
    amount: moneyFromWire(wire.amount),
    probability: wire.probability,
    confidence: wire.confidence,
    evidenceRefs: wire.evidenceRefs.map(evidenceRefFromWire),
  };
  if (wire.sourceId !== undefined) flow.sourceId = wire.sourceId;
  if (wire.customerId !== undefined) flow.customerId = wire.customerId;
  if (wire.invoiceId !== undefined) flow.invoiceId = wire.invoiceId;
  if (wire.promiseId !== undefined) flow.promiseId = wire.promiseId;
  if (wire.obligationId !== undefined) flow.obligationId = wire.obligationId;
  if (wire.label !== undefined) flow.label = wire.label;
  return flow;
}

function bandToWire(band: ConfidenceBand): WireConfidenceBand {
  return {
    id: band.id,
    label: band.label,
    confidenceLevel: band.confidenceLevel,
    lowerBound: moneyToWire(band.lowerBound),
    upperBound: moneyToWire(band.upperBound),
  };
}

function bandFromWire(wire: WireConfidenceBand): ConfidenceBand {
  return {
    id: wire.id,
    label: wire.label,
    confidenceLevel: wire.confidenceLevel,
    lowerBound: moneyFromWire(wire.lowerBound),
    upperBound: moneyFromWire(wire.upperBound),
  };
}

function scenarioToWire(scenario: ForecastScenario): WireForecastScenario {
  const wire: WireForecastScenario = {
    id: scenario.id,
    name: scenario.name,
    riskStatus: scenario.riskStatus,
    cashBalance: moneyToWire(scenario.cashBalance),
    evidenceRefs: scenario.evidenceRefs.map(evidenceRefToWire),
  };
  if (scenario.shortfallAmount !== undefined)
    wire.shortfallAmount = moneyToWire(scenario.shortfallAmount);
  return wire;
}

function scenarioFromWire(wire: WireForecastScenario): ForecastScenario {
  const scenario: ForecastScenario = {
    id: wire.id,
    name: wire.name,
    riskStatus: wire.riskStatus,
    cashBalance: moneyFromWire(wire.cashBalance),
    evidenceRefs: wire.evidenceRefs.map(evidenceRefFromWire),
  };
  if (wire.shortfallAmount !== undefined)
    scenario.shortfallAmount = moneyFromWire(wire.shortfallAmount);
  return scenario;
}

function obligationRiskToWire(risk: ObligationRisk): WireObligationRisk {
  const wire: WireObligationRisk = {
    obligationId: risk.obligationId,
    dueDate: risk.dueDate.toISOString(),
    amount: moneyToWire(risk.amount),
    riskStatus: risk.riskStatus,
    reason: risk.reason,
    evidenceRefs: risk.evidenceRefs.map(evidenceRefToWire),
  };
  if (risk.coverageAmount !== undefined)
    wire.coverageAmount = moneyToWire(risk.coverageAmount);
  if (risk.shortfallAmount !== undefined)
    wire.shortfallAmount = moneyToWire(risk.shortfallAmount);
  return wire;
}

function obligationRiskFromWire(wire: WireObligationRisk): ObligationRisk {
  const risk: ObligationRisk = {
    obligationId: wire.obligationId,
    dueDate: new Date(wire.dueDate),
    amount: moneyFromWire(wire.amount),
    riskStatus: wire.riskStatus,
    reason: wire.reason,
    evidenceRefs: wire.evidenceRefs.map(evidenceRefFromWire),
  };
  if (wire.coverageAmount !== undefined)
    risk.coverageAmount = moneyFromWire(wire.coverageAmount);
  if (wire.shortfallAmount !== undefined)
    risk.shortfallAmount = moneyFromWire(wire.shortfallAmount);
  return risk;
}

export function serializeForecastDense(input: {
  expectedInflows: ForecastCashFlow[];
  confidenceWeightedInflows: ForecastCashFlow[];
  expectedOutflows: ForecastCashFlow[];
  scenarios: ForecastScenario[];
  confidenceBands: ConfidenceBand[];
  obligationRisks: ObligationRisk[];
}): JsonObject {
  const wire: WireForecastDense = {
    expectedInflows: input.expectedInflows.map(flowToWire),
    confidenceWeightedInflows: input.confidenceWeightedInflows.map(flowToWire),
    expectedOutflows: input.expectedOutflows.map(flowToWire),
    scenarios: input.scenarios.map(scenarioToWire),
    confidenceBands: input.confidenceBands.map(bandToWire),
    obligationRisks: input.obligationRisks.map(obligationRiskToWire),
  };
  return wire as unknown as JsonObject;
}

export function deserializeForecastDense(json: JsonValue): {
  expectedInflows: ForecastCashFlow[];
  confidenceWeightedInflows: ForecastCashFlow[];
  expectedOutflows: ForecastCashFlow[];
  scenarios: ForecastScenario[];
  confidenceBands: ConfidenceBand[];
  obligationRisks: ObligationRisk[];
} {
  const wire = (json ?? {}) as Partial<WireForecastDense>;
  return {
    expectedInflows: (wire.expectedInflows ?? []).map(flowFromWire),
    confidenceWeightedInflows: (wire.confidenceWeightedInflows ?? []).map(flowFromWire),
    expectedOutflows: (wire.expectedOutflows ?? []).map(flowFromWire),
    scenarios: (wire.scenarios ?? []).map(scenarioFromWire),
    confidenceBands: (wire.confidenceBands ?? []).map(bandFromWire),
    obligationRisks: (wire.obligationRisks ?? []).map(obligationRiskFromWire),
  };
}

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
 * from the JSON via the wire serializers above. Mismatched JSON shape
 * yields empty arrays for those fields; consumers should treat that as an
 * integrity error and refuse to render.
 */
export function rowToCashForecast(row: CashForecastRow): CashForecast {
  const dense = deserializeForecastDense((row.forecastJson ?? {}) as JsonValue);
  const cashBalance = toMoney(row.cashBalanceMinor, row.currency ?? "GBP");

  return {
    forecastId: row.id,
    companyId: row.companyId,
    generatedAt: row.generatedAt,
    asOfDate: new Date(row.asOfDate),
    horizonDays: row.horizonDays as ForecastHorizonDays,
    triggerEventIds: (row.triggerEventIds ?? []) as string[],
    cashBalance,
    expectedInflows: dense.expectedInflows,
    confidenceWeightedInflows: dense.confidenceWeightedInflows,
    expectedOutflows: dense.expectedOutflows,
    riskStatus: row.riskStatus as RiskStatus,
    scenarios: dense.scenarios,
    confidenceBands: dense.confidenceBands,
    shortfallAmount:
      row.shortfallAmountMinor !== null && row.shortfallAmountMinor !== undefined
        ? money(row.shortfallAmountMinor.toString(), row.currency ?? "GBP")
        : undefined,
    obligationRisks: dense.obligationRisks,
    evidenceRefs: deserializeEvidenceRefs(row.evidenceRefs ?? []) as CashForecast["evidenceRefs"],
  };
}

export type InsertForecastInput = CashForecast;

/**
 * Persist a freshly computed forecast. The full forecast struct is stored as
 * JSON via the wire serializers; indexed columns are denormalized for
 * hot-path queries. Callers MUST NOT pass a pre-built JSON payload — pass
 * the typed CashForecast and let this function project it via
 * `serializeForecastDense` so bigint Money values are preserved as strings
 * (JSON.stringify throws on raw bigint).
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
    forecastJson: serializeForecastDense({
      expectedInflows: input.expectedInflows,
      confidenceWeightedInflows: input.confidenceWeightedInflows,
      expectedOutflows: input.expectedOutflows,
      scenarios: input.scenarios,
      confidenceBands: input.confidenceBands,
      obligationRisks: input.obligationRisks,
    }),
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
