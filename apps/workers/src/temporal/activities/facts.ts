import { repositories } from "@runwayops/db";
import type { CurrencyCode } from "@runwayops/domain";

import type { FinancialFactsSummary, LoadFinancialFactsInput } from "./types.js";
import { getActivityContext } from "./context.js";

const { withTenant, loadFinancialFactsForForecast: loadFactsRepo } = repositories;

const DEFAULT_CURRENCY: CurrencyCode = "GBP";

/**
 * Load the financial facts that feed `cash-engine.computeCashForecast`.
 *
 * Delegates to `repositories.loadFinancialFactsForForecast`, which
 * aggregates invoices, payments, promises, critical obligations, bank
 * transactions, the cash balance, and the per-company policy override
 * inside a single tenant-scoped transaction. Returns the narrow
 * counts/balance summary the workflow layer branches on; activity callers
 * that need the full engine-input bundle (compute/rank) call the repo
 * directly so they can reuse the bundle without re-loading.
 */
export async function loadFinancialFactsForForecast(
  input: LoadFinancialFactsInput
): Promise<FinancialFactsSummary> {
  const { db } = getActivityContext();

  return withTenant(db, input.companyId, async (tx) => {
    const facts = await loadFactsRepo(tx, {
      companyId: input.companyId,
      asOfDate: new Date(input.asOfDate),
      horizonDays: input.horizonDays,
      currency: DEFAULT_CURRENCY
    });

    return {
      asOfDate: input.asOfDate,
      invoiceCount: facts.invoices.length,
      pendingPromiseCount: facts.promises.length,
      obligationCount: facts.criticalObligations.length,
      cashBalanceMinor: Number(facts.cashBalance.amountMinor),
      currency: facts.cashBalance.currency
    };
  });
}
