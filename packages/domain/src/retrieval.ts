import { z } from "zod";

import { dateSchema, idSchema, jsonRecordSchema } from "./common.js";

export const retrievalQueryKindSchema = z.enum([
  "customer_memory",
  "evidence",
  "communication_history",
  "policy",
  "forecast",
  "audit",
  "source_object",
]);

export const retrievalAttemptSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    requestId: idSchema,
    queryKind: retrievalQueryKindSchema,
    queryText: z.string().min(1),
    params: jsonRecordSchema.default({}),
    resultIds: z.array(idSchema).default([]),
    resultCount: z.number().int().min(0),
    latencyMs: z.number().min(0),
    success: z.boolean(),
    errorMessage: z.string().trim().min(1).optional(),
    modelUsed: z.string().trim().min(1).optional(),
    invokedByActorType: z.enum(["system", "user", "ai", "workflow"]),
    invokedByActorId: idSchema.optional(),
    createdAt: dateSchema,
  })
  .strict();

export type RetrievalQueryKind = z.infer<typeof retrievalQueryKindSchema>;
export type RetrievalAttempt = z.infer<typeof retrievalAttemptSchema>;
