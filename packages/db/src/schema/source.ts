import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, jsonValue, updatedAt } from "./common.js";
import { companies } from "./identity.js";

export const sourceObjects = pgTable(
  "source_objects",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerObjectType: text("provider_object_type").notNull(),
    providerObjectId: text("provider_object_id").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    rawPayload: jsonValue("raw_payload"),
    rawPayloadHash: text("raw_payload_hash").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("source_objects_provider_identity_unique").on(
      table.companyId,
      table.provider,
      table.providerObjectType,
      table.providerObjectId,
    ),
    uniqueIndex("source_objects_company_provider_payload_hash_unique").on(
      table.companyId,
      table.provider,
      table.rawPayloadHash,
    ),
    index("source_objects_company_provider_idx").on(table.companyId, table.provider),
  ],
);
