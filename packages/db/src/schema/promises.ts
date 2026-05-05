import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { communicationMessages } from "./communications.js";
import {
  confidence,
  createdAt,
  currency,
  deletedAt,
  evidenceRefs,
  id,
  nullableMoneyMinor,
  updatedAt,
} from "./common.js";
import { customers } from "./customers.js";
import { companies, users } from "./identity.js";
import { invoices } from "./invoices.js";
import { payments } from "./payments.js";

export const promiseToPayRecords = pgTable(
  "promise_to_pay_records",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    sourceMessageId: uuid("source_message_id").references(() => communicationMessages.id, {
      onDelete: "set null",
    }),
    amountPromisedMinor: nullableMoneyMinor("amount_promised_minor"),
    currency: currency().default("GBP"),
    promisedDate: date("promised_date", { mode: "string" }),
    promiseType: text("promise_type").notNull(),
    conditionText: text("condition_text"),
    extractedText: text("extracted_text").notNull(),
    confidenceAtCreation: confidence("confidence_at_creation"),
    evidenceRefs: evidenceRefs(),
    outcome: text("outcome").notNull().default("pending"),
    actualPaymentDate: date("actual_payment_date", { mode: "string" }),
    actualAmountReceivedMinor: nullableMoneyMinor("actual_amount_received_minor"),
    actualPaymentId: uuid("actual_payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by").notNull(),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("promise_to_pay_records_company_customer_idx").on(table.companyId, table.customerId),
    index("promise_to_pay_records_company_promised_date_idx").on(
      table.companyId,
      table.promisedDate,
    ),
    index("promise_to_pay_records_company_outcome_idx").on(table.companyId, table.outcome),
    check(
      "promise_to_pay_records_confidence_range",
      sql`${table.confidenceAtCreation} >= 0 and ${table.confidenceAtCreation} <= 1`,
    ),
    check(
      "promise_to_pay_records_promise_type_check",
      sql`${table.promiseType} in ('firm', 'conditional', 'vague', 'partial', 'disputed', 'cannot_pay', 'already_paid_claim')`,
    ),
    check(
      "promise_to_pay_records_outcome_check",
      sql`${table.outcome} in ('pending', 'kept', 'partially_kept', 'late', 'broken', 'superseded', 'disputed')`,
    ),
    check("promise_to_pay_records_created_by_check", sql`${table.createdBy} in ('ai', 'human')`),
  ],
);
