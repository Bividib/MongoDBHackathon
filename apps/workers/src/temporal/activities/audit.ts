import type {
  AuditEventSummary,
  DomainEventEmissionSummary,
  EmitDomainEventInput,
  WriteAuditEventInput
} from "./types.js";

export async function writeAuditEvent(input: WriteAuditEventInput): Promise<AuditEventSummary> {
  return { auditEventId: `${input.idempotencyKey}:audit` };
}

export async function writeAuditEvents(
  inputs: WriteAuditEventInput[]
): Promise<AuditEventSummary[]> {
  return Promise.all(inputs.map(writeAuditEvent));
}

export async function writeMemoryAndAudit(
  input: WriteAuditEventInput
): Promise<AuditEventSummary> {
  return writeAuditEvent(input);
}

export async function emitDomainEvent(
  input: EmitDomainEventInput
): Promise<DomainEventEmissionSummary> {
  return {
    eventId: `${input.idempotencyKey}:event`,
    type: input.type,
    occurredAtIso: "2026-05-04T09:00:00.000Z"
  };
}
