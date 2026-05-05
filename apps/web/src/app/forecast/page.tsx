import { ForecastView } from "./forecast-view";
import { getApiClient } from "@/lib/api";
import { adaptForecastScreen } from "@/lib/adapters";
import { toDisplayMoney } from "@/lib/format";
import type { ForecastScreenData } from "@/fixtures/types";

export const dynamic = "force-dynamic";

/**
 * Cash Confidence Forecast screen.
 *
 * Shows near-term cash with confidence bands and obligation coverage.
 *
 * Hard refusals:
 *  - No claim that an obligation is "safe", "covered", or "fine" —
 *    only numbers and risk status are shown.
 *  - The operator cannot edit the forecast — cash arithmetic is
 *    deterministic in the cash engine.
 */
export default async function ForecastPage() {
  const data = await loadForecast();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold">Cash Confidence Forecast</h1>
        <p className="text-sm text-gray-500">
          {data.forecast.horizonDays}-day horizon &middot; as of{" "}
          {new Date(data.forecast.asOfDate).toLocaleDateString("en-GB")}
        </p>
      </div>
      <ForecastView data={data} />
    </div>
  );
}

async function loadForecast(): Promise<ForecastScreenData> {
  const api = getApiClient();
  try {
    const forecast = await api.getLatestForecast();
    if (forecast) return adaptForecastScreen(forecast);
  } catch {
    // fall through to empty state
  }
  return emptyForecastScreen();
}

function emptyForecastScreen(): ForecastScreenData {
  const zero = toDisplayMoney({ amountMinor: "0", currency: "GBP" });
  const nowIso = new Date().toISOString();
  return {
    forecast: {
      forecastId: "no-forecast",
      generatedAt: nowIso,
      asOfDate: nowIso,
      horizonDays: 30,
      cashBalance: zero,
      riskStatus: "unknown",
      scenarios: [],
      confidenceBands: [],
      obligationRisks: [],
      expectedInflows: [],
      expectedOutflows: [],
      evidenceRefs: [],
    },
    horizonOptions: [7, 14, 30, 90],
    selectedHorizonDays: 30,
    selectedScenarioName: "base",
    forecastVersions: [],
    integrationHealth: { unhealthyConnectors: [] },
  };
}
