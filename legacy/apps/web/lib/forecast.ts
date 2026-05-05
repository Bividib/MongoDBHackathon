import type { CashflowForecast, DemoCase, RiskStatus, Scenario } from "./types";

export const DEMO_CASE: DemoCase = {
  id: "case_payroll_2026_05_08",
  caseRef: "PR-2026-0508",
  companyId: "cmp_marlow_finch",
  companyName: "Marlow & Finch Creative Ltd",
  cashToday: 8400,
  payrollDue: 11200,
  supplierAmount: 2400,
  northstarInvoiceAmount: 4800,
  harbourRetainerAmount: 1200
};

export function formatCurrency(value: number): string {
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  });

  return formatter.format(value);
}

export function classifyRisk(worstCasePosition: number, hasConditionalDependency: boolean): RiskStatus {
  if (worstCasePosition < 0) {
    return hasConditionalDependency ? "watch" : "high";
  }

  return hasConditionalDependency ? "watch" : "safe";
}

export function buildBaselineForecast(): CashflowForecast {
  const scenarios: Scenario[] = [
    {
      id: "supplier_paid_no_collections",
      label: "Pay Supplier X + no collections",
      fridayPositionAfterPayroll:
        DEMO_CASE.cashToday - DEMO_CASE.supplierAmount - DEMO_CASE.payrollDue,
      riskStatus: "high"
    },
    {
      id: "supplier_held_no_collections",
      label: "Hold Supplier X + no collections",
      fridayPositionAfterPayroll: DEMO_CASE.cashToday - DEMO_CASE.payrollDue,
      riskStatus: "high"
    },
    {
      id: "supplier_held_northstar_pays",
      label: "Hold Supplier X + Northstar pays",
      fridayPositionAfterPayroll:
        DEMO_CASE.cashToday + DEMO_CASE.northstarInvoiceAmount - DEMO_CASE.payrollDue,
      riskStatus: "watch",
      confidence: 0.48
    }
  ];

  return {
    id: "forecast_case_0508_v1",
    caseId: DEMO_CASE.id,
    version: 1,
    cashToday: DEMO_CASE.cashToday,
    riskStatus: "high",
    scenarios,
    recommendedActionSummary:
      "Hold Supplier X within grace terms and pursue Northstar confirmation before payroll."
  };
}

export function buildAfterCustomerReplyForecast(): CashflowForecast {
  return {
    ...buildBaselineForecast(),
    id: "forecast_case_0508_v2",
    version: 2,
    riskStatus: "high",
    recommendedActionSummary:
      "Northstar reply is conditional on PO re-approval, so payroll remains high risk."
  };
}

export function buildAfterHarbourRetainerForecast(): CashflowForecast {
  const cashToday = DEMO_CASE.cashToday + DEMO_CASE.harbourRetainerAmount;
  const northstarSlips = cashToday - DEMO_CASE.payrollDue;
  const northstarPaysAfterSupplier =
    cashToday + DEMO_CASE.northstarInvoiceAmount - DEMO_CASE.payrollDue - DEMO_CASE.supplierAmount;

  return {
    id: "forecast_case_0508_v3",
    caseId: DEMO_CASE.id,
    version: 3,
    cashToday,
    riskStatus: classifyRisk(northstarSlips, true),
    scenarios: [
      {
        id: "northstar_pays_supplier_held",
        label: "Northstar pays; Supplier X held",
        fridayPositionAfterPayroll:
          cashToday + DEMO_CASE.northstarInvoiceAmount - DEMO_CASE.payrollDue,
        balanceAfterSupplierPaid: northstarPaysAfterSupplier,
        riskStatus: "watch",
        confidence: 0.48
      },
      {
        id: "northstar_slips_supplier_held",
        label: "Northstar slips; Supplier X held",
        fridayPositionAfterPayroll: northstarSlips,
        riskStatus: "high"
      }
    ],
    recommendedActionSummary:
      "Risk improves to watch, not cleared. Keep Supplier X on conditional hold until Northstar payment clears."
  };
}

export function buildForecastSequence(): CashflowForecast[] {
  return [
    buildBaselineForecast(),
    buildAfterCustomerReplyForecast(),
    buildAfterHarbourRetainerForecast()
  ];
}
