import {
  buildAfterHarbourRetainerForecast,
  buildBaselineForecast,
  DEMO_CASE
} from "../apps/web/lib/forecast";

function assertEqual(actual: number | string, expected: number | string, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

const baseline = buildBaselineForecast();
const afterHarbour = buildAfterHarbourRetainerForecast();

assertEqual(DEMO_CASE.cashToday, 8400, "cash today");
assertEqual(DEMO_CASE.payrollDue, 11200, "payroll due");
assertEqual(baseline.scenarios[0]?.fridayPositionAfterPayroll ?? 0, -5200, "baseline supplier paid gap");
assertEqual(baseline.scenarios[1]?.fridayPositionAfterPayroll ?? 0, -2800, "supplier held gap");
assertEqual(baseline.scenarios[2]?.fridayPositionAfterPayroll ?? 0, 2000, "northstar pays position");
assertEqual(afterHarbour.cashToday, 9600, "cash after Harbour Labs");
assertEqual(afterHarbour.scenarios[1]?.fridayPositionAfterPayroll ?? 0, -1600, "northstar slips after Harbour");
assertEqual(afterHarbour.scenarios[0]?.balanceAfterSupplierPaid ?? 0, 800, "remaining after supplier paid");
assertEqual(afterHarbour.riskStatus, "watch", "risk after Harbour");

console.log("RunwayOps deterministic cash maths checks passed.");
