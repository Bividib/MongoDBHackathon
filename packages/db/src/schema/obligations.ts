import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import {
  createdAt,
  currency,
  deletedAt,
  id,
  jsonObject,
  moneyMinor,
  updatedAt,
} from "./common.js";
import { companies } from "./identity.js";
import { sourceObjects } from "./source.js";

export const criticalObligations = pgTable(
  "critical_obligations",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sourceObjectId: uuid("source_object_id").references(() => sourceObjects.id, {
      onDelete: "set null",
    }),
    obligationType: text("obligation_type").notNull(),
    counterpartyName: text("counterparty_name").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    amountMinor: moneyMinor("amount_minor"),
    currency: currency(),
    criticality: text("criticality").notNull(),
    recurrenceRule: text("recurrence_rule"),
    manualOrSource: text("manual_or_source").notNull(),
    status: text("status").notNull().default("open"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    metadataJson: jsonObject("metadata_json"),
    notes: text("notes"),
  },
  (table) => [
    index("critical_obligations_company_due_date_idx").on(table.companyId, table.dueDate),
    index("critical_obligations_company_status_idx").on(table.companyId, table.status),
    check("critical_obligations_amount_nonnegative", sql`${table.amountMinor} >= 0`),
    check(
      "critical_obligations_manual_or_source_check",
      sql`${table.manualOrSource} in ('manual', 'source')`,
    ),
  ],
);
