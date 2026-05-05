import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { companies } from "../src/schema/index.js";
import {
  completeIdempotencyKey,
  reserveIdempotencyKey,
} from "../src/repositories/idempotency.js";
import { createMemDb, type MemDbContext } from "./helpers/pg-mem.js";

// Notes on test stratification:
//
// pg-mem's `INSERT ... ON CONFLICT (cols) DO NOTHING RETURNING` returns the
// existing row when a conflict triggers, instead of returning zero rows the
// way real Postgres does. That breaks the repository's "if inserted.length
// === 1 then it was fresh" branch, so the replay/conflict assertions only
// hold against a real Postgres. The tenant-scoping test below is a structural
// check that pg-mem CAN run (no conflict path involved).
//
// The replay/conflict semantics ARE covered by `tests/rls.test.ts`'s real-DB
// suite when TEST_DATABASE_URL is set; see also docs/testing.md.

describe("idempotency repository (pg-mem structural tests)", () => {
  let ctx: MemDbContext;
  let companyId: string;

  beforeEach(async () => {
    ctx = await createMemDb();
    const [company] = await ctx.db
      .insert(companies)
      .values({ displayName: "Acme", slug: "acme" })
      .returning();
    companyId = company!.id;
  });

  afterEach(async () => {
    await ctx.pool.end();
  });

  it("inserts a fresh reservation and persists the response on completion", async () => {
    const first = await reserveIdempotencyKey(ctx.db, {
      companyId,
      scope: "collections.send",
      key: "req-001",
      requestHash: "hash-A",
    });
    expect(first.kind).toBe("fresh");

    const completed = await completeIdempotencyKey(ctx.db, {
      companyId,
      scope: "collections.send",
      key: "req-001",
      responseJson: { ok: true, sent: 1 },
      statusCode: 200,
    });
    expect(completed.responseJson).toEqual({ ok: true, sent: 1 });
    expect(completed.statusCode).toBe(200);
  });

  it("scopes idempotency to the tenant — same key in two tenants is two reservations", async () => {
    const [other] = await ctx.db
      .insert(companies)
      .values({ displayName: "Beta", slug: "beta" })
      .returning();
    const otherId = other!.id;

    const a = await reserveIdempotencyKey(ctx.db, {
      companyId,
      scope: "collections.send",
      key: "shared-key",
      requestHash: "hash-A",
    });
    const b = await reserveIdempotencyKey(ctx.db, {
      companyId: otherId,
      scope: "collections.send",
      key: "shared-key",
      requestHash: "hash-B",
    });

    expect(a.kind).toBe("fresh");
    expect(b.kind).toBe("fresh");
  });
});
