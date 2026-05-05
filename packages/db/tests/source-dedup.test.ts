import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { companies } from "../src/schema/index.js";
import { upsertSourceObject } from "../src/repositories/source.js";
import { createMemDb, type MemDbContext } from "./helpers/pg-mem.js";

describe("source object content-hash dedup", () => {
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

  it("inserts on first import and reports duplicate on re-import of the same payload", async () => {
    const input = {
      companyId,
      provider: "xero",
      providerObjectType: "invoice",
      providerObjectId: "xero-inv-1",
      contentHash: "sha256-aaa",
      rawPayload: { invoiceNumber: "RO-1001", amountDueMinor: 1850000 },
      sourceUpdatedAt: new Date("2026-05-04T08:30:00Z"),
    };

    const first = await upsertSourceObject(ctx.db, input);
    expect(first.kind).toBe("inserted");

    const second = await upsertSourceObject(ctx.db, input);
    expect(second.kind).toBe("duplicate");
    if (second.kind === "duplicate") {
      expect(second.row.id).toBe(first.kind === "inserted" ? first.row.id : "");
    }
  });

  it("treats two different payloads with the same natural key as a duplicate (no overwrite)", async () => {
    const base = {
      companyId,
      provider: "xero",
      providerObjectType: "invoice",
      providerObjectId: "xero-inv-2",
      sourceUpdatedAt: new Date("2026-05-04T08:30:00Z"),
    };

    const first = await upsertSourceObject(ctx.db, {
      ...base,
      contentHash: "sha256-aaa",
      rawPayload: { invoiceNumber: "RO-2001", amountDueMinor: 1 },
    });
    expect(first.kind).toBe("inserted");

    const second = await upsertSourceObject(ctx.db, {
      ...base,
      contentHash: "sha256-bbb",
      rawPayload: { invoiceNumber: "RO-2001", amountDueMinor: 99999 },
    });
    expect(second.kind).toBe("duplicate");
    if (second.kind === "duplicate" && first.kind === "inserted") {
      // Original payload is preserved — we do not silently overwrite.
      expect(second.row.id).toBe(first.row.id);
      expect(second.row.rawPayloadHash).toBe("sha256-aaa");
    }
  });

  it("isolates content-hash dedup per tenant", async () => {
    const [other] = await ctx.db
      .insert(companies)
      .values({ displayName: "Beta", slug: "beta" })
      .returning();
    const otherId = other!.id;

    const payload = { invoiceNumber: "RO-9999" };

    const a = await upsertSourceObject(ctx.db, {
      companyId,
      provider: "xero",
      providerObjectType: "invoice",
      providerObjectId: "shared-id",
      contentHash: "sha256-shared",
      rawPayload: payload,
    });
    const b = await upsertSourceObject(ctx.db, {
      companyId: otherId,
      provider: "xero",
      providerObjectType: "invoice",
      providerObjectId: "shared-id",
      contentHash: "sha256-shared",
      rawPayload: payload,
    });

    expect(a.kind).toBe("inserted");
    expect(b.kind).toBe("inserted");
  });
});
