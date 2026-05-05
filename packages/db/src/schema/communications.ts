import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { createdAt, deletedAt, id, jsonObject, updatedAt } from "./common.js";
import { customers } from "./customers.js";
import { companies } from "./identity.js";
import { sourceObjects } from "./source.js";

export const communicationThreads = pgTable(
  "communication_threads",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    sourceObjectId: uuid("source_object_id").references(() => sourceObjects.id, {
      onDelete: "set null",
    }),
    channel: text("channel").notNull(),
    subject: text("subject"),
    status: text("status").notNull().default("open"),
    externalRefs: jsonObject("external_refs"),
  },
  (table) => [
    index("communication_threads_company_customer_idx").on(table.companyId, table.customerId),
    index("communication_threads_company_status_idx").on(table.companyId, table.status),
  ],
);

export const communicationMessages = pgTable(
  "communication_messages",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => communicationThreads.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    sourceObjectId: uuid("source_object_id").references(() => sourceObjects.id, {
      onDelete: "set null",
    }),
    providerMessageId: text("provider_message_id"),
    direction: text("direction").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    fromAddress: text("from_address"),
    toAddresses: text("to_addresses").array().notNull(),
    subject: text("subject"),
    bodyText: text("body_text").notNull(),
    bodyHash: text("body_hash").notNull(),
    metadataJson: jsonObject("metadata_json"),
  },
  (table) => [
    index("communication_messages_company_thread_idx").on(table.companyId, table.threadId),
    index("communication_messages_company_sent_at_idx").on(table.companyId, table.sentAt),
  ],
);
