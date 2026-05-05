import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  createdAt,
  currency,
  deletedAt,
  id,
  jsonObject,
  moneyMinor,
  nullableMoneyMinor,
  updatedAt,
} from "./common.js";
import { companies } from "./identity.js";
import { invoices } from "./invoices.js";
import { sourceObjects } from "./source.js";
import { integrationConnections } from "./sync.js";

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => integrationConnections.id, {
      onDelete: "set null",
    }),
    sourceObjectId: uuid("source_object_id").references(() => sourceObjects.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    accountName: text("account_name").notNull(),
    institutionName: text("institution_name"),
    accountType: text("account_type").notNull().default("business_current"),
    currency: currency(),
    currentBalanceMinor: nullableMoneyMinor("current_balance_minor"),
    availableBalanceMinor: nullableMoneyMinor("available_balance_minor"),
    balanceAsOf: timestamp("balance_as_of", { withTimezone: true }),
    consentExpiresAt: timestamp("consent_expires_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    externalRefs: jsonObject("external_refs"),
  },
  (table) => [
    index("bank_accounts_company_status_idx").on(table.companyId, table.status),
    index("bank_accounts_company_provider_idx").on(table.companyId, table.provider),
  ],
);

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    sourceObjectId: uuid("source_object_id").references(() => sourceObjects.id, {
      onDelete: "set null",
    }),
    providerTransactionId: text("provider_transaction_id").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    bookingDate: date("booking_date", { mode: "string" }),
    valueDate: date("value_date", { mode: "string" }),
    direction: text("direction").notNull(),
    amountMinor: moneyMinor("amount_minor"),
    currency: currency(),
    description: text("description").notNull(),
    counterpartyName: text("counterparty_name"),
    counterpartyAccountRef: text("counterparty_account_ref"),
    runningBalanceMinor: nullableMoneyMinor("running_balance_minor"),
    status: text("status").notNull().default("posted"),
    matchedInvoiceId: uuid("matched_invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    matchConfidence: text("match_confidence"),
    rawCategory: text("raw_category"),
  },
  (table) => [
    uniqueIndex("bank_transactions_provider_transaction_unique").on(
      table.bankAccountId,
      table.providerTransactionId,
    ),
    index("bank_transactions_company_posted_at_idx").on(table.companyId, table.postedAt),
    index("bank_transactions_company_direction_idx").on(table.companyId, table.direction),
    check("bank_transactions_amount_nonnegative", sql`${table.amountMinor} >= 0`),
    check("bank_transactions_direction_check", sql`${table.direction} in ('credit', 'debit')`),
  ],
);
