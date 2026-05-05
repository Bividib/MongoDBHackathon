import { z } from "zod";

import {
  dateSchema,
  evidenceRefsSchema,
  idSchema,
  positiveMoneySchema
} from "./common.js";

export const paymentProviderStatusSchema = z.enum([
  "pending",
  "posted",
  "settled",
  "failed",
  "reversed",
  "unknown"
]);

export const paymentSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    customerId: idSchema,
    invoiceId: idSchema.optional(),
    sourceObjectId: idSchema.optional(),
    bankTransactionId: idSchema.optional(),
    paymentDate: dateSchema,
    amount: positiveMoneySchema,
    providerStatus: paymentProviderStatusSchema,
    evidenceRefs: evidenceRefsSchema.default([]),
    createdAt: dateSchema,
    updatedAt: dateSchema
  })
  .strict();

export type PaymentProviderStatus = z.infer<typeof paymentProviderStatusSchema>;
export type Payment = z.infer<typeof paymentSchema>;
