import { z } from "zod";

import { moneySchema } from "./money.js";

export const idSchema = z.string().trim().min(1);

export const dateSchema = z.coerce
  .date()
  .refine((date) => !Number.isNaN(date.getTime()), "Invalid date");

export const nullableDateSchema = dateSchema.nullable().optional();

export const externalRefSchema = z
  .object({
    provider: z.string().trim().min(1),
    objectType: z.string().trim().min(1),
    objectId: z.string().trim().min(1),
    lastSyncedAt: dateSchema.optional()
  })
  .strict();

export const evidenceKindSchema = z.enum([
  "invoice",
  "payment",
  "bank_transaction",
  "communication_message",
  "promise_to_pay",
  "customer_stat",
  "obligation",
  "policy",
  "forecast",
  "source_object",
  "customer",
  "collection_action",
  "approval",
  "audit_event",
  "domain_event"
]);

export const evidenceRefSchema = z
  .object({
    kind: evidenceKindSchema,
    id: idSchema,
    summary: z.string().trim().min(1).optional(),
    sourceProvider: z.string().trim().min(1).optional(),
    sourceTimestamp: dateSchema.optional()
  })
  .strict();

export const evidenceRefsSchema = z.array(evidenceRefSchema);

export const requiredEvidenceRefsSchema = evidenceRefsSchema.min(1);

export const confidenceScoreSchema = z.number().min(0).max(1);

export const nonNegativeScoreSchema = z.number().min(0);

export const nonNegativeMoneySchema = moneySchema.refine(
  (value) => value.amountMinor >= 0n,
  "Money amount must be non-negative"
);

export const positiveMoneySchema = moneySchema.refine(
  (value) => value.amountMinor > 0n,
  "Money amount must be positive"
);

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema)
  ])
);

export const jsonRecordSchema = z.record(jsonValueSchema);

export type ExternalRef = z.infer<typeof externalRefSchema>;
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
