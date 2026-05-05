import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { bankTransactions } from "./bank.js";
import { createdAt, currency, deletedAt, id, moneyMinor, updatedAt } from "./common.js";
import { customers } from "./customers.js";
import { companies } from "./identity.js";
import { invoices } from "./invoices.js";
import { sourceObjects } from "./source.js";

export const payments = pgTable(
  "payments",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    sourceObjectId: uuid("source_object_id").references(() => sourceObjects.id, {
      onDelete: "set null",
    }),
    bankTransactionId: uuid("bank_transaction_id").references(() => bankTransactions.id, {
      onDelete: "set null",
    }),
    paymentDate: date("payment_date", { mode: "string" }).notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    amountMinor: moneyMinor("amount_minor"),
    currency: currency(),
    providerStatus: text("provider_status").notNull(),
    paymentMethod: text("payment_method"),
    reference: text("reference"),
  },
  (table) => [
    index("payments_company_customer_idx").on(table.companyId, table.customerId),
    index("payments_company_invoice_idx").on(table.companyId, table.invoiceId),
    index("payments_company_payment_date_idx").on(table.companyId, table.paymentDate),
    check("payments_amount_nonnegative", sql`${table.amountMinor} >= 0`),
  ],
);
