import { z } from "zod";
import { BaseModelOutputSchema, EvidenceRefSchema, InvoiceContextSchema } from "./common.js";

export const DraftChannelSchema = z.enum(["email", "sms", "phone_task", "internal_note"]);
export const DraftToneSchema = z.enum(["polite", "direct", "empathetic", "firm", "neutral"]);

export const DraftMessageInputSchema = z.object({
  action_type: z.enum([
    "first_chase",
    "follow_up",
    "promise_confirmation",
    "partial_payment_request",
    "dispute_clarification",
    "already_paid_verification",
  ]),
  customer_name: z.string().min(1),
  company_name: z.string().min(1).optional(),
  channel: DraftChannelSchema.default("email"),
  tone: DraftToneSchema.default("polite"),
  today: z.string().date(),
  latest_untrusted_reply: z.string().optional(),
  company_policy: z.string().optional(),
  invoice_context: z.array(InvoiceContextSchema).default([]),
  evidence_refs: z.array(EvidenceRefSchema).default([]),
});

export const MessageDraftSchema = BaseModelOutputSchema.extend({
  classification: z.enum([
    "customer_chaser_draft",
    "confirmation_request_draft",
    "partial_payment_request_draft",
    "dispute_clarification_draft",
    "payment_verification_draft",
  ]),
  channel: DraftChannelSchema,
  tone: DraftToneSchema,
  subject: z.string().min(1).max(160),
  body: z.string().min(1).max(5000),
  call_to_action: z.string().min(1),
  approval_notes: z.string().nullable().default(null),
});

export type DraftChannel = z.infer<typeof DraftChannelSchema>;
export type DraftMessageInput = z.infer<typeof DraftMessageInputSchema>;
export type DraftTone = z.infer<typeof DraftToneSchema>;
export type MessageDraft = z.infer<typeof MessageDraftSchema>;
