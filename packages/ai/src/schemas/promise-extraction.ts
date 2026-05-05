import { promiseTypeSchema } from "@runwayops/domain";
import { z } from "zod";
import {
  BaseModelOutputSchema,
  EvidenceRefSchema,
  InvoiceContextSchema,
  MinorUnitAmountSchema
} from "./common.js";
import { ReplyClassificationEnumSchema } from "./reply-classification.js";

export const PromiseTypeSchema = promiseTypeSchema;

export const PromiseExtractionInputSchema = z.object({
  customer_reply: z.string().min(1),
  today: z.string().date(),
  reply_classification: ReplyClassificationEnumSchema.optional(),
  evidence_refs: z.array(EvidenceRefSchema).default([]),
  invoice_context: z.array(InvoiceContextSchema).default([]),
});

export const PromiseExtractionSchema = BaseModelOutputSchema.extend({
  classification: z.enum(["promise_extracted", "no_promise", "needs_review"]),
  has_promise: z.boolean(),
  promise_type: PromiseTypeSchema.nullable(),
  amount_promised_minor: MinorUnitAmountSchema.nullable().default(null),
  currency: z.string().length(3).nullable().default(null),
  promised_date: z.string().date().nullable().default(null),
  condition_text: z.string().nullable().default(null),
  payer_contact: z.string().nullable().default(null),
  source_message_id: z.string().nullable().default(null),
  cash_confidence: z.number().min(0).max(1),
});

export type PromiseExtractionInput = z.infer<typeof PromiseExtractionInputSchema>;
export type PromiseExtraction = z.infer<typeof PromiseExtractionSchema>;
export type PromiseType = z.infer<typeof PromiseTypeSchema>;
