import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { companies, integrationConnections } from "../src/schema/index.js";
import {
  getIntegrationToken,
  getIntegrationTokenPair,
  upsertIntegrationToken,
} from "../src/repositories/integration-tokens.js";
import { withTenant } from "../src/repositories/tenant.js";
import { connectRealDb, type RealDbContext } from "./helpers/postgres.js";

const REAL_DB = process.env.TEST_DATABASE_URL;
const describeReal = REAL_DB ? describe : describe.skip;

describeReal("integration-tokens repo (real Postgres)", () => {
  let ctx: RealDbContext;
  let companyId: string;
  let connectionId: string;

  beforeAll(async () => {
    const real = await connectRealDb();
    if (!real) throw new Error("connectRealDb returned null with TEST_DATABASE_URL set");
    ctx = real;

    const [company] = await ctx.adminDb
      .insert(companies)
      .values({
        displayName: "TokensCo",
        slug: `tokens-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      })
      .returning();
    companyId = company!.id;

    const [conn] = await ctx.adminDb
      .insert(integrationConnections)
      .values({
        companyId,
        provider: "xero",
        status: "connected",
        displayName: "Test connection",
      })
      .returning();
    connectionId = conn!.id;
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it("upsert is idempotent — second call replaces the row instead of inserting", async () => {
    await withTenant(ctx.db, companyId, async (tx) => {
      await upsertIntegrationToken(tx, {
        companyId,
        connectionId,
        tokenType: "access",
        token: "at-1",
        expiresAt: new Date("2026-05-05T13:00:00Z"),
      });
      await upsertIntegrationToken(tx, {
        companyId,
        connectionId,
        tokenType: "access",
        token: "at-2",
        expiresAt: new Date("2026-05-05T14:00:00Z"),
      });
    });

    const view = await withTenant(ctx.db, companyId, (tx) =>
      getIntegrationToken(tx, { companyId, connectionId, tokenType: "access" }),
    );
    expect(view).not.toBeNull();
    expect(view?.token).toBe("at-2");
    expect(view?.expiresAt?.toISOString()).toBe("2026-05-05T14:00:00.000Z");
    expect(view?.rotatedAt).not.toBeNull();
  });

  it("access and refresh tokens coexist on one connection (separate keys)", async () => {
    await withTenant(ctx.db, companyId, async (tx) => {
      await upsertIntegrationToken(tx, {
        companyId,
        connectionId,
        tokenType: "refresh",
        token: "rt-1",
      });
    });

    const pair = await withTenant(ctx.db, companyId, (tx) =>
      getIntegrationTokenPair(tx, { companyId, connectionId }),
    );
    expect(pair.access?.token).toBe("at-2");
    expect(pair.refresh?.token).toBe("rt-1");
    expect(pair.refresh?.expiresAt).toBeNull();
  });

  it("returns null for tokens that don't exist", async () => {
    const view = await withTenant(ctx.db, companyId, (tx) =>
      getIntegrationToken(tx, {
        companyId,
        connectionId: "00000000-0000-4000-8000-000000000999",
        tokenType: "access",
      }),
    );
    expect(view).toBeNull();
  });
});
