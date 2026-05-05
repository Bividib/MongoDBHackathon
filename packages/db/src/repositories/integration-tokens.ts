import { and, eq } from "drizzle-orm";

import { integrationTokens } from "../schema/sync.js";
import type { DbHandle } from "./tenant.js";

export type IntegrationTokenRow = typeof integrationTokens.$inferSelect;

export type IntegrationTokenType = "access" | "refresh";

export interface UpsertIntegrationTokenInput {
  companyId: string;
  connectionId: string;
  tokenType: IntegrationTokenType;
  /** Plaintext token. Persisted as-is until a KMS layer lands. */
  token: string;
  /** ISO timestamp. Optional for refresh tokens (Xero's never expire). */
  expiresAt?: Date;
}

export interface IntegrationTokenView {
  tokenType: IntegrationTokenType;
  token: string;
  expiresAt: Date | null;
  rotatedAt: Date | null;
}

/**
 * Sentinel `key_id` for tokens stored in plaintext. The schema requires
 * a `key_id` because the long-term plan is per-token KMS encryption,
 * but Round 5+ ships plaintext. Tagging every plaintext row with this
 * key id makes the migration to encrypted-at-rest a flippable boolean
 * instead of a guessing exercise.
 *
 * SECURITY: this is a development-only path. Do NOT enable real Xero
 * OAuth in production until the KMS path lands and migrates these rows.
 */
const PLAINTEXT_KEY_ID = "dev-plaintext-v0";

/**
 * Upsert an access or refresh token for a connection. Per the
 * `integration_tokens_connection_type_unique` index there is at most
 * one row per (connection, type), so an UPDATE-or-INSERT is the right
 * idempotent shape — the caller doesn't have to know whether this is
 * the first persistence or a refresh rotation.
 *
 * Sets `rotated_at` whenever the token is replaced so callers can audit
 * "when did we last rotate this".
 */
export async function upsertIntegrationToken(
  handle: DbHandle,
  input: UpsertIntegrationTokenInput,
): Promise<void> {
  const now = new Date();
  await handle
    .insert(integrationTokens)
    .values({
      companyId: input.companyId,
      connectionId: input.connectionId,
      tokenType: input.tokenType,
      encryptedToken: input.token,
      keyId: PLAINTEXT_KEY_ID,
      expiresAt: input.expiresAt ?? null,
      rotatedAt: now,
    })
    .onConflictDoUpdate({
      target: [integrationTokens.connectionId, integrationTokens.tokenType],
      set: {
        encryptedToken: input.token,
        keyId: PLAINTEXT_KEY_ID,
        expiresAt: input.expiresAt ?? null,
        rotatedAt: now,
      },
    });
}

export async function getIntegrationToken(
  handle: DbHandle,
  input: { companyId: string; connectionId: string; tokenType: IntegrationTokenType },
): Promise<IntegrationTokenView | null> {
  const rows = await handle
    .select()
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.companyId, input.companyId),
        eq(integrationTokens.connectionId, input.connectionId),
        eq(integrationTokens.tokenType, input.tokenType),
      ),
    )
    .limit(1);

  if (rows.length !== 1) return null;
  const row = rows[0]!;

  // SECURITY: until KMS lands, only the plaintext key id is supported.
  // Reject other key ids loudly so a half-migrated row doesn't get
  // returned as a usable token.
  if (row.keyId !== PLAINTEXT_KEY_ID) {
    throw new Error(
      `getIntegrationToken: row uses unsupported keyId '${row.keyId}'. KMS path not yet implemented.`,
    );
  }

  return {
    tokenType: row.tokenType as IntegrationTokenType,
    token: row.encryptedToken,
    expiresAt: row.expiresAt ?? null,
    rotatedAt: row.rotatedAt ?? null,
  };
}

/**
 * Convenience pair-fetch — almost every Xero call needs both tokens
 * together so the OAuth refresher can decide whether to rotate.
 */
export async function getIntegrationTokenPair(
  handle: DbHandle,
  input: { companyId: string; connectionId: string },
): Promise<{ access: IntegrationTokenView | null; refresh: IntegrationTokenView | null }> {
  const [access, refresh] = await Promise.all([
    getIntegrationToken(handle, { ...input, tokenType: "access" }),
    getIntegrationToken(handle, { ...input, tokenType: "refresh" }),
  ]);
  return { access, refresh };
}
