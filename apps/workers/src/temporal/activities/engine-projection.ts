import { toDomainForecastCashFlows } from "@runwayops/cash-engine";
import type {
  CashForecast as EngineCashForecast,
  ConfidenceBand as EngineConfidenceBand,
  ForecastScenario as EngineForecastScenario,
  ObligationRisk as EngineObligationRisk
} from "@runwayops/cash-engine";
import type {
  CashForecast as DomainCashForecast,
  ConfidenceBand as DomainConfidenceBand,
  EvidenceRef,
  ForecastScenario as DomainForecastScenario,
  ObligationRisk as DomainObligationRisk
} from "@runwayops/domain";

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function projectScenario(scenario: EngineForecastScenario, evidence: EvidenceRef): DomainForecastScenario {
  const out: DomainForecastScenario = {
    id: `scenario:${scenario.name}`,
    name: scenario.name,
    riskStatus: scenario.riskStatus,
    cashBalance: scenario.endingCash,
    evidenceRefs: [evidence]
  };
  if (scenario.shortfallAmount !== undefined) out.shortfallAmount = scenario.shortfallAmount;
  return out;
}

function projectConfidenceBand(band: EngineConfidenceBand, index: number): DomainConfidenceBand {
  const date = toDate(band.date);
  const iso = date.toISOString().slice(0, 10);
  return {
    id: `band:${iso}:${index}`,
    label: iso,
    lowerBound: band.low,
    upperBound: band.high,
    confidenceLevel: 0.8
  };
}

function projectObligationRisk(risk: EngineObligationRisk): DomainObligationRisk {
  const out: DomainObligationRisk = {
    obligationId: risk.obligationId,
    dueDate: toDate(risk.dueDate),
    amount: risk.amount,
    riskStatus: risk.riskStatus,
    reason: `coverage_status:${risk.coverageStatus}`,
    evidenceRefs:
      risk.evidenceRefs.length > 0
        ? risk.evidenceRefs
        : [{ kind: "obligation", id: risk.obligationId }]
  };
  if (risk.shortfallAmount !== undefined) out.shortfallAmount = risk.shortfallAmount;
  return out;
}

/**
 * Project an engine `CashForecast` into the domain canonical shape that
 * `insertCashForecast` consumes. The caller mints the persistence id (a
 * real UUID — the engine's deterministic `forecast:<co>:<date>:<horizon>`
 * string is NOT a UUID).
 *
 * Lossy by necessity: the engine's `ForecastScenario` carries
 * starting/ending cash; the domain row only stores ending cash.
 * `ConfidenceBand` collapses to lower/upper bounds at a fixed confidence
 * level. The dense engine fields go to the JSONB column via the wire
 * serializer in `forecasts` repo.
 */
export function toDomainCashForecast(input: {
  engineForecast: EngineCashForecast;
  forecastId: string;
}): DomainCashForecast {
  const { engineForecast, forecastId } = input;
  const fallbackEvidence: EvidenceRef = { kind: "forecast", id: forecastId };
  const evidenceRefs =
    engineForecast.evidenceRefs.length > 0 ? engineForecast.evidenceRefs : [fallbackEvidence];

  const out: DomainCashForecast = {
    forecastId,
    companyId: engineForecast.companyId,
    generatedAt: engineForecast.generatedAt,
    asOfDate: engineForecast.asOfDate,
    horizonDays: engineForecast.horizonDays,
    triggerEventIds: engineForecast.triggerEventIds,
    cashBalance: engineForecast.cashBalance,
    expectedInflows: toDomainForecastCashFlows(engineForecast.expectedInflows),
    confidenceWeightedInflows: toDomainForecastCashFlows(
      engineForecast.confidenceWeightedInflows
    ),
    expectedOutflows: toDomainForecastCashFlows(engineForecast.expectedOutflows),
    riskStatus: engineForecast.riskStatus,
    scenarios: engineForecast.scenarios.map((s) => projectScenario(s, evidenceRefs[0]!)),
    confidenceBands: engineForecast.confidenceBands.map((b, i) => projectConfidenceBand(b, i)),
    obligationRisks: engineForecast.obligationRisks.map(projectObligationRisk),
    evidenceRefs
  };
  if (engineForecast.shortfallAmount !== undefined) {
    out.shortfallAmount = engineForecast.shortfallAmount;
  }
  return out;
}
