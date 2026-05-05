import { boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, deletedAt, id, jsonObject, updatedAt } from "./common.js";
import { companies } from "./identity.js";
import { sourceObjects } from "./source.js";

export const customers = pgTable(
  "customers",
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
    displayName: text("display_name").notNull(),
    legalName: text("legal_name"),
    externalRefs: jsonObject("external_refs"),
    relationshipTier: text("relationship_tier").notNull().default("standard"),
    defaultContactId: uuid("default_contact_id"),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
  },
  (table) => [
    index("customers_company_status_idx").on(table.companyId, table.status),
    index("customers_company_relationship_tier_idx").on(table.companyId, table.relationshipTier),
  ],
);

export const customerContacts = pgTable(
  "customer_contacts",
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
    sourceObjectId: uuid("source_object_id").references(() => sourceObjects.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    roleTitle: text("role_title"),
    isPrimary: boolean("is_primary").notNull().default(false),
    status: text("status").notNull().default("active"),
  },
  (table) => [
    index("customer_contacts_company_customer_idx").on(table.companyId, table.customerId),
    uniqueIndex("customer_contacts_customer_email_unique").on(table.customerId, table.email),
  ],
);
