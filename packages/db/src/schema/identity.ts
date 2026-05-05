import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, currency, deletedAt, id, jsonObject, updatedAt } from "./common.js";

export const companies = pgTable(
  "companies",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    displayName: text("display_name").notNull(),
    legalName: text("legal_name"),
    slug: text("slug").notNull(),
    baseCurrency: currency("base_currency").default("GBP"),
    countryCode: text("country_code").notNull().default("GB"),
    timezone: text("timezone").notNull().default("Europe/London"),
    status: text("status").notNull().default("active"),
    settingsJson: jsonObject("settings_json"),
  },
  (table) => [
    uniqueIndex("companies_slug_unique").on(table.slug),
    index("companies_status_idx").on(table.status),
  ],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    authProvider: text("auth_provider"),
    authProviderUserId: text("auth_provider_user_id"),
    status: text("status").notNull().default("active"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_auth_provider_subject_unique").on(
      table.authProvider,
      table.authProviderUserId,
    ),
    index("users_status_idx").on(table.status),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    status: text("status").notNull().default("active"),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("memberships_company_user_unique").on(table.companyId, table.userId),
    index("memberships_company_role_idx").on(table.companyId, table.role),
    check(
      "memberships_role_check",
      sql`${table.role} in ('owner', 'admin', 'finance_manager', 'bookkeeper', 'approver', 'viewer')`,
    ),
  ],
);

export const companyPolicies = pgTable(
  "company_policies",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    policyKey: text("policy_key").notNull(),
    policyJson: jsonObject("policy_json"),
    status: text("status").notNull().default("active"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    requiresFounderApproval: boolean("requires_founder_approval").notNull().default(false),
  },
  (table) => [
    uniqueIndex("company_policies_company_key_unique").on(table.companyId, table.policyKey),
    index("company_policies_company_status_idx").on(table.companyId, table.status),
  ],
);
