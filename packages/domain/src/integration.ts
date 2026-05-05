import { z } from "zod";

import {
  dateSchema,
  idSchema,
  jsonRecordSchema,
  nullableDateSchema,
} from "./common.js";

export const integrationProviderSchema = z.enum([
  "xero",
  "quickbooks",
  "gocardless",
  "truelayer",
  "yapily",
  "stripe",
  "gmail",
  "outlook",
  "manual",
]);

export const integrationConnectionStatusSchema = z.enum([
  "pending_consent",
  "connected",
  "disconnected",
  "expired",
  "error",
]);

export const integrationConnectionSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    provider: integrationProviderSchema,
    displayName: z.string().trim().min(1),
    status: integrationConnectionStatusSchema,
    scopes: z.array(z.string().trim().min(1)).default([]),
    externalAccountId: z.string().trim().min(1).optional(),
    connectedById: idSchema,
    connectedAt: dateSchema,
    consentExpiresAt: nullableDateSchema,
    lastSuccessfulSyncAt: nullableDateSchema,
    lastFailedSyncAt: nullableDateSchema,
    lastError: z.string().trim().min(1).optional(),
    createdAt: dateSchema,
    updatedAt: dateSchema,
    metadata: jsonRecordSchema.optional(),
  })
  .strict();

export const integrationHealthStatusSchema = z.enum([
  "healthy",
  "degraded",
  "stale",
  "broken",
  "disconnected",
]);

export const integrationStalenessSchema = z.enum([
  "fresh",
  "stale",
  "very_stale",
  "unknown",
]);

export const integrationHealthSchema = z
  .object({
    connectionId: idSchema,
    companyId: idSchema,
    provider: integrationProviderSchema,
    status: integrationHealthStatusSchema,
    staleness: integrationStalenessSchema,
    lastSyncAt: nullableDateSchema,
    ageHours: z.number().min(0).optional(),
    recentErrorCount: z.number().int().min(0).default(0),
    lastError: z.string().trim().min(1).optional(),
    nextScheduledSyncAt: nullableDateSchema,
    evaluatedAt: dateSchema,
  })
  .strict();

export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;
export type IntegrationConnectionStatus = z.infer<typeof integrationConnectionStatusSchema>;
export type IntegrationConnection = z.infer<typeof integrationConnectionSchema>;
export type IntegrationHealthStatus = z.infer<typeof integrationHealthStatusSchema>;
export type IntegrationStaleness = z.infer<typeof integrationStalenessSchema>;
export type IntegrationHealth = z.infer<typeof integrationHealthSchema>;
