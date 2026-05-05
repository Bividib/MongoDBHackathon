import { evidenceKindSchema } from "@runwayops/domain";
import { z } from "zod";

export const EvidenceRefSchema = z
  .object({
    kind: evidenceKindSchema,
    id: z.string().min(1),
    summary: z.string().min(1).optional(),
    sourceProvider: z.string().min(1).optional(),
    sourceTimestamp: z.coerce.date().optional(),
  })
  .strict();

export const RecommendedActionSchema = z.enum([
  "record_promise",
  "request_confirmation",
  "request_partial_payment",
  "verify_payment",
  "mark_disputed_for_review",
  "escalate_for_review",
  "draft_follow_up",
  "no_action",
]);

export const SafetyFlagSchema = z.enum([
  "none",
  "prompt_injection",
  "sensitive_action_request",
  "policy_override_request",
  "legal_threat_request",
  "payment_initiation_request",
  "payroll_safety_claim",
  "data_access_request",
  "untrusted_instruction",
  "authority_spoofing",
  "urgency_manipulation",
  "tool_impersonation",
  "encoded_payload",
  "obligation_safety_claim",
  "legal_advice_emitted",
  "tax_advice_emitted",
]);

export const MinorUnitAmountSchema = z
  .union([
    z.string().regex(/^\d+$/),
    z.number().int().nonnegative().safe().transform((value) => value.toString()),
  ]);

export const BaseModelOutputSchema = z.object({
  confidence: z.number().min(0).max(1),
  evidence_refs: z.array(EvidenceRefSchema).default([]),
  recommended_action: RecommendedActionSchema,
  requires_approval: z.boolean(),
  risk_reason: z.string().min(1),
  uncertainty_reason: z.string().min(1),
  safety_flags: z.array(SafetyFlagSchema).default([]),
});

export const InvoiceContextSchema = z.object({
  invoice_id: z.string().min(1),
  invoice_number: z.string().min(1).optional(),
  amount_due_minor: MinorUnitAmountSchema.optional(),
  currency: z.string().length(3).optional(),
  due_date: z.string().date().optional(),
  customer_name: z.string().min(1).optional(),
});

export const PromptMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type InvoiceContext = z.infer<typeof InvoiceContextSchema>;
export type PromptMessage = z.infer<typeof PromptMessageSchema>;
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;
export type SafetyFlag = z.infer<typeof SafetyFlagSchema>;
