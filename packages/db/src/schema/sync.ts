import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, id, jsonObject, nullableJsonObject, updatedAt } from "./common.js";
import { companies, users } from "./identity.js";

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    displayName: text("display_name"),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    grantedScopes: text("granted_scopes").array(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    consentExpiresAt: timestamp("consent_expires_at", { withTimezone: true }),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
    lastFailedSyncAt: timestamp("last_failed_sync_at", { withTimezone: true }),
    reconnectRequired: boolean("reconnect_required").notNull().default(false),
    metadataJson: jsonObject("metadata_json"),
  },
  (table) => [
    index("integration_connections_company_provider_idx").on(table.companyId, table.provider),
    index("integration_connections_company_provider_last_sync_idx").on(
      table.companyId,
      table.provider,
      table.lastSuccessfulSyncAt,
    ),
    index("integration_connections_company_status_idx").on(table.companyId, table.status),
  ],
);

export const integrationTokens = pgTable(
  "integration_tokens",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    tokenType: text("token_type").notNull(),
    encryptedToken: text("encrypted_token").notNull(),
    keyId: text("key_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("integration_tokens_connection_type_unique").on(
      table.connectionId,
      table.tokenType,
    ),
  ],
);

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => integrationConnections.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    syncType: text("sync_type").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    cursorBefore: text("cursor_before"),
    cursorAfter: text("cursor_after"),
    recordsProcessed: integer("records_processed").notNull().default(0),
    errorMessage: text("error_message"),
    errorJson: nullableJsonObject("error_json"),
  },
  (table) => [
    index("sync_jobs_company_provider_status_idx").on(
      table.companyId,
      table.provider,
      table.status,
    ),
    check("sync_jobs_records_processed_nonnegative", sql`${table.recordsProcessed} >= 0`),
  ],
);

export const syncCursors = pgTable(
  "sync_cursors",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    resourceType: text("resource_type").notNull(),
    cursorValue: text("cursor_value"),
    cursorVersion: integer("cursor_version").notNull().default(1),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("sync_cursors_connection_resource_unique").on(
      table.connectionId,
      table.resourceType,
    ),
    index("sync_cursors_company_provider_idx").on(table.companyId, table.provider),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => integrationConnections.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    status: text("status").notNull().default("received"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    payloadJson: jsonObject("payload_json"),
    payloadHash: text("payload_hash").notNull(),
  },
  (table) => [
    uniqueIndex("webhook_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    index("webhook_events_company_status_idx").on(table.companyId, table.status),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseJson: nullableJsonObject("response_json"),
    statusCode: integer("status_code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_company_scope_key_unique").on(
      table.companyId,
      table.scope,
      table.key,
    ),
    index("idempotency_keys_expires_at_idx").on(table.expiresAt),
  ],
);
