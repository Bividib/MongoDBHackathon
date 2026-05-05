import { z } from "zod";

import { dateSchema, idSchema, jsonRecordSchema } from "./common.js";

/**
 * Raw provider payload retained for audit and replay. Identified by
 * (provider, objectType, objectId) and deduplicated by content hash so a
 * second sync of the same payload is a no-op. Spec §15.2.
 */
export const sourceObjectSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    provider: z.string().trim().min(1),
    objectType: z.string().trim().min(1),
    objectId: z.string().trim().min(1),
    contentHash: z.string().trim().length(64),
    payload: jsonRecordSchema,
    payloadUri: z.string().trim().min(1).optional(),
    retrievedAt: dateSchema,
    createdAt: dateSchema,
  })
  .strict();

export type SourceObject = z.infer<typeof sourceObjectSchema>;
