import { z } from "zod";
import { BaseModelOutputSchema, EvidenceRefSchema, InvoiceContextSchema } from "./common.js";

export const ActionRecommendationInputSchema = z.object({
  objective: z.string().min(1),
  today: z.string().date(),
  customer_name: z.string().min(1).optional(),
  cash_engine_summary: z.string().min(1).optional(),
  company_policy: z.string().optional(),
  invoice_context: z.array(InvoiceContextSchema).default([]),
  evidence_refs: z.array(EvidenceRefSchema).default([]),
});

export const ActionRecommendationSchema = BaseModelOutputSchema.extend({
  classification: z.enum(["action_recommendation"]),
  rationale: z.string().min(1),
  next_step: z.string().min(1),
});

export type ActionRecommendationInput = z.infer<typeof ActionRecommendationInputSchema>;
export type ActionRecommendation = z.infer<typeof ActionRecommendationSchema>;
