import { and, eq } from "drizzle-orm";

import type { JsonObject } from "../schema/common.js";
import { idempotencyKeys } from "../schema/sync.js";
import type { DbHandle } from "./tenant.js";

const DEFAULT_TTL_HOURS = 24;

export type IdempotencyKeyRow = typeof idempotencyKeys.$inferSelect;

export type ReserveInput = {
  companyId: string;
  scope: string;
  key: string;
  requestHash: string;
  ttlHours?: number;
};

export type ReserveResult =
  | { kind: "fresh"; row: IdempotencyKeyRow }
  | { kind: "replay"; row: IdempotencyKeyRow }
  | { kind: "conflict"; row: IdempotencyKeyRow };

/**
 * Reserve an idempotency slot for a write command.
 *
 * Semantics:
 *   * `fresh`    — first time we have seen (companyId, scope, key). The
 *     caller should perform the mutation and then call `complete` with the
 *     response payload.
 *   * `replay`   — same (companyId, scope, key, requestHash) seen before
 *     and the prior response has been recorded. Caller should return that
 *     response without performing the mutation again.
 *   * `conflict` — same key with a DIFFERENT requestHash. Caller MUST treat
 *     this as a 409 / idempotency mismatch and refuse to mutate.
 *
 * The unique constraint on (company_id, scope, key) is enforced by the
 * database (see schema/sync.ts), so concurrent racers see one winner and
 * the rest fall through to the lookup branch.
 */
export async function reserveIdempotencyKey(
  handle: DbHandle,
  input: ReserveInput,
): Promise<ReserveResult> {
  const ttlHours = input.ttlHours ?? DEFAULT_TTL_HOURS;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  const inserted = await handle
    .insert(idempotencyKeys)
    .values({
      companyId: input.companyId,
      scope: input.scope,
      key: input.key,
      requestHash: input.requestHash,
      expiresAt,
    })
    .onConflictDoNothing({
      target: [idempotencyKeys.companyId, idempotencyKeys.scope, idempotencyKeys.key],
    })
    .returning();

  if (inserted.length === 1) {
    return { kind: "fresh", row: inserted[0]! };
  }

  const existing = await handle
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.companyId, input.companyId),
        eq(idempotencyKeys.scope, input.scope),
        eq(idempotencyKeys.key, input.key),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    throw new Error(
      "Idempotency reservation failed: insert skipped but no existing row visible (RLS or schema drift)",
    );
  }

  const row = existing[0]!;
  if (row.requestHash !== input.requestHash) {
    return { kind: "conflict", row };
  }

  return { kind: "replay", row };
}

export type CompleteInput = {
  companyId: string;
  scope: string;
  key: string;
  responseJson: JsonObject;
  statusCode: number;
};

/**
 * Persist the result of an idempotent operation.
 *
 * Subsequent `reserveIdempotencyKey` calls with the same hash will return
 * `{ kind: "replay", row }` whose `responseJson` and `statusCode` are
 * exactly what the original request returned.
 */
export async function completeIdempotencyKey(
  handle: DbHandle,
  input: CompleteInput,
): Promise<IdempotencyKeyRow> {
  const updated = await handle
    .update(idempotencyKeys)
    .set({
      responseJson: input.responseJson,
      statusCode: input.statusCode,
    })
    .where(
      and(
        eq(idempotencyKeys.companyId, input.companyId),
        eq(idempotencyKeys.scope, input.scope),
        eq(idempotencyKeys.key, input.key),
      ),
    )
    .returning();

  if (updated.length === 0) {
    throw new Error(
      "completeIdempotencyKey called for a key that was never reserved (or RLS denied access)",
    );
  }

  return updated[0]!;
}
