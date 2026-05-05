/**
 * Build a configured `XeroRealAdapter` for a given connection: load
 * tokens, refresh if expired, persist rotated tokens, return adapter.
 *
 * This is the integration point between `@runwayops/db`'s token storage
 * and the Xero adapter — the API/workers ask for "give me an adapter
 * I can use right now" and the factory handles freshness internals.
 *
 * Refresh policy: if `expiresAt` is null OR within `EXPIRY_BUFFER_MS`
 * of now, refresh. Xero rotates the refresh token on every call, so
 * the new refresh token MUST be persisted alongside the new access
 * token — both upserts happen before the adapter is returned.
 */
import type { repositories } from "@runwayops/db";

import {
  refreshAccessToken,
  type XeroOAuthClientConfig,
} from "./xero-oauth.js";
import { XeroRealAdapter } from "./xero-real.js";

type DbHandle = repositories.DbHandle;

/** Refresh when the access token has less than this much life left. */
const EXPIRY_BUFFER_MS = 60_000; // 1 minute

export interface BuildXeroAdapterInput {
  companyId: string;
  connectionId: string;
  tenantId: string;
  /** OAuth client config — clientId/Secret for the refresh path. */
  oauth: XeroOAuthClientConfig;
  /** Override the API base URL (tests). */
  apiBaseUrl?: string;
  /** Override the Xero API fetch (tests). */
  apiFetchImpl?: typeof fetch;
  /** Inject `now` for deterministic expiry comparisons in tests. */
  now?: () => Date;
}

/**
 * Subset of the `@runwayops/db` repositories surface this factory uses.
 * Declared as an interface so tests can pass an in-memory stub without
 * pulling drizzle/pg into the test process.
 */
export interface IntegrationTokenStore {
  getIntegrationTokenPair(
    handle: DbHandle,
    input: { companyId: string; connectionId: string },
  ): Promise<{
    access: { token: string; expiresAt: Date | null } | null;
    refresh: { token: string; expiresAt: Date | null } | null;
  }>;
  upsertIntegrationToken(
    handle: DbHandle,
    input: {
      companyId: string;
      connectionId: string;
      tokenType: "access" | "refresh";
      token: string;
      expiresAt?: Date;
    },
  ): Promise<void>;
}

export async function buildXeroAdapterForConnection(
  handle: DbHandle,
  store: IntegrationTokenStore,
  input: BuildXeroAdapterInput,
): Promise<XeroRealAdapter> {
  const now = (input.now ?? (() => new Date()))();

  const pair = await store.getIntegrationTokenPair(handle, {
    companyId: input.companyId,
    connectionId: input.connectionId,
  });

  if (!pair.refresh) {
    throw new Error(
      `buildXeroAdapterForConnection: no refresh token persisted for connection ${input.connectionId}. The connection must complete OAuth first.`,
    );
  }

  const accessExpiresInMs = pair.access?.expiresAt
    ? pair.access.expiresAt.getTime() - now.getTime()
    : -Infinity;
  const needsRefresh = !pair.access || accessExpiresInMs < EXPIRY_BUFFER_MS;

  let accessToken: string;
  if (needsRefresh) {
    const tokens = await refreshAccessToken(input.oauth, {
      refreshToken: pair.refresh.token,
    });
    const expiresAt = new Date(now.getTime() + tokens.expiresInSeconds * 1000);
    // Xero rotates the refresh token on every call — persist BOTH
    // before any subsequent call, so a crash between updates can't
    // leave us holding the old refresh token (which Xero has
    // invalidated).
    await store.upsertIntegrationToken(handle, {
      companyId: input.companyId,
      connectionId: input.connectionId,
      tokenType: "refresh",
      token: tokens.refreshToken,
    });
    await store.upsertIntegrationToken(handle, {
      companyId: input.companyId,
      connectionId: input.connectionId,
      tokenType: "access",
      token: tokens.accessToken,
      expiresAt,
    });
    accessToken = tokens.accessToken;
  } else {
    accessToken = pair.access!.token;
  }

  const adapterOpts: ConstructorParameters<typeof XeroRealAdapter>[0] = {
    accessToken,
    tenantId: input.tenantId,
  };
  if (input.apiBaseUrl !== undefined) adapterOpts.baseUrl = input.apiBaseUrl;
  if (input.apiFetchImpl !== undefined) adapterOpts.fetchImpl = input.apiFetchImpl;
  return new XeroRealAdapter(adapterOpts);
}
