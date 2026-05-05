"use client";

import { useState } from "react";
import { RiskBadge } from "@/components/RiskBadge";
import { EvidenceDrawer } from "@/components/EvidenceDrawer";
import { StaleBanner } from "@/components/StaleBanner";
import { EmptyState } from "@/components/EmptyState";
import type { ForecastScreenData, ForecastScenarioView } from "@/fixtures/types";

type Props = { data: ForecastScreenData };

export function ForecastView({ data }: Props) {
  const { forecast, horizonOptions, forecastVersions, integrationHealth } = data;
  const [selectedScenario, setSelectedScenario] = useState(data.selectedScenarioName);

  const activeScenario = forecast.scenarios.find((s) => s.name === selectedScenario)
    ?? forecast.scenarios[0];

  // Empty state: no inflows and no obligations
  if (
    forecast.expectedInflows.length === 0 &&
    forecast.obligationRisks.length === 0
  ) {
    return (
      <EmptyState
        title="Forecast is empty"
        subtitle="Connect a bank feed and an accounting integration to populate."
        ctaLabel="Open Integration Health"
        ctaHref="/integrations"
      />
    );
  }

  return (
    <div className="space-y-4">
      <StaleBanner health={integrationHealth} />

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-white px-4 py-3">
        <div>
          <span className="text-xs text-gray-500">Cash Balance</span>
          <p className="text-lg font-bold">{forecast.cashBalance.formatted}</p>
        </div>
        <RiskBadge status={forecast.riskStatus} />
        {forecast.shortfallAmount && (
          <div>
            <span className="text-xs text-gray-500">Shortfall</span>
            <p className="text-sm font-semibold text-red-600">
              {forecast.shortfallAmount.formatted}
            </p>
          </div>
        )}
        <div className="ml-auto">
          <EvidenceDrawer evidenceRefs={forecast.evidenceRefs} />
        </div>
      </div>

      {/* Horizon toggles */}
      <div className="flex items-center gap-2" data-testid="horizon-toggles">
        <span className="text-xs text-gray-500">Horizon:</span>
        {horizonOptions.map((h) => (
          <button
            key={h}
            data-testid={`horizon-${h}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              h === forecast.horizonDays
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {h}d
          </button>
        ))}
      </div>

      {/* Scenario toggles */}
      <div className="flex items-center gap-2" data-testid="scenario-toggles">
        <span className="text-xs text-gray-500">Scenario:</span>
        {forecast.scenarios.map((s) => (
          <button
            key={s.name}
            onClick={() => setSelectedScenario(s.name)}
            data-testid={`scenario-${s.name}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              s.name === selectedScenario
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Active scenario summary */}
      {activeScenario && (
        <ScenarioCard scenario={activeScenario} />
      )}

      {/* Confidence bands table */}
      {forecast.confidenceBands.length > 0 && (
        <div className="rounded-lg border bg-white overflow-hidden">
          <h3 className="px-4 py-2 text-xs font-semibold text-gray-700 border-b">
            Confidence Bands
          </h3>
          <table className="w-full text-xs" data-testid="confidence-bands-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-right">Low</th>
                <th className="px-4 py-2 text-right">Expected</th>
                <th className="px-4 py-2 text-right">High</th>
              </tr>
            </thead>
            <tbody>
              {forecast.confidenceBands.map((band, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-2">
                    {new Date(band.date).toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-4 py-2 text-right text-red-600">
                    {band.low.formatted}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {band.expected.formatted}
                  </td>
                  <td className="px-4 py-2 text-right text-green-600">
                    {band.high.formatted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Obligation risks */}
      {forecast.obligationRisks.length > 0 && (
        <div className="rounded-lg border bg-white">
          <h3 className="px-4 py-2 text-xs font-semibold text-gray-700 border-b">
            Obligation Risks
          </h3>
          <div className="p-4 space-y-2" data-testid="obligation-risks">
            {forecast.obligationRisks.map((risk) => (
              <div
                key={risk.obligationId}
                data-testid="obligation-risk-pill"
                className="flex items-center justify-between rounded border px-3 py-2"
              >
                <div>
                  <span className="text-sm font-medium">
                    {risk.counterpartyName ?? risk.obligationType ?? risk.obligationId}
                  </span>
                  <span className="ml-2 text-xs text-gray-500">
                    {risk.amount.formatted} due{" "}
                    {new Date(risk.dueDate).toLocaleDateString("en-GB")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <RiskBadge status={risk.riskStatus} />
                  {risk.coverageStatus && (
                    <span className="text-[10px] text-gray-400">
                      {risk.coverageStatus.replace(/_/g, " ")}
                    </span>
                  )}
                  {risk.shortfallAmount && (
                    <span className="text-xs text-red-600">
                      -{risk.shortfallAmount.formatted}
                    </span>
                  )}
                  <EvidenceDrawer evidenceRefs={risk.evidenceRefs} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Forecast versions */}
      {forecastVersions.length > 1 && (
        <div className="rounded border bg-white px-4 py-3">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">
            Previous Versions
          </h3>
          {forecastVersions.map((v) => (
            <div key={v.forecastId} className="text-xs text-gray-500">
              {v.forecastId} &middot; {v.riskStatus} &middot;{" "}
              {new Date(v.generatedAt).toLocaleDateString("en-GB")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: ForecastScenarioView }) {
  return (
    <div
      data-testid="scenario-card"
      className="grid grid-cols-4 gap-4 rounded-lg border bg-white p-4"
    >
      <div>
        <span className="text-xs text-gray-500">Starting Cash</span>
        <p className="text-sm font-semibold">
          {scenario.startingCash.formatted}
        </p>
      </div>
      <div>
        <span className="text-xs text-gray-500">Expected Inflows</span>
        <p className="text-sm font-semibold text-green-700">
          +{scenario.expectedInflows.formatted}
        </p>
      </div>
      <div>
        <span className="text-xs text-gray-500">Expected Outflows</span>
        <p className="text-sm font-semibold text-red-700">
          -{scenario.expectedOutflows.formatted}
        </p>
      </div>
      <div>
        <span className="text-xs text-gray-500">Ending Cash</span>
        <p className="text-sm font-semibold">
          {scenario.endingCash.formatted}
        </p>
        <RiskBadge status={scenario.riskStatus} />
      </div>
    </div>
  );
}
