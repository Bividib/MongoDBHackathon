import { z } from "zod";

import {
  confidenceScoreSchema,
  dateSchema,
  idSchema,
  positiveMoneySchema,
  requiredEvidenceRefsSchema
} from "./common.js";

export const promiseTypeSchema = z.enum([
  "firm",
  "conditional",
  "vague",
  "partial",
  "disputed",
  "cannot_pay",
  "already_paid_claim"
]);

export const promiseOutcomeSchema = z.enum([
  "pending",
  "kept",
  "partially_kept",
  "late",
  "broken",
  "superseded",
  "disputed"
]);

export const promiseCreatedBySchema = z.enum(["ai", "human"]);

export const promiseToPaySchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    customerId: idSchema,
    invoiceId: idSchema.optional(),
    sourceMessageId: idSchema.optional(),
    amountPromised: positiveMoneySchema.optional(),
    promisedDate: dateSchema.optional(),
    promiseType: promiseTypeSchema,
    conditionText: z.string().trim().min(1).optional(),
    extractedText: z.string().trim().min(1),
    confidenceAtCreation: confidenceScoreSchema,
    evidenceRefs: requiredEvidenceRefsSchema,
    outcome: promiseOutcomeSchema,
    actualPaymentDate: dateSchema.optional(),
    actualAmountReceived: positiveMoneySchema.optional(),
    createdBy: promiseCreatedBySchema,
    approvedByUserId: idSchema.optional(),
    createdAt: dateSchema,
    updatedAt: dateSchema
  })
  .strict()
  .refine(
    (promise) =>
      !promise.amountPromised ||
      !promise.actualAmountReceived ||
      promise.amountPromised.currency === promise.actualAmountReceived.currency,
    {
      message: "Promised and actual payment amounts must use the same currency",
      path: ["actualAmountReceived", "currency"]
    }
  )
  .refine(
    (promise) => promise.promiseType !== "conditional" || Boolean(promise.conditionText),
    {
      message: "Conditional promises require condition text",
      path: ["conditionText"]
    }
  );

export type PromiseType = z.infer<typeof promiseTypeSchema>;
export type PromiseOutcome = z.infer<typeof promiseOutcomeSchema>;
export type PromiseCreatedBy = z.infer<typeof promiseCreatedBySchema>;
export type PromiseToPay = z.infer<typeof promiseToPaySchema>;
