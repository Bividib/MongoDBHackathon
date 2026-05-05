import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { companies, invoices, customers } from "../src/schema/index.js";
import { setTenant, withTenant } from "../src/repositories/tenant.js";
import { connectRealDb, type RealDbContext } from "./helpers/postgres.js";

const REAL_DB = process.env.TEST_DATABASE_URL;

const describeReal = REAL_DB ? describe : describe.skip;

describeReal("RLS tenant isolation (real Postgres)", () => {
  let ctx: RealDbContext;
  let companyA: string;
  let companyB: string;
  let customerA: string;
  let customerB: string;

  beforeAll(async () => {
    if (!REAL_DB) {
      console.log("[rls.test] TEST_DATABASE_URL not set, skipping real-Postgres RLS tests");
      return;
    }
    const real = await connectRealDb();
    if (!real) throw new Error("connectRealDb returned null with TEST_DATABASE_URL set");
    ctx = real;

    // We need to act as a privileged role to seed across tenants. Migrations
    // run as the connection's default role, which is typically a superuser
    // and therefore bypasses RLS for setup. If the test DB is a non-super
    // user with only INSERT, the seed below will fail with an RLS violation
    // and the tester should grant `BYPASSRLS` or rerun as superuser.
    const [a] = await ctx.db
      .insert(companies)
      .values({ displayName: "Alpha", slug: `alpha-${Date.now()}` })
      .returning();
    const [b] = await ctx.db
      .insert(companies)
      .values({ displayName: "Beta", slug: `beta-${Date.now()}` })
      .returning();

    companyA = a!.id;
    companyB = b!.id;

    const [cA] = await ctx.db
      .insert(customers)
      .values({ companyId: companyA, displayName: "Customer A" })
      .returning();
    const [cB] = await ctx.db
      .insert(customers)
      .values({ companyId: companyB, displayName: "Customer B" })
      .returning();
    customerA = cA!.id;
    customerB = cB!.id;

    await ctx.db.insert(invoices).values([
      {
        companyId: companyA,
        customerId: customerA,
        invoiceNumber: "A-1",
        status: "sent",
        amountTotalMinor: 100_000n,
        amountDueMinor: 100_000n,
        amountPaidMinor: 0n,
        currency: "GBP",
      },
      {
        companyId: companyB,
        customerId: customerB,
        invoiceNumber: "B-1",
        status: "sent",
        amountTotalMinor: 200_000n,
        amountDueMinor: 200_000n,
        amountPaidMinor: 0n,
        currency: "GBP",
      },
    ]);
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it("returns only company A's rows when GUC is set to A", async () => {
    const rows = await withTenant(ctx.db, companyA, async (tx) => {
      return tx.select().from(invoices);
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.invoiceNumber).toBe("A-1");
  });

  it("returns only company B's rows when GUC is set to B", async () => {
    const rows = await withTenant(ctx.db, companyB, async (tx) => {
      return tx.select().from(invoices);
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.invoiceNumber).toBe("B-1");
  });

  it("returns zero rows when GUC is unset inside a transaction", async () => {
    const rows = await ctx.db.transaction(async (tx) => {
      // Intentionally do NOT setTenant.
      return tx.select().from(invoices);
    });
    expect(rows).toHaveLength(0);
  });

  it("rejects writes that would land in another tenant", async () => {
    await expect(
      withTenant(ctx.db, companyA, async (tx) => {
        // Try to insert a row tagged for companyB while the GUC is companyA.
        await tx.insert(invoices).values({
          companyId: companyB,
          customerId: customerB,
          invoiceNumber: "EVIL-1",
          status: "sent",
          amountTotalMinor: 1n,
          amountDueMinor: 1n,
          amountPaidMinor: 0n,
          currency: "GBP",
        });
      }),
    ).rejects.toThrow();
  });

  it("setTenant persists the GUC for the rest of the transaction", async () => {
    const rows = await ctx.db.transaction(async (tx) => {
      await setTenant(tx, companyA);
      return tx.select().from(invoices);
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.invoiceNumber).toBe("A-1");
  });
});
