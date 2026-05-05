import type { FinancialFactsSummary, LoadFinancialFactsInput } from "./types.js";

/**
 * Load the financial facts that feed `cash-engine.computeCashForecast`.
 * Stub returns a small canned summary so workflows can branch on
 * shortfall/risk shape. Real implementation aggregates invoices, payments,
 * promises, supplier_bills, critical_obligations, customer_payment_stats,
 * bank_transactions for the given horizon.
 */
export async function loadFinancialFactsForForecast(
  input: LoadFinancialFactsInput
): Promise<FinancialFactsSummary> {
  return {
    asOfDate: input.asOfDate,
    invoiceCount: 12,
    pendingPromiseCount: 3,
    obligationCount: 2,
    cashBalanceMinor: 250_000_00,
    currency: "GBP"
  };
}
