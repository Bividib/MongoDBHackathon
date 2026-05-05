import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { repositories, schema } from "@runwayops/db";

import { XeroSimulatedAdapter } from "../src/adapters/xero-simulated.js";
import type { ProviderConnection } from "../src/provider.js";
import { syncProviderToSourceObjects } from "../src/sync.js";
import { connectRealDb, type RealDbContext } from "./helpers/postgres.js";

const REAL_DB = process.env.TEST_DATABASE_URL;
const describeReal = REAL_DB ? describe : describe.skip;

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/xero",
);

const { withTenant } = repositories;
const { companies, customers, invoices, payments, sourceObjects } = schema;

describeReal("xero simulated adapter → source objects → canonical entities", () => {
  let ctx: RealDbContext;
  let companyId: string;

  beforeAll(async () => {
    const real = await connectRealDb();
    if (!real) throw new Error("connectRealDb returned null with TEST_DATABASE_URL set");
    ctx = real;
    const [company] = await ctx.adminDb
      .insert(companies)
      .values({
        displayName: "XeroSimCo",
        slug: `xero-sim-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      })
      .returning();
    companyId = company!.id;
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it("loads fixture → upserts source objects → populates invoices/payments/customers", async () => {
    const adapter = new XeroSimulatedAdapter();
    const connection: ProviderConnection = {
      companyId,
      providerKey: "xero",
      metadata: { fixtureRoot: FIXTURE_ROOT },
    };

    const result = await withTenant(ctx.db, companyId, (tx) =>
      syncProviderToSourceObjects(tx, connection, adapter),
    );
    expect(result.contactsImported).toBe(3);
    expect(result.invoicesImported).toBe(3);
    expect(result.paymentsImported).toBe(2);

    const [sourceRows, customerRows, invoiceRows, paymentRows] = await Promise.all([
      withTenant(ctx.db, companyId, (tx) => tx.select().from(sourceObjects)),
      withTenant(ctx.db, companyId, (tx) => tx.select().from(customers)),
      withTenant(ctx.db, companyId, (tx) => tx.select().from(invoices)),
      withTenant(ctx.db, companyId, (tx) => tx.select().from(payments)),
    ]);

    expect(sourceRows).toHaveLength(8);
    const byType = sourceRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.providerObjectType] = (acc[row.providerObjectType] ?? 0) + 1;
      return acc;
    }, {});
    expect(byType.contact).toBe(3);
    expect(byType.invoice).toBe(3);
    expect(byType.payment).toBe(2);

    const ro1001 = invoiceRows.find((row) => row.invoiceNumber === "RO-1001");
    expect(ro1001).toBeDefined();
    expect(ro1001!.amountTotalMinor).toBe(1_850_000n);
    expect(ro1001!.amountDueMinor).toBe(1_850_000n);
    expect(ro1001!.status).toBe("authorised");
    expect(ro1001!.currency).toBe("GBP");
    expect(ro1001!.sourceObjectId).not.toBeNull();

    const northstar = customerRows.find((row) => row.displayName === "Northstar Foods Ltd");
    expect(northstar).toBeDefined();
    expect(ro1001!.customerId).toBe(northstar!.id);

    const partial = paymentRows.find((row) => row.amountMinor === 250_000n);
    expect(partial).toBeDefined();
    expect(partial!.providerStatus).toBe("posted");
    const ro1002 = invoiceRows.find((row) => row.invoiceNumber === "RO-1002");
    expect(partial!.invoiceId).toBe(ro1002!.id);
  });

  it("re-running the sync against unchanged fixtures is a no-op", async () => {
    const adapter = new XeroSimulatedAdapter();
    const connection: ProviderConnection = {
      companyId,
      providerKey: "xero",
      metadata: { fixtureRoot: FIXTURE_ROOT },
    };

    const before = await withTenant(ctx.db, companyId, (tx) =>
      tx.select().from(sourceObjects),
    );
    const second = await withTenant(ctx.db, companyId, (tx) =>
      syncProviderToSourceObjects(tx, connection, adapter),
    );
    expect(second.contactsImported).toBe(0);
    expect(second.invoicesImported).toBe(0);
    expect(second.paymentsImported).toBe(0);
    expect(second.contactsDeduped).toBe(3);
    expect(second.invoicesDeduped).toBe(3);
    expect(second.paymentsDeduped).toBe(2);

    const after = await withTenant(ctx.db, companyId, (tx) =>
      tx.select().from(sourceObjects),
    );
    expect(after).toHaveLength(before.length);
  });

  it("rejects connection.providerKey/provider mismatch (defense against caller error)", async () => {
    const adapter = new XeroSimulatedAdapter();
    const connection: ProviderConnection = {
      companyId,
      providerKey: "quickbooks",
      metadata: { fixtureRoot: FIXTURE_ROOT },
    };
    await expect(
      withTenant(ctx.db, companyId, (tx) =>
        syncProviderToSourceObjects(tx, connection, adapter),
      ),
    ).rejects.toThrow(/does not match provider/);
  });
});
