import type {
  BankTransaction as EngineBankTransaction,
  CashEnginePolicy,
  CriticalObligation as EngineCriticalObligation,
  Invoice as EngineInvoice,
  Money,
  Payment as EnginePayment,
  PromiseToPay as EnginePromiseToPay,
} from "@runwayops/cash-engine";
import type { CurrencyCode } from "@runwayops/domain";

import { getTotalCashBalance, listRecentBankTransactionsForCompany } from "./bank.js";
import { getCashEnginePolicyForCompany } from "./company-policy.js";
import { listOpenCriticalObligationsForCompany } from "./critical-obligations.js";
import { listOpenInvoicesForCompany } from "./invoices.js";
import { listRecentPaymentsForCompany } from "./payments.js";
import { listPendingPromisesForCompany } from "./promises.js";
import type { DbHandle } from "./tenant.js";

export type ForecastFactInputs = {
  cashBalance: Money;
  invoices: EngineInvoice[];
  payments: EnginePayment[];
  promises: EnginePromiseToPay[];
  criticalObligations: EngineCriticalObligation[];
  bankTransactions: EngineBankTransaction[];
  policy: Partial<CashEnginePolicy> | undefined;
};

export type LoadForecastFactsInput = {
  companyId: string;
  asOfDate: Date;
  horizonDays: 7 | 14 | 30 | 90;
  currency: CurrencyCode;
  /**
   * How far back from `asOfDate` to look for posted payments and bank
   * transactions. Older history adds noise without signal — the engine's
   * lookback for matching is bounded.
   */
  paymentLookbackDays?: number;
  bankTransactionLookbackDays?: number;
  /**
   * Hard caps on row counts. Match the per-repo defaults; tighten if a
   * specific company starts producing pathological fact sets.
   */
  invoiceLimit?: number;
  paymentLimit?: number;
  bankTransactionLimit?: number;
  obligationLimit?: number;
  promiseLimit?: number;
};

const DEFAULT_PAYMENT_LOOKBACK_DAYS = 60;
const DEFAULT_BANK_LOOKBACK_DAYS = 30;

function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysClone(date: Date, deltaDays: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + deltaDays);
  return out;
}

/**
 * Aggregate the read side of the cash-engine input contract. The workers
 * activity calls this to materialize a `ComputeCashForecastInput` (minus
 * the metadata fields the caller controls: forecastId, generatedAt,
 * triggerEventIds). All queries are tenant-scoped — caller must have set
 * the GUC via `withTenant`.
 *
 * Deferred until later rounds (engine accepts these as optional):
 *   - supplierBills (Round 4)
 *   - customerStats (Round 5+ once we backfill payment behaviour stats)
 */
export async function loadFinancialFactsForForecast(
  handle: DbHandle,
  input: LoadForecastFactsInput,
): Promise<ForecastFactInputs> {
  const horizonEnd = addDaysClone(input.asOfDate, input.horizonDays);
  const paymentSince = addDaysClone(
    input.asOfDate,
    -(input.paymentLookbackDays ?? DEFAULT_PAYMENT_LOOKBACK_DAYS),
  );
  const bankSince = addDaysClone(
    input.asOfDate,
    -(input.bankTransactionLookbackDays ?? DEFAULT_BANK_LOOKBACK_DAYS),
  );

  const [
    cashBalance,
    invoices,
    payments,
    promises,
    criticalObligations,
    bankTransactions,
    policy,
  ] = await Promise.all([
    getTotalCashBalance(handle, {
      companyId: input.companyId,
      currency: input.currency,
    }),
    listOpenInvoicesForCompany(handle, {
      companyId: input.companyId,
      ...(input.invoiceLimit !== undefined ? { limit: input.invoiceLimit } : {}),
    }),
    listRecentPaymentsForCompany(handle, {
      companyId: input.companyId,
      sinceDate: isoDateOnly(paymentSince),
      ...(input.paymentLimit !== undefined ? { limit: input.paymentLimit } : {}),
    }),
    listPendingPromisesForCompany(handle, {
      companyId: input.companyId,
      ...(input.promiseLimit !== undefined ? { limit: input.promiseLimit } : {}),
    }).then(toEnginePromises),
    listOpenCriticalObligationsForCompany(handle, {
      companyId: input.companyId,
      untilDueDate: isoDateOnly(horizonEnd),
      ...(input.obligationLimit !== undefined ? { limit: input.obligationLimit } : {}),
    }),
    listRecentBankTransactionsForCompany(handle, {
      companyId: input.companyId,
      sincePostedAt: bankSince,
      ...(input.bankTransactionLimit !== undefined ? { limit: input.bankTransactionLimit } : {}),
    }),
    getCashEnginePolicyForCompany(handle, { companyId: input.companyId }),
  ]);

  return {
    cashBalance,
    invoices,
    payments,
    promises,
    criticalObligations,
    bankTransactions,
    policy,
  };
}

/**
 * Domain `PromiseToPay` and engine `PromiseToPay` are structurally
 * compatible at the field level (engine type is a subset of the domain
 * shape), but the engine declares `evidenceRefs.sourceTimestamp` as `Date
 * | string` whereas the domain pins it to `Date`. Cast through unknown to
 * sidestep the variance — values still satisfy the engine contract.
 */
function toEnginePromises(
  rows: Array<import("@runwayops/domain").PromiseToPay>,
): EnginePromiseToPay[] {
  return rows as unknown as EnginePromiseToPay[];
}
