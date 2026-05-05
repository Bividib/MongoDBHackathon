import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money } from "@runwayops/domain";
import type { CashForecast } from "@runwayops/domain";

import { companies } from "../src/schema/index.js";
import {
  completeIdempotencyKey,
  reserveIdempotencyKey,
} from "../src/repositories/idempotency.js";
import { enqueueOutbox } from "../src/repositories/outbox.js";
import {
  getLatestForecast,
  insertCashForecast,
} from "../src/repositories/forecasts.js";
import { setTenant, withTenant } from "../src/repositories/tenant.js";
import { connectRealDb, type RealDbContext } from "./helpers/postgres.js";

const REAL_DB = process.env.TEST_DATABASE_URL;
const describeReal = REAL_DB ? describe : describe.skip;

// These suites verify behavior that depends on real-Postgres semantics that
// pg-mem does not faithfully emulate:
//   * `INSERT ... ON CONFLICT DO NOTHING RETURNING` returns zero rows on
//     conflict (pg-mem returns the existing row).
//   * BEGIN / ROLLBACK actually undoes pending writes through drizzle's
//     node-postgres pool/client adapter.
//   * Row-level security policies (pg-mem does not enforce RLS at all).
//
// Cross-tenant setup (creating multiple companies in beforeAll) uses
// `ctx.adminDb` because the app role legitimately cannot bootstrap a tenant
// under the companies_tenant_isolation policy. Everything actually under
// test runs through the app-role pool inside `withTenant` so RLS is
// enforced exactly as it would be in production.

describeReal("idempotency repository (real Postgres semantics)", () => {
  let ctx: RealDbContext;
  let companyId: string;

  beforeAll(async () => {
    const real = await connectRealDb();
    if (!real) throw new Error("connectRealDb returned null with TEST_DATABASE_URL set");
    ctx = real;
    const [company] = await ctx.adminDb
      .insert(companies)
      .values({ displayName: "AcmeReal", slug: `acme-${Date.now()}` })
      .returning();
    companyId = company!.id;
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it("returns fresh on first reservation and replay on the second with the same hash", async () => {
    const first = await withTenant(ctx.db, companyId, (tx) =>
      reserveIdempotencyKey(tx, {
        companyId,
        scope: "collections.send",
        key: "real-req-001",
        requestHash: "hash-A",
      }),
    );
    expect(first.kind).toBe("fresh");

    await withTenant(ctx.db, companyId, (tx) =>
      completeIdempotencyKey(tx, {
        companyId,
        scope: "collections.send",
        key: "real-req-001",
        responseJson: { ok: true, sent: 1 },
        statusCode: 200,
      }),
    );

    const second = await withTenant(ctx.db, companyId, (tx) =>
      reserveIdempotencyKey(tx, {
        companyId,
        scope: "collections.send",
        key: "real-req-001",
        requestHash: "hash-A",
      }),
    );
    expect(second.kind).toBe("replay");
    if (second.kind === "replay") {
      expect(second.row.responseJson).toEqual({ ok: true, sent: 1 });
      expect(second.row.statusCode).toBe(200);
    }
  });

  it("returns conflict when the same key is reused with a different hash", async () => {
    await withTenant(ctx.db, companyId, (tx) =>
      reserveIdempotencyKey(tx, {
        companyId,
        scope: "collections.send",
        key: "real-req-002",
        requestHash: "hash-A",
      }),
    );

    const conflict = await withTenant(ctx.db, companyId, (tx) =>
      reserveIdempotencyKey(tx, {
        companyId,
        scope: "collections.send",
        key: "real-req-002",
        requestHash: "hash-B",
      }),
    );
    expect(conflict.kind).toBe("conflict");
  });
});

describeReal("outbox enqueue (real Postgres transaction semantics)", () => {
  let ctx: RealDbContext;
  let companyId: string;

  beforeAll(async () => {
    const real = await connectRealDb();
    if (!real) throw new Error("connectRealDb returned null with TEST_DATABASE_URL set");
    ctx = real;
    const [company] = await ctx.adminDb
      .insert(companies)
      .values({ displayName: "OutboxReal", slug: `outbox-${Date.now()}` })
      .returning();
    companyId = company!.id;
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it("rolls back the outbox row when its enclosing transaction rolls back", async () => {
    const aggregateId = crypto.randomUUID();
    const idempotencyKey = `real-enqueue:${aggregateId}`;

    await expect(
      ctx.db.transaction(async (tx) => {
        await setTenant(tx, companyId);
        await enqueueOutbox(tx, {
          companyId,
          eventType: "test",
          aggregateType: "test",
          aggregateId,
          payload: {},
          idempotencyKey,
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const after = await withTenant(ctx.db, companyId, (tx) =>
      enqueueOutbox(tx, {
        companyId,
        eventType: "test",
        aggregateType: "test",
        aggregateId,
        payload: { committed: true },
        idempotencyKey,
      }),
    );

    expect(after.payloadJson).toEqual({ committed: true });
  });
});

describeReal("forecast persistence (bigint Money survives the JSON round-trip)", () => {
  let ctx: RealDbContext;
  let companyId: string;

  beforeAll(async () => {
    const real = await connectRealDb();
    if (!real) throw new Error("connectRealDb returned null with TEST_DATABASE_URL set");
    ctx = real;
    const [company] = await ctx.adminDb
      .insert(companies)
      .values({ displayName: "ForecastReal", slug: `forecast-${Date.now()}` })
      .returning();
    companyId = company!.id;
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it("persists a forecast with bigint Money in dense fields and reads it back lossless", async () => {
    const forecastId = crypto.randomUUID();
    const generatedAt = new Date("2026-05-04T00:00:00.000Z");
    const expectedDate = new Date("2026-05-08T00:00:00.000Z");
    const sourceTimestamp = new Date("2026-05-01T08:00:00.000Z");

    const evidence = {
      kind: "invoice" as const,
      id: "evt_inflow_1",
      summary: "Northstar invoice",
      sourceProvider: "test",
      sourceTimestamp,
    };

    const input: CashForecast = {
      forecastId,
      companyId,
      generatedAt,
      asOfDate: generatedAt,
      horizonDays: 30,
      triggerEventIds: [],
      cashBalance: money("3200000", "GBP"),
      expectedInflows: [
        {
          id: "in_1",
          direction: "inflow",
          kind: "invoice",
          sourceId: "invoice_1",
          expectedDate,
          amount: money("999999999999999999999", "GBP"),
          probability: 0.65,
          confidence: 0.7,
          customerId: "cust_1",
          invoiceId: "invoice_1",
          evidenceRefs: [evidence],
        },
      ],
      confidenceWeightedInflows: [],
      expectedOutflows: [],
      riskStatus: "watch",
      scenarios: [
        {
          id: "scen_base",
          name: "Base",
          riskStatus: "watch",
          cashBalance: money("3200000", "GBP"),
          shortfallAmount: money("1000000", "GBP"),
          evidenceRefs: [evidence],
        },
      ],
      confidenceBands: [],
      shortfallAmount: money("1000000", "GBP"),
      obligationRisks: [
        {
          obligationId: "obligation_payroll",
          dueDate: expectedDate,
          amount: money("4200000", "GBP"),
          riskStatus: "high",
          shortfallAmount: money("1000000", "GBP"),
          reason: "Payroll exceeds projected high-confidence inflows.",
          evidenceRefs: [evidence],
        },
      ],
      evidenceRefs: [evidence],
    };

    const inserted = await withTenant(ctx.db, companyId, (tx) =>
      insertCashForecast(tx, input),
    );
    expect(inserted.forecastId).toBe(forecastId);
    expect(inserted.expectedInflows[0]?.amount.amountMinor).toBe(
      999999999999999999999n,
    );

    const reread = await withTenant(ctx.db, companyId, (tx) =>
      getLatestForecast(tx, { companyId, horizonDays: 30 }),
    );
    expect(reread).not.toBeNull();
    expect(reread!.forecastId).toBe(forecastId);
    expect(reread!.cashBalance.amountMinor).toBe(3200000n);
    expect(reread!.expectedInflows).toHaveLength(1);
    expect(reread!.expectedInflows[0]?.amount.amountMinor).toBe(
      999999999999999999999n,
    );
    expect(reread!.expectedInflows[0]?.amount.currency).toBe("GBP");
    expect(reread!.expectedInflows[0]?.expectedDate).toBeInstanceOf(Date);
    expect(reread!.expectedInflows[0]?.expectedDate.toISOString()).toBe(
      expectedDate.toISOString(),
    );
    expect(reread!.obligationRisks[0]?.dueDate).toBeInstanceOf(Date);
    expect(reread!.obligationRisks[0]?.amount.amountMinor).toBe(4200000n);
    expect(reread!.obligationRisks[0]?.shortfallAmount?.amountMinor).toBe(1000000n);
    expect(reread!.evidenceRefs[0]?.sourceTimestamp).toBeInstanceOf(Date);
  });

  it("blocks reading another tenant's forecast under RLS", async () => {
    const [otherCompany] = await ctx.adminDb
      .insert(companies)
      .values({ displayName: "OtherCo", slug: `other-${Date.now()}` })
      .returning();

    const reread = await withTenant(ctx.db, otherCompany!.id, (tx) =>
      getLatestForecast(tx, { companyId: otherCompany!.id, horizonDays: 30 }),
    );
    expect(reread).toBeNull();
  });
});
