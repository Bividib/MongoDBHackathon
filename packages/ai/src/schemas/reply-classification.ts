import { z } from "zod";
import {
  BaseModelOutputSchema,
  EvidenceRefSchema,
  InvoiceContextSchema,
  MinorUnitAmountSchema
} from "./common.js";

export const ReplyClassificationEnumSchema = z.enum([
  "firm_promise",
  "conditional_promise",
  "vague_promise",
  "partial_payment_promise",
  "dispute",
  "cannot_pay",
  "already_paid",
  "other",
]);

export const ReplyClassificationInputSchema = z.object({
  customer_reply: z.string().min(1),
  received_at: z.string().datetime().optional(),
  today: z.string().date(),
  company_policy: z.string().optional(),
  evidence_refs: z.array(EvidenceRefSchema).default([]),
  invoice_context: z.array(InvoiceContextSchema).default([]),
});

export const ReplyClassificationSchema = BaseModelOutputSchema.extend({
  classification: ReplyClassificationEnumSchema,
  promised_date: z.string().date().nullable().default(null),
  amount_minor: MinorUnitAmountSchema.nullable().default(null),
  currency: z.string().length(3).nullable().default(null),
  condition_text: z.string().nullable().default(null),
  dispute_reason: z.string().nullable().default(null),
});

export type ReplyClassificationName = z.infer<typeof ReplyClassificationEnumSchema>;
export type ReplyClassificationInput = z.infer<typeof ReplyClassificationInputSchema>;
export type ReplyClassification = z.infer<typeof ReplyClassificationSchema>;
