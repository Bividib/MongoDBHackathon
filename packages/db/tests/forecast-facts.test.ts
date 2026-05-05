import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money } from "@runwayops/domain";

import {
  bankAccounts,
  bankTransactions,
  companies,
  companyPolicies,
  criticalObligations,
  customers,
  invoices,
  payments,
} from "../src/schema/index.js";
import { withTenant } from "../src/repositories/tenant.js";
import {
  getCashEnginePolicyForCompany,
  getTotalCashBalance,
  listOpenCriticalObligationsForCompany,
  listOpenInvoicesForCompany,
  listRecentBankTransactionsForCompany,
  listRecentPaymentsForCompany,
  loadFinancialFactsForForecast,
} from "../src/repositories/index.js";
import { connectRealDb, type RealDbContext } from "./helpers/postgres.js";

const REAL_DB = process.env.TEST_DATABASE_URL;
const describeReal = REAL_DB ? describe : describe.skip;

// These tests cover the cash-engine fact-loader contract end-to-end against
// real Postgres. pg-mem cannot stand in here because its DDL subset omits
// invoices/payments/bank/obligations and the loader runs as a parallel
// `Promise.all` over six repos — pg-mem's behavior under concurrency is
// not what we want to validate.
describeReal("forecast fact-loader (real Postgres)", () => {
  let ctx: RealDbContext;
  let companyId: string;
  let customerId: string;

  beforeAll(async () => {
    const real = await connectRealDb();
    if (!real) throw new Error("connectRealDb returned null with TEST_DATABASE_URL set");
    ctx = real;

    const [company] = await ctx.adminDb
      .insert(companies)
      .values({
        displayName: "FactLoaderCo",
        slug: `fact-loader-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      })
      .returning();
    companyId = company!.id;

    const [customer] = await ctx.adminDb
      .insert(customers)
      .values({
        companyId,
        displayName: "Acme Buyer",
      })
      .returning();
    customerId = customer!.id;
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it("listOpenInvoicesForCompany projects rows into engine Invoice shape with customer name", async () => {
    await withTenant(ctx.db, companyId, async (tx) => {
      await tx.insert(invoices).values({
        companyId,
        customerId,
        invoiceNumber: "INV-OPEN-1",
        issueDate: "2026-04-01",
        dueDate: "2026-05-15",
        status: "sent",
        amountTotalMinor: 100_000n,
        amountDueMinor: 60_000n,
        amountPaidMinor: 40_000n,
        currency: "GBP",
      });
      await tx.insert(invoices).values({
        companyId,
        customerId,
        invoiceNumber: "INV-PAID-1",
        issueDate: "2026-03-01",
        dueDate: "2026-04-01",
        status: "paid",
        amountTotalMinor: 50_000n,
        amountDueMinor: 0n,
        amountPaidMinor: 50_000n,
        currency: "GBP",
      });
    });

    const open = await withTenant(ctx.db, companyId, (tx) =>
      listOpenInvoicesForCompany(tx, { companyId }),
    );

    expect(open).toHaveLength(1);
    expect(open[0]?.invoiceNumber).toBe("INV-OPEN-1");
    expect(open[0]?.customerName).toBe("Acme Buyer");
    expect(open[0]?.amountDue.amountMinor).toBe(60_000n);
    expect(open[0]?.amountDue.currency).toBe("GBP");
    expect(open[0]?.amountPaid?.amountMinor).toBe(40_000n);
    expect(open[0]?.status).toBe("sent");
  });

  it("listRecentPaymentsForCompany filters out unsupported provider statuses", async () => {
    await withTenant(ctx.db, companyId, async (tx) => {
      await tx.insert(payments).values({
        companyId,
        customerId,
        paymentDate: "2026-04-15",
        amountMinor: 25_000n,
        currency: "GBP",
        providerStatus: "posted",
      });
      await tx.insert(payments).values({
        companyId,
        customerId,
        paymentDate: "2026-04-10",
        amountMinor: 5_000n,
        currency: "GBP",
        providerStatus: "unknown",
      });
    });

    const recent = await withTenant(ctx.db, companyId, (tx) =>
      listRecentPaymentsForCompany(tx, {
        companyId,
        sinceDate: "2026-01-01",
      }),
    );

    expect(recent).toHaveLength(2);
    const posted = recent.find((p) => p.amount.amountMinor === 25_000n);
    const unknown = recent.find((p) => p.amount.amountMinor === 5_000n);
    expect(posted?.providerStatus).toBe("posted");
    expect(unknown?.providerStatus).toBeUndefined();
  });

  it("getTotalCashBalance sums active accounts in the requested currency only", async () => {
    await withTenant(ctx.db, companyId, async (tx) => {
      await tx.insert(bankAccounts).values({
        companyId,
        provider: "stub",
        accountName: "Operating GBP",
        currency: "GBP",
        currentBalanceMinor: 1_000_000n,
        status: "active",
      });
      await tx.insert(bankAccounts).values({
        companyId,
        provider: "stub",
        accountName: "Savings GBP",
        currency: "GBP",
        currentBalanceMinor: 500_000n,
        status: "active",
      });
      await tx.insert(bankAccounts).values({
        companyId,
        provider: "stub",
        accountName: "USD account",
        currency: "USD",
        currentBalanceMinor: 9_999_999n,
        status: "active",
      });
      await tx.insert(bankAccounts).values({
        companyId,
        provider: "stub",
        accountName: "Closed GBP",
        currency: "GBP",
        currentBalanceMinor: 7_777n,
        status: "closed",
      });
    });

    const balance = await withTenant(ctx.db, companyId, (tx) =>
      getTotalCashBalance(tx, { companyId, currency: "GBP" }),
    );
    expect(balance.amountMinor).toBe(1_500_000n);
    expect(balance.currency).toBe("GBP");
  });

  it("listRecentBankTransactionsForCompany projects direction + amount and respects sincePostedAt", async () => {
    const accountId = await withTenant(ctx.db, companyId, async (tx) => {
      const [acct] = await tx
        .insert(bankAccounts)
        .values({
          companyId,
          provider: "stub",
          accountName: "Tx test",
          currency: "GBP",
          currentBalanceMinor: 0n,
          status: "active",
        })
        .returning();
      const id = acct!.id;
      await tx.insert(bankTransactions).values({
        companyId,
        bankAccountId: id,
        providerTransactionId: "tx-old",
        postedAt: new Date("2026-01-01T10:00:00Z"),
        direction: "credit",
        amountMinor: 11_111n,
        currency: "GBP",
        description: "Old credit",
        status: "posted",
      });
      await tx.insert(bankTransactions).values({
        companyId,
        bankAccountId: id,
        providerTransactionId: "tx-new",
        postedAt: new Date("2026-04-20T10:00:00Z"),
        direction: "debit",
        amountMinor: 22_222n,
        currency: "GBP",
        description: "New debit",
        status: "posted",
      });
      return id;
    });

    const txs = await withTenant(ctx.db, companyId, (tx) =>
      listRecentBankTransactionsForCompany(tx, {
        companyId,
        sincePostedAt: new Date("2026-02-01T00:00:00Z"),
      }),
    );

    expect(txs).toHaveLength(1);
    expect(txs[0]?.providerTransactionId).toBe("tx-new");
    expect(txs[0]?.direction).toBe("debit");
    expect(txs[0]?.amount.amountMinor).toBe(22_222n);
    expect(accountId).toBeDefined();
  });

  it("listOpenCriticalObligationsForCompany filters by status and respects untilDueDate", async () => {
    await withTenant(ctx.db, companyId, async (tx) => {
      await tx.insert(criticalObligations).values({
        companyId,
        obligationType: "payroll",
        counterpartyName: "Staff",
        dueDate: "2026-05-25",
        amountMinor: 200_000n,
        currency: "GBP",
        criticality: "critical",
        manualOrSource: "manual",
        status: "scheduled",
      });
      await tx.insert(criticalObligations).values({
        companyId,
        obligationType: "tax",
        counterpartyName: "HMRC",
        dueDate: "2026-08-01",
        amountMinor: 60_000n,
        currency: "GBP",
        criticality: "high",
        manualOrSource: "manual",
        status: "scheduled",
      });
      await tx.insert(criticalObligations).values({
        companyId,
        obligationType: "rent",
        counterpartyName: "Landlord",
        dueDate: "2026-04-01",
        amountMinor: 80_000n,
        currency: "GBP",
        criticality: "high",
        manualOrSource: "manual",
        status: "paid",
      });
    });

    const open = await withTenant(ctx.db, companyId, (tx) =>
      listOpenCriticalObligationsForCompany(tx, {
        companyId,
        untilDueDate: "2026-06-30",
      }),
    );

    expect(open).toHaveLength(1);
    expect(open[0]?.obligationType).toBe("payroll");
    expect(open[0]?.amount.amountMinor).toBe(200_000n);
    expect(open[0]?.criticality).toBe("critical");
  });

  it("getCashEnginePolicyForCompany whitelists known fields and ignores unknown / out-of-range", async () => {
    await withTenant(ctx.db, companyId, async (tx) => {
      await tx.insert(companyPolicies).values({
        companyId,
        policyKey: "cash_engine",
        status: "active",
        policyJson: {
          highConfidenceThreshold: 0.9,
          mediumConfidenceThreshold: 1.5, // out of range — must be dropped
          criticalObligationWindowDays: 5,
          unknownField: "ignored",
          materialShortfallAmountMinor: "12345",
          materialShortfallCurrency: "GBP",
        },
      });
    });

    const policy = await withTenant(ctx.db, companyId, (tx) =>
      getCashEnginePolicyForCompany(tx, { companyId }),
    );
    expect(policy).toBeDefined();
    expect(policy?.highConfidenceThreshold).toBe(0.9);
    expect(policy?.mediumConfidenceThreshold).toBeUndefined();
    expect(policy?.criticalObligationWindowDays).toBe(5);
    expect(policy?.materialShortfallAmount?.amountMinor).toBe(12_345n);
    expect(policy?.materialShortfallAmount?.currency).toBe("GBP");
  });

  it("loadFinancialFactsForForecast aggregates all six fact streams under the active tenant", async () => {
    const facts = await withTenant(ctx.db, companyId, (tx) =>
      loadFinancialFactsForForecast(tx, {
        companyId,
        asOfDate: new Date("2026-05-05T00:00:00Z"),
        horizonDays: 30,
        currency: "GBP",
      }),
    );

    expect(facts.cashBalance.currency).toBe("GBP");
    // open invoices includes INV-OPEN-1 only.
    expect(facts.invoices.length).toBeGreaterThanOrEqual(1);
    expect(facts.invoices.find((i) => i.invoiceNumber === "INV-OPEN-1")).toBeDefined();
    // payments includes posted + unknown projected (unknown has no providerStatus).
    expect(facts.payments.length).toBeGreaterThanOrEqual(2);
    // critical-obligation horizon: asOf + 30 = 2026-06-04, so payroll (2026-05-25) is in,
    // HMRC (2026-08-01) is out, and rent ("paid") is filtered by status.
    expect(facts.criticalObligations).toHaveLength(1);
    expect(facts.criticalObligations[0]?.obligationType).toBe("payroll");
    // bank transactions: payments lookback default 60d, bank lookback default 30d.
    // The "New debit" tx is 2026-04-20, asOf 2026-05-05 → within 30d window.
    expect(facts.bankTransactions.find((t) => t.providerTransactionId === "tx-new")).toBeDefined();
    // Policy whitelisted earlier.
    expect(facts.policy?.highConfidenceThreshold).toBe(0.9);
  });
});
