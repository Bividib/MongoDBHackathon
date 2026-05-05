import { z } from "zod";

import {
  dateSchema,
  evidenceRefsSchema,
  idSchema,
  jsonRecordSchema
} from "./common.js";

export const domainEventTypeSchema = z.enum([
  "invoice.created",
  "invoice.updated",
  "invoice.paid",
  "payment.received",
  "bank_transaction.posted",
  "customer_reply.received",
  "promise.created",
  "promise.updated",
  "promise.due",
  "promise.outcome_classified",
  "obligation.created",
  "obligation.updated",
  "obligation.due_soon",
  "forecast.generated",
  "collection_action.created",
  "approval.requested",
  "approval.granted",
  "approval.rejected",
  "approval.edited",
  "message_draft.created",
  "external_message.sent",
  "integration.sync_started",
  "integration.sync_completed",
  "integration.sync_failed"
]);

export const domainEventAggregateKindSchema = z.enum([
  "invoice",
  "payment",
  "bank_transaction",
  "customer_reply",
  "promise_to_pay",
  "obligation",
  "forecast",
  "collection_action",
  "approval",
  "message_draft",
  "external_message",
  "integration"
]);

export const domainEventSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    type: domainEventTypeSchema,
    occurredAt: dateSchema,
    aggregateKind: domainEventAggregateKindSchema,
    aggregateId: idSchema,
    payload: jsonRecordSchema.default({}),
    evidenceRefs: evidenceRefsSchema.default([]),
    idempotencyKey: idSchema.optional(),
    correlationId: idSchema.optional(),
    causationEventId: idSchema.optional()
  })
  .strict();

export type DomainEventType = z.infer<typeof domainEventTypeSchema>;
export type DomainEventAggregateKind = z.infer<typeof domainEventAggregateKindSchema>;
export type DomainEvent = z.infer<typeof domainEventSchema>;
