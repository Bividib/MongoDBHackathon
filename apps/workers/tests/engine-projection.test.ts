import { describe, expect, it } from "vitest";

import { computeCashForecast, money } from "@runwayops/cash-engine";

import { toDomainCashForecast } from "../src/temporal/activities/engine-projection.js";

describe("toDomainCashForecast", () => {
  it("projects engine forecast into the domain shape that insertCashForecast accepts", () => {
    const forecastId = "11111111-1111-1111-1111-111111111111";
    const engineForecast = computeCashForecast({
      forecastId,
      companyId: "22222222-2222-2222-2222-222222222222",
      asOfDate: "2026-05-04",
      horizonDays: 30,
      cashBalance: money(3_200_000_00, "GBP"),
      invoices: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          companyId: "22222222-2222-2222-2222-222222222222",
          customerId: "44444444-4444-4444-4444-444444444444",
          issueDate: "2026-04-01",
          dueDate: "2026-05-15",
          status: "sent",
          amountDue: money(150_000_00, "GBP")
        }
      ],
      criticalObligations: [
        {
          id: "55555555-5555-5555-5555-555555555555",
          companyId: "22222222-2222-2222-2222-222222222222",
          obligationType: "payroll",
          counterpartyName: "Payroll Bureau",
          dueDate: "2026-05-08",
          amount: money(80_000_00, "GBP"),
          criticality: "critical",
          status: "scheduled"
        }
      ]
    });

    const domainForecast = toDomainCashForecast({ engineForecast, forecastId });

    expect(domainForecast.forecastId).toBe(forecastId);
    expect(domainForecast.cashBalance.amountMinor).toBe(3_200_000_00n);
    expect(domainForecast.evidenceRefs.length).toBeGreaterThan(0);
    // Engine kind "critical_obligation" maps to domain canonical "obligation".
    const outflow = domainForecast.expectedOutflows[0];
    expect(outflow?.kind).toBe("obligation");
    // Engine "promise" → domain "promise_to_pay" mapping is exercised when
    // promises are present; with no promises the inflow set is invoice-only.
    const inflowKinds = new Set(domainForecast.expectedInflows.map((flow) => flow.kind));
    expect(inflowKinds.has("invoice")).toBe(true);
    // ObligationRisk requires a `reason` in the domain schema; we derive it
    // from the engine's coverageStatus so the persistence layer never sees
    // a missing field.
    expect(domainForecast.obligationRisks.every((risk) => risk.reason.length > 0)).toBe(
      true
    );
  });

  it("falls back to a forecast-keyed evidence ref when the engine emits none", () => {
    const forecastId = "66666666-6666-6666-6666-666666666666";
    const engineForecast = computeCashForecast({
      forecastId,
      companyId: "77777777-7777-7777-7777-777777777777",
      asOfDate: "2026-05-04",
      horizonDays: 7,
      cashBalance: money(0, "GBP")
    });

    expect(engineForecast.evidenceRefs).toHaveLength(0);

    const domainForecast = toDomainCashForecast({ engineForecast, forecastId });

    expect(domainForecast.evidenceRefs).toEqual([
      { kind: "forecast", id: forecastId }
    ]);
  });
});
