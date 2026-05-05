import { describe, expect, it } from "vitest";

import { money } from "@runwayops/domain";
import type { CashForecast } from "@runwayops/domain";

import {
  deserializeForecastDense,
  serializeForecastDense,
} from "../src/repositories/forecasts.js";

const at = (iso: string): Date => new Date(iso);

const evidence = (id: string) =>
  ({
    kind: "invoice" as const,
    id,
    summary: "fixture",
    sourceProvider: "test",
    sourceTimestamp: at("2026-05-01T08:00:00.000Z"),
  }) satisfies CashForecast["expectedInflows"][number]["evidenceRefs"][number];

const dense = {
  expectedInflows: [
    {
      id: "in_1",
      direction: "inflow" as const,
      kind: "invoice" as const,
      sourceId: "invoice_1",
      expectedDate: at("2026-05-08T00:00:00.000Z"),
      amount: money("1850000", "GBP"),
      probability: 0.65,
      confidence: 0.7,
      customerId: "cust_1",
      invoiceId: "invoice_1",
      label: "Northstar invoice",
      evidenceRefs: [evidence("evt_inflow_1")],
    },
  ],
  confidenceWeightedInflows: [
    {
      id: "cwi_1",
      direction: "inflow" as const,
      kind: "promise_to_pay" as const,
      sourceId: "promise_1",
      expectedDate: at("2026-05-09T00:00:00.000Z"),
      amount: money("1500000", "GBP"),
      probability: 0.55,
      confidence: 0.55,
      promiseId: "promise_1",
      evidenceRefs: [evidence("evt_promise_1")],
    },
  ],
  expectedOutflows: [
    {
      id: "out_1",
      direction: "outflow" as const,
      kind: "obligation" as const,
      sourceId: "obligation_payroll",
      expectedDate: at("2026-05-10T00:00:00.000Z"),
      amount: money("4200000", "GBP"),
      probability: 1,
      confidence: 1,
      obligationId: "obligation_payroll",
      label: "Payroll",
      evidenceRefs: [{ ...evidence("evt_obligation_1"), kind: "obligation" as const }],
    },
  ],
  scenarios: [
    {
      id: "scen_base",
      name: "Base",
      riskStatus: "watch" as const,
      cashBalance: money("3200000", "GBP"),
      shortfallAmount: money("1000000", "GBP"),
      evidenceRefs: [evidence("evt_scen_1")],
    },
  ],
  confidenceBands: [
    {
      id: "band_2026_05_10",
      label: "2026-05-10",
      lowerBound: money("2800000", "GBP"),
      upperBound: money("4100000", "GBP"),
      confidenceLevel: 0.8,
    },
  ],
  obligationRisks: [
    {
      obligationId: "obligation_payroll",
      dueDate: at("2026-05-10T00:00:00.000Z"),
      amount: money("4200000", "GBP"),
      riskStatus: "high" as const,
      coverageAmount: money("3200000", "GBP"),
      shortfallAmount: money("1000000", "GBP"),
      reason: "Payroll exceeds projected high-confidence inflows.",
      evidenceRefs: [evidence("evt_risk_1")],
    },
  ],
};

describe("forecast dense serializer", () => {
  it("round-trips bigint Money via JSON.stringify without throwing", () => {
    const wire = serializeForecastDense(dense);

    // Critical contract: the serialized form MUST be JSON.stringify-safe.
    // Native bigint will throw TypeError; if any path forgot to convert,
    // this assertion fails.
    expect(() => JSON.stringify(wire)).not.toThrow();

    // Round-trip through actual JSON.
    const restored = deserializeForecastDense(JSON.parse(JSON.stringify(wire)));

    expect(restored.expectedInflows).toHaveLength(1);
    expect(restored.expectedInflows[0]?.amount.amountMinor).toBe(1850000n);
    expect(restored.expectedInflows[0]?.amount.currency).toBe("GBP");
    expect(restored.expectedInflows[0]?.expectedDate).toBeInstanceOf(Date);
    expect(restored.expectedInflows[0]?.expectedDate.toISOString()).toBe(
      "2026-05-08T00:00:00.000Z",
    );
    expect(restored.expectedInflows[0]?.evidenceRefs[0]?.sourceTimestamp).toBeInstanceOf(Date);
  });

  it("preserves Money equality across the wire", () => {
    const wire = serializeForecastDense(dense);
    const restored = deserializeForecastDense(JSON.parse(JSON.stringify(wire)));

    expect(restored.scenarios[0]?.cashBalance.amountMinor).toBe(3200000n);
    expect(restored.scenarios[0]?.shortfallAmount?.amountMinor).toBe(1000000n);
    expect(restored.confidenceBands[0]?.lowerBound.amountMinor).toBe(2800000n);
    expect(restored.confidenceBands[0]?.upperBound.amountMinor).toBe(4100000n);
    expect(restored.obligationRisks[0]?.amount.amountMinor).toBe(4200000n);
    expect(restored.obligationRisks[0]?.coverageAmount?.amountMinor).toBe(3200000n);
    expect(restored.obligationRisks[0]?.shortfallAmount?.amountMinor).toBe(1000000n);
  });

  it("preserves Date instances across the wire", () => {
    const wire = serializeForecastDense(dense);
    const restored = deserializeForecastDense(JSON.parse(JSON.stringify(wire)));

    expect(restored.obligationRisks[0]?.dueDate).toBeInstanceOf(Date);
    expect(restored.obligationRisks[0]?.dueDate.toISOString()).toBe("2026-05-10T00:00:00.000Z");
    expect(restored.expectedOutflows[0]?.expectedDate).toBeInstanceOf(Date);
  });

  it("emits empty arrays for missing dense fields", () => {
    const restored = deserializeForecastDense({});
    expect(restored.expectedInflows).toEqual([]);
    expect(restored.confidenceWeightedInflows).toEqual([]);
    expect(restored.expectedOutflows).toEqual([]);
    expect(restored.scenarios).toEqual([]);
    expect(restored.confidenceBands).toEqual([]);
    expect(restored.obligationRisks).toEqual([]);
  });

  it("rejects raw bigint at the input boundary by converting deterministically", () => {
    // The critical promise: even with a 21-digit bigint (above Number.MAX_SAFE_INTEGER),
    // the wire format preserves the value losslessly as a string.
    const huge = serializeForecastDense({
      ...dense,
      expectedInflows: [
        {
          ...dense.expectedInflows[0]!,
          amount: money("999999999999999999999", "GBP"),
        },
      ],
    });
    const json = JSON.stringify(huge);
    expect(json).toContain("999999999999999999999");

    const restored = deserializeForecastDense(JSON.parse(json));
    expect(restored.expectedInflows[0]?.amount.amountMinor).toBe(999999999999999999999n);
  });
});
