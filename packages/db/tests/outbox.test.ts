import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { companies } from "../src/schema/index.js";
import { enqueueOutbox } from "../src/repositories/outbox.js";
import { createMemDb, type MemDbContext } from "./helpers/pg-mem.js";

describe("outbox enqueue", () => {
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

  it("inserts an outbox row with the requested payload", async () => {
    const event = {
      companyId,
      eventType: "collection_action.recommended",
      aggregateType: "collection_action",
      aggregateId: crypto.randomUUID(),
      payload: { actionId: "action-1", customerId: "customer-1" },
      idempotencyKey: "demo:enqueue:1",
    };

    const row = await enqueueOutbox(ctx.db, event);

    expect(row.companyId).toBe(companyId);
    expect(row.eventType).toBe("collection_action.recommended");
    expect(row.idempotencyKey).toBe("demo:enqueue:1");
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(0);
    expect(row.payloadJson).toEqual({ actionId: "action-1", customerId: "customer-1" });
  });

  it("is idempotent on idempotency_key — second call returns the original row", async () => {
    const event = {
      companyId,
      eventType: "collection_action.recommended",
      aggregateType: "collection_action",
      aggregateId: crypto.randomUUID(),
      payload: { v: 1 },
      idempotencyKey: "demo:enqueue:2",
    };

    const first = await enqueueOutbox(ctx.db, event);
    const second = await enqueueOutbox(ctx.db, {
      ...event,
      payload: { v: 2 }, // payload changes are ignored on replay
    });

    expect(second.id).toBe(first.id);
    expect(second.payloadJson).toEqual({ v: 1 });
  });

  // The "transactional rollback" assertion needs real Postgres semantics
  // (pg-mem's pool/client adapter does not honor BEGIN/ROLLBACK from drizzle's
  // node-postgres session reliably). It is exercised by the real-Postgres
  // suite in tests/rls.test.ts when TEST_DATABASE_URL is set.
});
