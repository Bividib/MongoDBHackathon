/**
 * Typed HTTP client for the RunwayOps API.
 *
 * Demo mode (Phase 6): the web app does not yet have OAuth or sessions.
 * Tenancy is asserted by attaching the `x-runway-demo-company-id` header
 * to every request. The API's tenancy middleware accepts it as a tenant
 * hint when present; in production the gateway will swap this for a
 * verified session and the demo header will be ignored.
 *
 * The kill-switch env var WEB_DEMO_MODE controls whether the demo header
 * is sent at all. It defaults to true in development and false in
 * production builds — this file inspects it once at module load. A
 * production build must explicitly opt in (or wait for Phase 7+ auth).
 */
import type {
  WireApprovalRequest,
  WireCashForecast,
  WireCollectionAction,
} from "./api-types";

const DEMO_HEADER = "x-runway-demo-company-id";
const DEMO_COMPANY_ID =
  process.env.RUNWAY_DEMO_COMPANY_ID ?? "comp-meridian-001";

const WEB_DEMO_MODE = parseBool(process.env.WEB_DEMO_MODE);
const API_BASE_URL = process.env.RUNWAY_API_URL ?? "http://127.0.0.1:3001";

function parseBool(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") {
    return process.env.NODE_ENV !== "production";
  }
  return raw.toLowerCase() === "true" || raw === "1";
}

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; statusCode: number } };

export type ApiClientOptions = {
  baseUrl?: string;
  demoMode?: boolean;
  demoCompanyId?: string;
  /** Override fetch — primarily for tests. */
  fetchImpl?: typeof fetch;
};

export class ApiClient {
  private readonly baseUrl: string;
  private readonly demoMode: boolean;
  private readonly demoCompanyId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? API_BASE_URL;
    this.demoMode = opts.demoMode ?? WEB_DEMO_MODE;
    this.demoCompanyId = opts.demoCompanyId ?? DEMO_COMPANY_ID;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  isDemoMode(): boolean {
    return this.demoMode;
  }

  async getLatestForecast(): Promise<WireCashForecast | null> {
    const env = await this.get<WireCashForecast>("/v1/forecasts/latest");
    if (!env.ok) {
      if (env.error.statusCode === 404) return null;
      throw new ApiError(env.error.code, env.error.message, env.error.statusCode);
    }
    return env.data;
  }

  async listActions(status: string): Promise<WireCollectionAction[]> {
    const env = await this.get<WireCollectionAction[]>(
      `/v1/actions?status=${encodeURIComponent(status)}`,
    );
    if (!env.ok) {
      throw new ApiError(env.error.code, env.error.message, env.error.statusCode);
    }
    return env.data;
  }

  async listPendingApprovals(): Promise<WireApprovalRequest[]> {
    const env = await this.get<WireApprovalRequest[]>(
      "/v1/approvals?status=pending",
    );
    if (!env.ok) {
      throw new ApiError(env.error.code, env.error.message, env.error.statusCode);
    }
    return env.data;
  }

  private async get<T>(path: string): Promise<ApiEnvelope<T>> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.headers(),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (body && typeof body === "object" && "ok" in body) {
      return body;
    }
    return {
      ok: false,
      error: {
        code: "BAD_RESPONSE",
        message: `Non-envelope response from ${path}`,
        statusCode: res.status,
      },
    };
  }

  private headers(): Record<string, string> {
    const out: Record<string, string> = { accept: "application/json" };
    if (this.demoMode) {
      out[DEMO_HEADER] = this.demoCompanyId;
    }
    return out;
  }
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

let _shared: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (_shared === null) {
    _shared = new ApiClient();
  }
  return _shared;
}
