import { and, eq } from "drizzle-orm";

import type { JsonValue } from "../schema/common.js";
import { sourceObjects } from "../schema/source.js";
import type { DbHandle } from "./tenant.js";

export type SourceObjectRow = typeof sourceObjects.$inferSelect;

export type UpsertSourceObjectInput = {
  companyId: string;
  provider: string;
  providerObjectType: string;
  providerObjectId: string;
  contentHash: string;
  rawPayload: JsonValue;
  sourceUpdatedAt?: Date;
};

export type UpsertSourceObjectResult =
  | { kind: "inserted"; row: SourceObjectRow }
  | { kind: "duplicate"; row: SourceObjectRow };

/**
 * Insert a raw source object, treating identical payloads as no-ops.
 *
 * Dedup is keyed on `(company_id, provider, content_hash)` — the spec calls
 * the column `content_hash` even though the physical column is named
 * `raw_payload_hash`. Re-importing the same payload from the same provider
 * inside the same tenant returns the prior row unchanged.
 *
 * The unique index `source_objects_provider_identity_unique` (the natural
 * key) means that if the same provider object is re-fetched with a CHANGED
 * payload the call will conflict on the natural key and we treat it as a
 * mutation that the caller is responsible for handling (we do not blindly
 * overwrite raw payloads — that loses history). For the common no-op path
 * the dedup index `source_objects_company_provider_payload_hash_unique`
 * absorbs the second insert.
 */
export async function upsertSourceObject(
  handle: DbHandle,
  input: UpsertSourceObjectInput,
): Promise<UpsertSourceObjectResult> {
  const inserted = await handle
    .insert(sourceObjects)
    .values({
      companyId: input.companyId,
      provider: input.provider,
      providerObjectType: input.providerObjectType,
      providerObjectId: input.providerObjectId,
      rawPayload: input.rawPayload,
      rawPayloadHash: input.contentHash,
      sourceUpdatedAt: input.sourceUpdatedAt,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 1) {
    return { kind: "inserted", row: inserted[0]! };
  }

  // Duplicate detected. We look up the existing row by the dedup key first
  // (content hash); if that misses we fall back to the natural key.
  const byContent = await handle
    .select()
    .from(sourceObjects)
    .where(
      and(
        eq(sourceObjects.companyId, input.companyId),
        eq(sourceObjects.provider, input.provider),
        eq(sourceObjects.rawPayloadHash, input.contentHash),
      ),
    )
    .limit(1);

  if (byContent.length === 1) {
    return { kind: "duplicate", row: byContent[0]! };
  }

  const byNaturalKey = await handle
    .select()
    .from(sourceObjects)
    .where(
      and(
        eq(sourceObjects.companyId, input.companyId),
        eq(sourceObjects.provider, input.provider),
        eq(sourceObjects.providerObjectType, input.providerObjectType),
        eq(sourceObjects.providerObjectId, input.providerObjectId),
      ),
    )
    .limit(1);

  if (byNaturalKey.length === 1) {
    return { kind: "duplicate", row: byNaturalKey[0]! };
  }

  throw new Error(
    "upsertSourceObject: insert skipped but no existing row visible (RLS or cross-tenant key collision)",
  );
}
