import { getForecastScreenData } from "@/fixtures/engine";
import { ForecastView } from "./forecast-view";

/**
 * Cash Confidence Forecast screen.
 *
 * Shows near-term cash with confidence bands and obligation coverage.
 * The operator sees today's actual cash, expected inflows weighted by
 * confidence, expected outflows, and risk status.
 *
 * Hard refusals:
 *  - No claim that an obligation is "safe", "covered", or "fine" —
 *    only numbers and risk status are shown.
 *  - The operator cannot edit the forecast — cash arithmetic is
 *    deterministic in the cash engine.
 */
export default function ForecastPage() {
  const data = getForecastScreenData();

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
