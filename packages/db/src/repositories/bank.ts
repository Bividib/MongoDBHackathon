import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";

import { type CurrencyCode, money, type Money } from "@runwayops/domain";
import type { BankTransaction as EngineBankTransaction } from "@runwayops/cash-engine";

import { bankAccounts, bankTransactions } from "../schema/bank.js";
import type { DbHandle } from "./tenant.js";

export type BankAccountRow = typeof bankAccounts.$inferSelect;
export type BankTransactionRow = typeof bankTransactions.$inferSelect;

type EngineDirection = EngineBankTransaction["direction"];
type EngineStatus = NonNullable<EngineBankTransaction["status"]>;

const ENGINE_STATUSES = new Set<EngineStatus>([
  "pending",
  "posted",
  "cancelled",
  "reversed",
]);

function rowToEngineBankTransaction(row: BankTransactionRow): EngineBankTransaction {
  const out: EngineBankTransaction = {
    id: row.id,
    companyId: row.companyId,
    postedDate: row.postedAt.toISOString(),
    amount: money(row.amountMinor.toString(), row.currency),
    direction: row.direction as EngineDirection,
    providerTransactionId: row.providerTransactionId,
  };
  if (row.counterpartyName) out.counterpartyName = row.counterpartyName;
  if (row.description) out.reference = row.description;
  if (ENGINE_STATUSES.has(row.status as EngineStatus)) {
    out.status = row.status as EngineStatus;
  }
  return out;
}

/**
 * Sum of `currentBalanceMinor` across all active bank accounts for a company,
 * in the company's base currency. Accounts with no recorded balance are
 * skipped. The cash-engine's `computeCashForecast` takes this as
 * `cashBalance` — the present-day starting point for the forecast.
 *
 * Multi-currency note: this repo assumes a single base currency per company.
 * If multiple currencies are present, the caller gets the sum in the
 * caller-specified `currency` and accounts in other currencies are skipped
 * — FX conversion is out of scope until Round 5.
 */
export async function getTotalCashBalance(
  handle: DbHandle,
  input: { companyId: string; currency: CurrencyCode },
): Promise<Money> {
  const rows = await handle
    .select({
      currentBalanceMinor: bankAccounts.currentBalanceMinor,
      currency: bankAccounts.currency,
    })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.companyId, input.companyId),
        eq(bankAccounts.status, "active"),
        eq(bankAccounts.currency, input.currency),
      ),
    );

  let total = 0n;
  for (const row of rows) {
    if (row.currentBalanceMinor !== null) total += row.currentBalanceMinor;
  }
  return money(total.toString(), input.currency);
}

/**
 * List recent bank transactions for a company, ordered by postedAt DESC.
 * Default limit is 500; the engine matcher / forecast only need the recent
 * window, so we cap fact size aggressively.
 */
export async function listRecentBankTransactionsForCompany(
  handle: DbHandle,
  input: {
    companyId: string;
    sincePostedAt?: Date;
    bankAccountIds?: readonly string[];
    limit?: number;
  },
): Promise<EngineBankTransaction[]> {
  const filters = [eq(bankTransactions.companyId, input.companyId)];
  if (input.sincePostedAt) filters.push(gte(bankTransactions.postedAt, input.sincePostedAt));
  if (input.bankAccountIds && input.bankAccountIds.length > 0) {
    filters.push(inArray(bankTransactions.bankAccountId, input.bankAccountIds as string[]));
  }

  const rows = await handle
    .select()
    .from(bankTransactions)
    .where(and(...filters))
    .orderBy(desc(bankTransactions.postedAt))
    .limit(input.limit ?? 500);

  return rows.map(rowToEngineBankTransaction);
}

export async function listBankAccountsForCompany(
  handle: DbHandle,
  input: { companyId: string },
): Promise<BankAccountRow[]> {
  return handle
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.companyId, input.companyId),
        eq(bankAccounts.status, "active"),
      ),
    )
    .orderBy(asc(bankAccounts.accountName));
}
