import { z } from "zod";

import {
  dateSchema,
  evidenceRefsSchema,
  idSchema,
  positiveMoneySchema
} from "./common.js";

export const obligationTypeSchema = z.enum([
  "payroll",
  "tax",
  "rent",
  "loan",
  "supplier",
  "contractor",
  "other"
]);

export const obligationCriticalitySchema = z.enum(["low", "medium", "high", "critical"]);

export const obligationSourceSchema = z.enum(["manual", "source"]);

export const obligationStatusSchema = z.enum([
  "scheduled",
  "due",
  "paid",
  "deferred",
  "cancelled",
  "overdue"
]);

export const obligationSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    obligationType: obligationTypeSchema,
    counterpartyName: z.string().trim().min(1),
    dueDate: dateSchema,
    amount: positiveMoneySchema,
    criticality: obligationCriticalitySchema,
    recurrenceRule: z.string().trim().min(1).optional(),
    manualOrSource: obligationSourceSchema,
    status: obligationStatusSchema,
    evidenceRefs: evidenceRefsSchema.default([]),
    createdAt: dateSchema,
    updatedAt: dateSchema
  })
  .strict();

export type ObligationType = z.infer<typeof obligationTypeSchema>;
export type ObligationCriticality = z.infer<typeof obligationCriticalitySchema>;
export type ObligationSource = z.infer<typeof obligationSourceSchema>;
export type ObligationStatus = z.infer<typeof obligationStatusSchema>;
export type Obligation = z.infer<typeof obligationSchema>;
