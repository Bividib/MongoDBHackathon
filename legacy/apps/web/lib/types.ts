export type RiskStatus = "high" | "watch" | "safe";

export type Scenario = {
  id: string;
  label: string;
  fridayPositionAfterPayroll: number;
  balanceAfterSupplierPaid?: number;
  riskStatus: RiskStatus;
  confidence?: number;
};

export type CashflowForecast = {
  id: string;
  caseId: string;
  version: number;
  cashToday: number;
  riskStatus: RiskStatus;
  scenarios: Scenario[];
  recommendedActionSummary: string;
};

export type DemoCase = {
  id: string;
  caseRef: string;
  companyId: string;
  companyName: string;
  cashToday: number;
  payrollDue: number;
  supplierAmount: number;
  northstarInvoiceAmount: number;
  harbourRetainerAmount: number;
};
