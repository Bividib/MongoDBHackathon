import { z } from "zod";

import {
  dateSchema,
  idSchema,
  jsonRecordSchema,
  nullableDateSchema,
} from "./common.js";

export const policyKindSchema = z.enum([
  "collection",
  "approval",
  "escalation",
  "communication",
  "obligation_safety",
  "data_retention",
]);

export const policyRuleKindSchema = z.enum([
  "approval_required",
  "amount_threshold",
  "tone_constraint",
  "channel_constraint",
  "escalation_trigger",
  "blocked_phrase",
  "evidence_requirement",
  "actor_role_required",
  "frequency_cap",
  "custom",
]);

export const policyRuleSchema = z
  .object({
    id: idSchema,
    ruleKind: policyRuleKindSchema,
    description: z.string().trim().min(1),
    predicate: jsonRecordSchema.default({}),
    action: jsonRecordSchema.default({}),
    priority: z.number().int().min(0).default(100),
    enabled: z.boolean().default(true),
  })
  .strict();

export const companyPolicySchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    name: z.string().trim().min(1),
    kind: policyKindSchema,
    description: z.string().trim().min(1).optional(),
    rules: z.array(policyRuleSchema),
    effectiveFrom: dateSchema,
    effectiveUntil: nullableDateSchema,
    createdById: idSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema,
    metadata: jsonRecordSchema.optional(),
  })
  .strict();

export type PolicyKind = z.infer<typeof policyKindSchema>;
export type PolicyRuleKind = z.infer<typeof policyRuleKindSchema>;
export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type CompanyPolicy = z.infer<typeof companyPolicySchema>;
