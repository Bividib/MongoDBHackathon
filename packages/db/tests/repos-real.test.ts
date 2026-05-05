import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { companies } from "../src/schema/index.js";
import {
  completeIdempotencyKey,
  reserveIdempotencyKey,
} from "../src/repositories/idempotency.js";
import { enqueueOutbox } from "../src/repositories/outbox.js";
import { connectRealDb, type RealDbContext } from "./helpers/postgres.js";

const REAL_DB = process.env.TEST_DATABASE_URL;
const describeReal = REAL_DB ? describe : describe.skip;

// These suites verify behavior that depends on real-Postgres semantics that
// pg-mem does not faithfully emulate:
//   * `INSERT ... ON CONFLICT DO NOTHING RETURNING` returns zero rows on
//     conflict (pg-mem returns the existing row).
//   * BEGIN / ROLLBACK actually undoes pending writes through drizzle's
//     node-postgres pool/client adapter.

describeReal("idempotency repository (real Postgres semantics)", () => {
  let ctx: RealDbContext;
  let companyId: string;

  beforeAll(async () => {
    const real = await connectRealDb();
    if (!real) throw new Error("connectRealDb returned null with TEST_DATABASE_URL set");
    ctx = real;
    const [company] = await ctx.db
      .insert(companies)
      .values({ displayName: "AcmeReal", slug: `acme-${Date.now()}` })
      .returning();
    companyId = company!.id;
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it("returns fresh on first reservation and replay on the second with the same hash", async () => {
    const first = await reserveIdempotencyKey(ctx.db, {
      companyId,
      scope: "collections.send",
      key: "real-req-001",
      requestHash: "hash-A",
    });
    expect(first.kind).toBe("fresh");

    await completeIdempotencyKey(ctx.db, {
      companyId,
      scope: "collections.send",
      key: "real-req-001",
      responseJson: { ok: true, sent: 1 },
      statusCode: 200,
    });

    const second = await reserveIdempotencyKey(ctx.db, {
      companyId,
      scope: "collections.send",
      key: "real-req-001",
      requestHash: "hash-A",
    });
    expect(second.kind).toBe("replay");
    if (second.kind === "replay") {
      expect(second.row.responseJson).toEqual({ ok: true, sent: 1 });
      expect(second.row.statusCode).toBe(200);
    }
  });

  it("returns conflict when the same key is reused with a different hash", async () => {
    await reserveIdempotencyKey(ctx.db, {
      companyId,
      scope: "collections.send",
      key: "real-req-002",
      requestHash: "hash-A",
    });

    const conflict = await reserveIdempotencyKey(ctx.db, {
      companyId,
      scope: "collections.send",
      key: "real-req-002",
      requestHash: "hash-B",
    });
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
    const [company] = await ctx.db
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

    const after = await enqueueOutbox(ctx.db, {
      companyId,
      eventType: "test",
      aggregateType: "test",
      aggregateId,
      payload: { committed: true },
      idempotencyKey,
    });

    expect(after.payloadJson).toEqual({ committed: true });
  });
});
