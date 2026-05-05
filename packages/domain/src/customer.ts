import { z } from "zod";

import {
  dateSchema,
  externalRefSchema,
  idSchema,
  nullableDateSchema
} from "./common.js";

export const relationshipTierSchema = z.enum([
  "strategic",
  "standard",
  "watch",
  "low_touch",
  "sensitive"
]);

export const customerStatusSchema = z.enum(["active", "paused", "archived"]);

export const customerSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    displayName: z.string().trim().min(1),
    legalName: z.string().trim().min(1).optional(),
    externalRefs: z.array(externalRefSchema).default([]),
    relationshipTier: relationshipTierSchema,
    defaultContactId: idSchema.optional(),
    status: customerStatusSchema,
    notes: z.string().trim().min(1).optional(),
    createdAt: dateSchema,
    updatedAt: dateSchema,
    deletedAt: nullableDateSchema
  })
  .strict();

export type RelationshipTier = z.infer<typeof relationshipTierSchema>;
export type CustomerStatus = z.infer<typeof customerStatusSchema>;
export type Customer = z.infer<typeof customerSchema>;
