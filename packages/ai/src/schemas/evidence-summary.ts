import { z } from "zod";
import { BaseModelOutputSchema, EvidenceRefSchema } from "./common.js";

export const EvidenceSummaryInputSchema = z.object({
  task: z.string().min(1),
  evidence_refs: z.array(EvidenceRefSchema).min(1),
  question: z.string().min(1).optional(),
});

export const EvidenceSummarySchema = BaseModelOutputSchema.extend({
  classification: z.enum(["evidence_summary"]),
  summary: z.string().min(1),
  missing_evidence: z.array(z.string()).default([]),
});

export type EvidenceSummaryInput = z.infer<typeof EvidenceSummaryInputSchema>;
export type EvidenceSummary = z.infer<typeof EvidenceSummarySchema>;
