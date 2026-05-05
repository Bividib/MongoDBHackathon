import { z } from "zod";

import { dateSchema, idSchema, nullableDateSchema } from "./common.js";
import { currencyCodeSchema } from "./money.js";

export const companyStatusSchema = z.enum(["active", "suspended", "archived"]);

export const companySchema = z
  .object({
    id: idSchema,
    displayName: z.string().trim().min(1),
    legalName: z.string().trim().min(1).optional(),
    baseCurrency: currencyCodeSchema,
    countryCode: z.string().trim().length(2).toUpperCase().optional(),
    timezone: z.string().trim().min(1),
    status: companyStatusSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema,
    deletedAt: nullableDateSchema
  })
  .strict();

export type CompanyStatus = z.infer<typeof companyStatusSchema>;
export type Company = z.infer<typeof companySchema>;
