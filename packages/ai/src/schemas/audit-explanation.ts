import { z } from "zod";
import { BaseModelOutputSchema, EvidenceRefSchema } from "./common.js";

export const AuditInputSchema = z.object({
  event_name: z.string().min(1),
  model_output_id: z.string().optional(),
  decision: z.string().min(1),
  evidence_refs: z.array(EvidenceRefSchema).default([]),
  policy_checks: z.array(z.string()).default([]),
});

export const AuditExplanationSchema = BaseModelOutputSchema.extend({
  classification: z.enum(["audit_explanation"]),
  explanation: z.string().min(1),
  audit_summary: z.string().min(1),
});

export type AuditInput = z.infer<typeof AuditInputSchema>;
export type AuditExplanation = z.infer<typeof AuditExplanationSchema>;
