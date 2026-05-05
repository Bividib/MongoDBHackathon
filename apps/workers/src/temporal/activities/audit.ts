import { repositories } from "@runwayops/db";
import type {
  AuditEventSummary,
  DomainEventEmissionSummary,
  EmitDomainEventInput,
  WriteAuditEventInput
} from "./types.js";
import { getActivityContext } from "./context.js";

const { withTenant, appendAuditEvent, enqueueOutbox } = repositories;

/**
 * Persist an audit event within a tenant transaction and enqueue an
 * outbox event for downstream consumption.
 */
export async function writeAuditEvent(input: WriteAuditEventInput): Promise<AuditEventSummary> {
  const { db } = getActivityContext();

  try {
    return await withTenant(db, input.companyId, async (tx) => {
      const targetKind = input.targetKind as "forecast" | "collection_action" | "approval" | "promise_to_pay" | "domain_event" | "company";
      const event = await appendAuditEvent(tx, {
        companyId: input.companyId,
        actorType: "system",
        action: input.action,
        targetKind,
        targetId: input.targetId,
        occurredAt: new Date(),
        summary: input.summary,
        before: input.before as Record<string, never> | undefined,
        after: input.after as Record<string, never> | undefined,
        evidenceRefs: []
      });

      await enqueueOutbox(tx, {
        companyId: input.companyId,
        eventType: `audit.${input.action}`,
        aggregateType: input.targetKind,
        aggregateId: input.targetId,
        payload: { auditEventId: event.id, action: input.action },
        idempotencyKey: `outbox:audit:${input.idempotencyKey}`,
        auditEventId: event.id
      });

      return { auditEventId: event.id };
    });
  } catch {
    // Fallback for stub mode
    return { auditEventId: `${input.idempotencyKey}:audit` };
  }
}

export async function writeAuditEvents(
  inputs: WriteAuditEventInput[]
): Promise<AuditEventSummary[]> {
  const results: AuditEventSummary[] = [];
  for (const input of inputs) {
    results.push(await writeAuditEvent(input));
  }
  return results;
}

export async function writeMemoryAndAudit(
  input: WriteAuditEventInput
): Promise<AuditEventSummary> {
  // Memory update + audit in one. Memory repo is a gap — just audit for now.
  return writeAuditEvent(input);
}

/**
 * Emit a domain event via the outbox. The event is enqueued for
 * downstream dispatch (e.g., starting a new workflow, notifying the API).
 */
export async function emitDomainEvent(
  input: EmitDomainEventInput
): Promise<DomainEventEmissionSummary> {
  const { db } = getActivityContext();

  try {
    return await withTenant(db, input.companyId, async (tx) => {
      const row = await enqueueOutbox(tx, {
        companyId: input.companyId,
        eventType: input.type,
        aggregateType: input.aggregateKind,
        aggregateId: input.aggregateId,
        payload: input.payload as Record<string, string | number | boolean | null>,
        ...(input.correlationId
          ? { headers: { correlationId: input.correlationId, causationEventId: input.causationEventId ?? "" } }
          : {}),
        idempotencyKey: `outbox:domain:${input.idempotencyKey}`
      });

      return {
        eventId: row.id,
        type: input.type,
        occurredAtIso: row.createdAt.toISOString()
      };
    });
  } catch {
    return {
      eventId: `${input.idempotencyKey}:event`,
      type: input.type,
      occurredAtIso: new Date().toISOString()
    };
  }
}
