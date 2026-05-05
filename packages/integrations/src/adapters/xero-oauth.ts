/**
 * Xero OAuth2 token endpoint helpers. Authorization-code grant is the
 * only flow Xero supports for accounting scopes — PKCE is recommended
 * but not required for confidential server-side clients.
 *
 * This module is transport-only:
 *   - `exchangeAuthCodeForTokens(code, redirectUri, ...)` swaps the code
 *     received at the OAuth callback for an access + refresh token.
 *   - `refreshAccessToken(refreshToken, ...)` rotates the access token.
 *     Xero rotates the refresh token on every refresh — callers MUST
 *     persist whichever value comes back.
 *
 * The HTTP UI layer (consent redirect, callback handler) is the API's
 * concern, not this module's.
 */

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";

export interface XeroTokenResponse {
  /** OAuth2 access token; ~30 minutes lifetime per Xero docs. */
  accessToken: string;
  /** Rotated on every call — Xero invalidates the prior refresh token. */
  refreshToken: string;
  /** Seconds until access-token expiry, as reported by Xero. */
  expiresInSeconds: number;
  /** Scopes granted; surface to the operator on connection display. */
  scope: string;
  /** "Bearer" — pinned for sanity; we throw on anything else. */
  tokenType: string;
}

export interface XeroOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  tokenUrl?: string;
}

interface RawTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeAuthCodeForTokens(
  config: XeroOAuthClientConfig,
  input: { code: string; redirectUri: string },
): Promise<XeroTokenResponse> {
  return postToken(config, {
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  });
}

export async function refreshAccessToken(
  config: XeroOAuthClientConfig,
  input: { refreshToken: string },
): Promise<XeroTokenResponse> {
  return postToken(config, {
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
}

async function postToken(
  config: XeroOAuthClientConfig,
  form: Record<string, string>,
): Promise<XeroTokenResponse> {
  const tokenUrl = config.tokenUrl ?? XERO_TOKEN_URL;
  const fetchImpl = config.fetchImpl ?? fetch;
  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  const response = await fetchImpl(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(form).toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Xero token endpoint error ${response.status}: ${text.slice(0, 500)}`,
    );
  }

  const json = (await response.json()) as RawTokenResponse;
  if (json.token_type?.toLowerCase() !== "bearer") {
    throw new Error(`Xero token_type expected "Bearer", got ${json.token_type}`);
  }
  if (typeof json.access_token !== "string" || json.access_token.length === 0) {
    throw new Error("Xero token response missing access_token");
  }
  if (typeof json.refresh_token !== "string" || json.refresh_token.length === 0) {
    throw new Error("Xero token response missing refresh_token");
  }
  if (typeof json.expires_in !== "number" || json.expires_in <= 0) {
    throw new Error("Xero token response missing or invalid expires_in");
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresInSeconds: json.expires_in,
    scope: json.scope ?? "",
    tokenType: json.token_type,
  };
}
