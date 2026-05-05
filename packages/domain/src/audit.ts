import { z } from "zod";

import {
  dateSchema,
  evidenceRefsSchema,
  idSchema,
  jsonRecordSchema
} from "./common.js";

export const auditActorTypeSchema = z.enum([
  "system",
  "user",
  "ai",
  "integration",
  "workflow"
]);

export const auditTargetKindSchema = z.enum([
  "company",
  "customer",
  "invoice",
  "payment",
  "bank_transaction",
  "obligation",
  "promise_to_pay",
  "forecast",
  "collection_action",
  "approval",
  "message_draft",
  "integration",
  "domain_event"
]);

export const auditEventSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    actorType: auditActorTypeSchema,
    actorId: idSchema.optional(),
    action: z.string().trim().min(1),
    targetKind: auditTargetKindSchema,
    targetId: idSchema,
    occurredAt: dateSchema,
    summary: z.string().trim().min(1),
    before: jsonRecordSchema.optional(),
    after: jsonRecordSchema.optional(),
    evidenceRefs: evidenceRefsSchema.default([]),
    correlationId: idSchema.optional(),
    causationEventId: idSchema.optional()
  })
  .strict();

export type AuditActorType = z.infer<typeof auditActorTypeSchema>;
export type AuditTargetKind = z.infer<typeof auditTargetKindSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
