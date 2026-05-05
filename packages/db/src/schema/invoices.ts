import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, currency, deletedAt, id, moneyMinor, updatedAt } from "./common.js";
import { customers } from "./customers.js";
import { companies } from "./identity.js";
import { sourceObjects } from "./source.js";

export const invoices = pgTable(
  "invoices",
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
      .references(() => customers.id, { onDelete: "restrict" }),
    sourceObjectId: uuid("source_object_id").references(() => sourceObjects.id, {
      onDelete: "set null",
    }),
    invoiceNumber: text("invoice_number").notNull(),
    issueDate: date("issue_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    status: text("status").notNull(),
    amountTotalMinor: moneyMinor("amount_total_minor"),
    amountDueMinor: moneyMinor("amount_due_minor"),
    amountPaidMinor: moneyMinor("amount_paid_minor"),
    currency: currency(),
    lastSourceUpdatedAt: timestamp("last_source_updated_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("invoices_company_invoice_number_unique").on(
      table.companyId,
      table.invoiceNumber,
    ),
    index("invoices_company_customer_idx").on(table.companyId, table.customerId),
    index("invoices_company_due_date_idx").on(table.companyId, table.dueDate),
    index("invoices_company_status_idx").on(table.companyId, table.status),
    check("invoices_amount_total_nonnegative", sql`${table.amountTotalMinor} >= 0`),
    check("invoices_amount_due_nonnegative", sql`${table.amountDueMinor} >= 0`),
    check("invoices_amount_paid_nonnegative", sql`${table.amountPaidMinor} >= 0`),
  ],
);

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    sourceObjectId: uuid("source_object_id").references(() => sourceObjects.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull().default("1"),
    unitAmountMinor: moneyMinor("unit_amount_minor"),
    amountMinor: moneyMinor("amount_minor"),
    currency: currency(),
    taxRate: numeric("tax_rate", { precision: 6, scale: 4 }),
    accountCode: text("account_code"),
  },
  (table) => [
    index("invoice_line_items_company_invoice_idx").on(table.companyId, table.invoiceId),
    check("invoice_line_items_amount_nonnegative", sql`${table.amountMinor} >= 0`),
  ],
);
