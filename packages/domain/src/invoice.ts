import { z } from "zod";

import {
  dateSchema,
  evidenceRefsSchema,
  idSchema,
  nonNegativeMoneySchema
} from "./common.js";

export const invoiceStatusSchema = z.enum([
  "draft",
  "sent",
  "authorised",
  "overdue",
  "partially_paid",
  "paid",
  "disputed",
  "void",
  "written_off"
]);

export const invoiceLineItemSchema = z
  .object({
    id: idSchema,
    invoiceId: idSchema,
    description: z.string().trim().min(1),
    quantity: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    unitAmount: nonNegativeMoneySchema.optional(),
    lineAmount: nonNegativeMoneySchema
  })
  .strict();

export const invoiceSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    customerId: idSchema,
    sourceObjectId: idSchema.optional(),
    invoiceNumber: z.string().trim().min(1),
    issueDate: dateSchema,
    dueDate: dateSchema,
    status: invoiceStatusSchema,
    amountDue: nonNegativeMoneySchema,
    amountPaid: nonNegativeMoneySchema,
    lineItems: z.array(invoiceLineItemSchema).default([]),
    lastSourceUpdatedAt: dateSchema.optional(),
    evidenceRefs: evidenceRefsSchema.default([]),
    createdAt: dateSchema,
    updatedAt: dateSchema
  })
  .strict()
  .refine((invoice) => invoice.amountDue.currency === invoice.amountPaid.currency, {
    message: "Invoice due and paid amounts must use the same currency",
    path: ["amountPaid", "currency"]
  })
  .refine((invoice) => invoice.dueDate >= invoice.issueDate, {
    message: "Invoice due date must be on or after issue date",
    path: ["dueDate"]
  });

export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
