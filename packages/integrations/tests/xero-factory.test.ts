import { describe, expect, it, vi } from "vitest";

import { buildXeroAdapterForConnection } from "../src/adapters/xero-factory.js";
import { XeroRealAdapter } from "../src/adapters/xero-real.js";
import type {
  IntegrationTokenStore,
} from "../src/adapters/xero-factory.js";

/**
 * The factory's contract: load tokens, decide whether to refresh,
 * persist rotated tokens BEFORE returning the adapter, hand back a
 * usable adapter. The hairy parts are:
 *   - "no refresh token" → caller hasn't completed OAuth → throw.
 *   - "access token expired" → refresh, persist BOTH new tokens,
 *     return adapter with the new access token.
 *   - "access token still fresh" → no refresh call.
 */

const COMPANY_ID = "10000000-0000-4000-8000-000000000001";
const CONNECTION_ID = "11111111-2222-4000-8000-000000000001";
const TENANT_ID = "tenant-abc";
const NOW = new Date("2026-05-05T12:00:00Z");

interface StoreState {
  access: { token: string; expiresAt: Date | null } | null;
  refresh: { token: string; expiresAt: Date | null } | null;
}

function buildStore(initial: StoreState): IntegrationTokenStore & { state: StoreState } {
  const state = { ...initial };
  return {
    state,
    async getIntegrationTokenPair() {
      return state;
    },
    async upsertIntegrationToken(_h, input) {
      const view = {
        token: input.token,
        expiresAt: input.expiresAt ?? null,
      };
      if (input.tokenType === "access") state.access = view;
      else state.refresh = view;
    },
  };
}

const HANDLE = {} as never;

function tokenResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return new Response(
    JSON.stringify({
      access_token: "at-new",
      refresh_token: "rt-new",
      expires_in: 1800,
      scope: "accounting.transactions.read",
      token_type: "Bearer",
      ...overrides,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("buildXeroAdapterForConnection", () => {
  it("throws if no refresh token has been persisted (OAuth never completed)", async () => {
    const store = buildStore({ access: null, refresh: null });
    const oauthFetch = vi.fn();
    await expect(
      buildXeroAdapterForConnection(HANDLE, store, {
        companyId: COMPANY_ID,
        connectionId: CONNECTION_ID,
        tenantId: TENANT_ID,
        oauth: {
          clientId: "id",
          clientSecret: "secret",
          fetchImpl: oauthFetch as unknown as typeof fetch,
          tokenUrl: "https://x.test/token",
        },
        now: () => NOW,
      }),
    ).rejects.toThrow(/no refresh token persisted/);
    expect(oauthFetch).not.toHaveBeenCalled();
  });

  it("refreshes when access token is missing, persists rotated tokens, returns adapter", async () => {
    const store = buildStore({
      access: null,
      refresh: { token: "rt-old", expiresAt: null },
    });
    const oauthFetch = vi.fn(async () => tokenResponse());
    const adapter = await buildXeroAdapterForConnection(HANDLE, store, {
      companyId: COMPANY_ID,
      connectionId: CONNECTION_ID,
      tenantId: TENANT_ID,
      oauth: {
        clientId: "id",
        clientSecret: "secret",
        fetchImpl: oauthFetch as unknown as typeof fetch,
        tokenUrl: "https://x.test/token",
      },
      now: () => NOW,
    });
    expect(adapter).toBeInstanceOf(XeroRealAdapter);
    expect(oauthFetch).toHaveBeenCalledTimes(1);
    expect(store.state.access?.token).toBe("at-new");
    expect(store.state.refresh?.token).toBe("rt-new");
    // expires_in 1800s → expiresAt = now + 30min.
    expect(store.state.access?.expiresAt?.toISOString()).toBe(
      new Date(NOW.getTime() + 1800 * 1000).toISOString(),
    );
  });

  it("refreshes when access token is within the 1-minute expiry buffer", async () => {
    const expiresInBuffer = new Date(NOW.getTime() + 30_000); // 30s left
    const store = buildStore({
      access: { token: "at-old", expiresAt: expiresInBuffer },
      refresh: { token: "rt-old", expiresAt: null },
    });
    const oauthFetch = vi.fn(async () => tokenResponse());
    await buildXeroAdapterForConnection(HANDLE, store, {
      companyId: COMPANY_ID,
      connectionId: CONNECTION_ID,
      tenantId: TENANT_ID,
      oauth: {
        clientId: "id",
        clientSecret: "secret",
        fetchImpl: oauthFetch as unknown as typeof fetch,
        tokenUrl: "https://x.test/token",
      },
      now: () => NOW,
    });
    expect(oauthFetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT refresh when access token has plenty of life left", async () => {
    const wayInTheFuture = new Date(NOW.getTime() + 10 * 60_000);
    const store = buildStore({
      access: { token: "at-fresh", expiresAt: wayInTheFuture },
      refresh: { token: "rt-old", expiresAt: null },
    });
    const oauthFetch = vi.fn();
    const adapter = await buildXeroAdapterForConnection(HANDLE, store, {
      companyId: COMPANY_ID,
      connectionId: CONNECTION_ID,
      tenantId: TENANT_ID,
      oauth: {
        clientId: "id",
        clientSecret: "secret",
        fetchImpl: oauthFetch as unknown as typeof fetch,
        tokenUrl: "https://x.test/token",
      },
      now: () => NOW,
    });
    expect(adapter).toBeInstanceOf(XeroRealAdapter);
    expect(oauthFetch).not.toHaveBeenCalled();
    expect(store.state.access?.token).toBe("at-fresh");
  });
});
