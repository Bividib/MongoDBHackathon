import { z } from "zod";

import { dateSchema, evidenceRefsSchema, idSchema } from "./common.js";
import { moneySchema } from "./money.js";

export const bankTransactionTypeSchema = z.enum(["credit", "debit"]);

export const bankTransactionStatusSchema = z.enum(["pending", "posted", "reversed"]);

export const bankTransactionSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    bankAccountId: idSchema.optional(),
    sourceObjectId: idSchema.optional(),
    postedAt: dateSchema,
    valueDate: dateSchema.optional(),
    type: bankTransactionTypeSchema,
    status: bankTransactionStatusSchema,
    amount: moneySchema,
    counterpartyName: z.string().trim().min(1).optional(),
    reference: z.string().trim().min(1).optional(),
    matchedPaymentIds: z.array(idSchema).default([]),
    evidenceRefs: evidenceRefsSchema.default([]),
    createdAt: dateSchema,
    updatedAt: dateSchema
  })
  .strict()
  .refine(
    (transaction) =>
      transaction.type === "credit"
        ? transaction.amount.amountMinor > 0n
        : transaction.amount.amountMinor < 0n,
    {
      message: "Bank transaction amount sign must match transaction type",
      path: ["amount", "amountMinor"]
    }
  );

export type BankTransactionType = z.infer<typeof bankTransactionTypeSchema>;
export type BankTransactionStatus = z.infer<typeof bankTransactionStatusSchema>;
export type BankTransaction = z.infer<typeof bankTransactionSchema>;
