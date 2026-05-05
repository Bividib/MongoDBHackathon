import { and, desc, eq } from "drizzle-orm";

import type { AuditEvent, AuditTargetKind } from "@runwayops/domain";

import { auditEvents } from "../schema/audit.js";
import {
  deserializeEvidenceRefs,
  serializeEvidenceRefs,
} from "../schema/common.js";
import type { DbHandle } from "./tenant.js";

export type AuditEventRow = typeof auditEvents.$inferSelect;

/**
 * Input for `appendAuditEvent`. Mirrors @runwayops/domain auditEventSchema
 * but allows the caller to omit `id` (the DB defaults to gen_random_uuid()).
 */
export type AppendAuditEventInput = Omit<AuditEvent, "id"> & { id?: string };

function rowToDomain(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    companyId: row.companyId,
    actorType: row.actorType as AuditEvent["actorType"],
    actorId: row.actorId ?? undefined,
    action: row.action,
    targetKind: row.targetKind as AuditTargetKind,
    targetId: row.targetId,
    occurredAt: row.occurredAt,
    summary: row.summary,
    before: row.beforeJson ?? undefined,
    after: row.afterJson ?? undefined,
    evidenceRefs: deserializeEvidenceRefs(row.evidenceRefs ?? []),
    correlationId: row.correlationId ?? undefined,
    causationEventId: row.causationEventId ?? undefined,
  };
}

/**
 * Append a domain audit event. Append-only — there is no update or delete
 * path. The audit_events table is designed under deny-by-default RLS so this
 * helper requires the caller to have set the tenant GUC via `withTenant`.
 *
 * Pass-through transaction safety: if `handle` is a transaction, this
 * insert participates in it. The repo guarantees the row is materialized
 * before returning, so callers can chain `enqueueOutbox(handle, …, {
 * auditEventId })` safely.
 */
export async function appendAuditEvent(
  handle: DbHandle,
  input: AppendAuditEventInput,
): Promise<AuditEvent> {
  const values: typeof auditEvents.$inferInsert = {
    companyId: input.companyId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    targetKind: input.targetKind,
    targetId: input.targetId,
    occurredAt: input.occurredAt,
    summary: input.summary,
    beforeJson: input.before,
    afterJson: input.after,
    evidenceRefs: serializeEvidenceRefs(input.evidenceRefs ?? []),
    correlationId: input.correlationId ?? null,
    causationEventId: input.causationEventId ?? null,
  };
  if (input.id !== undefined) values.id = input.id;

  const inserted = await handle.insert(auditEvents).values(values).returning();

  if (inserted.length !== 1) {
    throw new Error("appendAuditEvent: insert returned no row");
  }
  return rowToDomain(inserted[0]!);
}

/**
 * Read the audit timeline for a single domain entity, newest first.
 * Backed by `audit_events_company_target_occurred_at_idx`.
 */
export async function listAuditEventsForTarget(
  handle: DbHandle,
  input: {
    companyId: string;
    targetKind: AuditTargetKind;
    targetId: string;
    limit?: number;
  },
): Promise<AuditEvent[]> {
  const rows = await handle
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.companyId, input.companyId),
        eq(auditEvents.targetKind, input.targetKind),
        eq(auditEvents.targetId, input.targetId),
      ),
    )
    .orderBy(desc(auditEvents.occurredAt))
    .limit(input.limit ?? 100);

  return rows.map(rowToDomain);
}

/**
 * Fetch all events tied to a correlationId across entity boundaries.
 * Useful for tracing a workflow run end-to-end.
 */
export async function listAuditEventsByCorrelation(
  handle: DbHandle,
  input: { companyId: string; correlationId: string; limit?: number },
): Promise<AuditEvent[]> {
  const rows = await handle
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.companyId, input.companyId),
        eq(auditEvents.correlationId, input.correlationId),
      ),
    )
    .orderBy(desc(auditEvents.occurredAt))
    .limit(input.limit ?? 200);

  return rows.map(rowToDomain);
}
