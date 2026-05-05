import { and, eq } from "drizzle-orm";

import { outboxEvents } from "../schema/outbox.js";
import type { JsonObject } from "../schema/common.js";
import type { DbHandle } from "./tenant.js";

/**
 * Input contract for enqueueing a transactional outbox event.
 *
 * Producers should write the canonical entity AND the outbox row in the
 * same Drizzle transaction. The dispatcher (out of scope for this package)
 * later claims pending rows with `FOR UPDATE SKIP LOCKED` and publishes
 * them at-least-once. The `idempotencyKey` makes downstream replay safe.
 */
export type EnqueueOutboxInput = {
  companyId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: JsonObject;
  headers?: JsonObject;
  idempotencyKey: string;
  availableAt?: Date;
  auditEventId?: string;
};

export type OutboxEventRow = typeof outboxEvents.$inferSelect;

/**
 * Enqueue a domain event into the transactional outbox.
 *
 * Replay safety: if a row with the same idempotency_key already exists, the
 * function returns the existing row unchanged (no duplicate insert, no
 * status mutation). Producers therefore get at-least-once with exactly-once
 * effect on the outbox itself.
 *
 * The `handle` MUST be a Drizzle transaction handle. Callers are expected
 * to call this after writing the canonical mutation in the same transaction.
 */
export async function enqueueOutbox(
  handle: DbHandle,
  input: EnqueueOutboxInput,
): Promise<OutboxEventRow> {
  const inserted = await handle
    .insert(outboxEvents)
    .values({
      companyId: input.companyId,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payloadJson: input.payload,
      headersJson: input.headers ?? {},
      idempotencyKey: input.idempotencyKey,
      status: "pending",
      attempts: 0,
      availableAt: input.availableAt ?? new Date(),
      auditEventId: input.auditEventId,
    })
    .onConflictDoNothing({ target: outboxEvents.idempotencyKey })
    .returning();

  if (inserted.length === 1) {
    return inserted[0]!;
  }

  // Conflict: row already exists. Look it up and return it. The lookup is
  // tenant-scoped because RLS will reject cross-tenant access; this is also
  // a belt + braces explicit company_id filter.
  const existing = await handle
    .select()
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.companyId, input.companyId),
        eq(outboxEvents.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    throw new Error(
      `Outbox enqueue failed: idempotency_key conflict but row not visible (RLS or cross-tenant key collision)`,
    );
  }

  return existing[0]!;
}
