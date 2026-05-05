import { describe, expect, it, vi } from "vitest";

import {
  exchangeAuthCodeForTokens,
  refreshAccessToken,
} from "../src/adapters/xero-oauth.js";

/**
 * The OAuth helpers must:
 *   - Use Basic auth with base64(clientId:clientSecret) — Xero rejects
 *     anything else for confidential clients.
 *   - POST x-www-form-urlencoded to /connect/token.
 *   - Surface refresh-token rotation faithfully (Xero invalidates the
 *     old refresh token on every call).
 *   - Reject malformed responses LOUDLY rather than silently returning
 *     empty strings — a misformed response means the connection is
 *     broken, and that should fail the activity, not silently store
 *     blanks.
 */

const TOKEN_URL = "https://identity.xero.test/connect/token";

function tokenResponse(overrides: Partial<Record<string, unknown>> = {}): Response {
  return new Response(
    JSON.stringify({
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_in: 1800,
      scope: "accounting.transactions.read",
      token_type: "Bearer",
      ...overrides,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("Xero OAuth helpers", () => {
  it("exchangeAuthCodeForTokens posts grant_type=authorization_code with Basic auth", async () => {
    const fetchImpl = vi.fn(async () => tokenResponse());
    await exchangeAuthCodeForTokens(
      {
        clientId: "client-id",
        clientSecret: "client-secret",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        tokenUrl: TOKEN_URL,
      },
      { code: "auth-code", redirectUri: "https://app.test/oauth/callback" },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TOKEN_URL);
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const expectedAuth = "Basic " + Buffer.from("client-id:client-secret").toString("base64");
    expect(headers["Authorization"]).toBe(expectedAuth);

    const body = init.body as string;
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=auth-code");
    expect(body).toContain("redirect_uri=");
  });

  it("refreshAccessToken posts grant_type=refresh_token and returns rotated tokens", async () => {
    const fetchImpl = vi.fn(async () =>
      tokenResponse({ access_token: "at-2", refresh_token: "rt-2" }),
    );
    const tokens = await refreshAccessToken(
      {
        clientId: "client-id",
        clientSecret: "client-secret",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        tokenUrl: TOKEN_URL,
      },
      { refreshToken: "rt-1" },
    );
    expect(tokens.accessToken).toBe("at-2");
    expect(tokens.refreshToken).toBe("rt-2");
    expect(tokens.expiresInSeconds).toBe(1800);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toContain("grant_type=refresh_token");
    expect(init.body).toContain("refresh_token=rt-1");
  });

  it("throws on non-2xx with the body excerpt", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("invalid_grant", { status: 400 }),
    );
    await expect(
      refreshAccessToken(
        {
          clientId: "id",
          clientSecret: "secret",
          fetchImpl: fetchImpl as unknown as typeof fetch,
          tokenUrl: TOKEN_URL,
        },
        { refreshToken: "rt" },
      ),
    ).rejects.toThrow(/Xero token endpoint error 400/);
  });

  it("rejects responses missing access_token", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "",
          refresh_token: "rt",
          expires_in: 100,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(
      refreshAccessToken(
        {
          clientId: "id",
          clientSecret: "secret",
          fetchImpl: fetchImpl as unknown as typeof fetch,
          tokenUrl: TOKEN_URL,
        },
        { refreshToken: "rt" },
      ),
    ).rejects.toThrow(/missing access_token/);
  });

  it("rejects token_type other than Bearer", async () => {
    const fetchImpl = vi.fn(async () =>
      tokenResponse({ token_type: "Mac" }),
    );
    await expect(
      refreshAccessToken(
        {
          clientId: "id",
          clientSecret: "secret",
          fetchImpl: fetchImpl as unknown as typeof fetch,
          tokenUrl: TOKEN_URL,
        },
        { refreshToken: "rt" },
      ),
    ).rejects.toThrow(/expected "Bearer"/);
  });
});
