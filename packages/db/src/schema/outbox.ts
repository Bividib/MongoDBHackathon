import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { auditEvents } from "./audit.js";
import { createdAt, id, jsonObject, updatedAt } from "./common.js";
import { companies } from "./identity.js";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payloadJson: jsonObject("payload_json"),
    headersJson: jsonObject("headers_json"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    lastError: text("last_error"),
    auditEventId: uuid("audit_event_id").references(() => auditEvents.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("outbox_events_idempotency_key_unique").on(table.idempotencyKey),
    index("outbox_events_status_available_at_idx").on(table.status, table.availableAt),
    index("outbox_events_company_aggregate_idx").on(
      table.companyId,
      table.aggregateType,
      table.aggregateId,
    ),
    check("outbox_events_attempts_nonnegative", sql`${table.attempts} >= 0`),
  ],
);
