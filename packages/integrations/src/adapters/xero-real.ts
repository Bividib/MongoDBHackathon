/**
 * Real Xero adapter against the public Accounting API. Fetch-based,
 * no SDK, mirrors the `XeroSimulatedAdapter` contract field-for-field
 * so callers can switch between them without code changes — pick which
 * one the factory returns based on `integration_connections` state.
 *
 * Auth: OAuth2 access token in `Authorization: Bearer ...`. Multi-org
 * tenants must also send `Xero-Tenant-Id`. Token refresh is the
 * factory's responsibility (this adapter assumes a fresh token).
 *
 * Pagination: Xero returns up to 100 rows per page. We walk pages until
 * the response is short (< page size) or `limit` is reached. No backoff
 * here — the factory wraps in a retry policy if needed.
 */
import type { JsonValue } from "@runwayops/domain";

import type {
  AccountingProvider,
  ListOptions,
  ProviderConnection,
  RawContact,
  RawInvoice,
  RawPayment,
} from "../provider.js";
import {
  applyListOptions,
  asObject,
  projectContact,
  projectInvoice,
  projectPayment,
} from "./xero-projection.js";

const XERO_API_BASE_URL = "https://api.xero.com/api.xro/2.0";
const PAGE_SIZE = 100;

export interface XeroRealAdapterOptions {
  /** OAuth2 access token. Caller must refresh before passing in. */
  accessToken: string;
  /** Xero tenant id, set on `connection.externalAccountId`. */
  tenantId: string;
  /** Override the API base URL. Tests inject a fake. */
  baseUrl?: string;
  /** Injected fetch — used by tests. */
  fetchImpl?: typeof fetch;
}

export class XeroRealAdapter implements AccountingProvider {
  readonly providerKey = "xero" as const;

  private readonly accessToken: string;
  private readonly tenantId: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: XeroRealAdapterOptions) {
    if (!opts.accessToken || opts.accessToken.trim().length === 0) {
      throw new Error("XeroRealAdapter: accessToken is required");
    }
    if (!opts.tenantId || opts.tenantId.trim().length === 0) {
      throw new Error("XeroRealAdapter: tenantId is required");
    }
    this.accessToken = opts.accessToken;
    this.tenantId = opts.tenantId;
    this.baseUrl = opts.baseUrl ?? XERO_API_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async listContacts(
    connection: ProviderConnection,
    opts?: ListOptions,
  ): Promise<RawContact[]> {
    this.assertProvider(connection);
    const rows = await this.paginate("Contacts", "Contacts", opts);
    const projected = rows.map((row, idx) => projectContact(row, idx));
    return applyListOptions(projected, opts);
  }

  async listInvoices(
    connection: ProviderConnection,
    opts?: ListOptions,
  ): Promise<RawInvoice[]> {
    this.assertProvider(connection);
    const rows = await this.paginate("Invoices", "Invoices", opts);
    const projected = rows.map((row, idx) => projectInvoice(row, idx));
    return applyListOptions(projected, opts);
  }

  async listPayments(
    connection: ProviderConnection,
    opts?: ListOptions,
  ): Promise<RawPayment[]> {
    this.assertProvider(connection);
    const rows = await this.paginate("Payments", "Payments", opts);
    const projected = rows.map((row, idx) => projectPayment(row, idx));
    return applyListOptions(projected, opts);
  }

  /**
   * Walk paginated `/<resource>` until either the page count is short
   * or `opts.limit` is reached. Xero returns the resource list under a
   * top-level key matching the resource name (e.g. `Invoices`). We
   * pass `If-Modified-Since` when `opts.modifiedSince` is set —
   * Xero respects RFC1123-formatted dates on this header.
   */
  private async paginate(
    resourcePath: string,
    listKey: string,
    opts?: ListOptions,
  ): Promise<JsonValue[]> {
    const out: JsonValue[] = [];
    let page = 1;

    while (true) {
      const url = new URL(`${this.baseUrl}/${resourcePath}`);
      url.searchParams.set("page", String(page));

      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.accessToken}`,
        "Xero-Tenant-Id": this.tenantId,
        Accept: "application/json",
      };
      if (opts?.modifiedSince) {
        headers["If-Modified-Since"] = opts.modifiedSince.toUTCString();
      }

      const response = await this.fetchImpl(url.toString(), { headers });

      // 304 Not Modified is the "no new rows" path, not an error.
      if (response.status === 304) break;

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Xero API error ${response.status} on ${resourcePath} page ${page}: ${text.slice(0, 500)}`,
        );
      }

      const body = (await response.json()) as Record<string, JsonValue>;
      const rawRows = body[listKey];
      if (!Array.isArray(rawRows)) {
        throw new Error(
          `Xero API ${resourcePath}: expected array under key '${listKey}', got ${typeof rawRows}`,
        );
      }
      const rows = rawRows as JsonValue[];

      // Validate each row is an object before adding.
      rows.forEach((row, idx) => asObject(row, `${resourcePath}[page=${page},i=${idx}]`));
      out.push(...rows);

      if (rows.length < PAGE_SIZE) break;
      if (typeof opts?.limit === "number" && out.length >= opts.limit) break;
      page += 1;
    }

    return out;
  }

  private assertProvider(connection: ProviderConnection): void {
    if (connection.providerKey !== "xero") {
      throw new Error(
        `XeroRealAdapter: connection.providerKey must be "xero", got ${connection.providerKey}`,
      );
    }
  }
}
