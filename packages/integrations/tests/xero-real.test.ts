import { describe, expect, it, vi } from "vitest";

import { XeroRealAdapter } from "../src/adapters/xero-real.js";
import type { ProviderConnection } from "../src/provider.js";

/**
 * Pin the wire contract: URL, headers, pagination loop, error
 * mapping, and the shape coming out of the projection layer. Real
 * HTTP is never made — fetch is injected.
 */

const CONNECTION: ProviderConnection = {
  companyId: "10000000-0000-4000-8000-000000000001",
  providerKey: "xero",
  externalAccountId: "tenant-abc",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SAMPLE_INVOICE = {
  InvoiceID: "xero-inv-1",
  InvoiceNumber: "RO-0001",
  Type: "ACCREC",
  Status: "AUTHORISED",
  Contact: { ContactID: "xero-contact-1" },
  Date: "2026-04-01",
  DueDate: "2026-05-01",
  Total: 1850.0,
  AmountDue: 1850.0,
  AmountPaid: 0.0,
  CurrencyCode: "GBP",
  UpdatedDateUTC: "2026-04-15T08:30:00Z",
};

describe("XeroRealAdapter", () => {
  it("requires accessToken and tenantId", () => {
    expect(() => new XeroRealAdapter({ accessToken: "", tenantId: "t" })).toThrow(
      /accessToken is required/,
    );
    expect(() => new XeroRealAdapter({ accessToken: "tok", tenantId: "" })).toThrow(
      /tenantId is required/,
    );
  });

  it("calls /Invoices with bearer auth + tenant header + Accept JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ Invoices: [SAMPLE_INVOICE] }),
    );
    const adapter = new XeroRealAdapter({
      accessToken: "tok-123",
      tenantId: "tenant-abc",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const out = await adapter.listInvoices(CONNECTION);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/Invoices");
    expect(url).toContain("page=1");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok-123");
    expect(headers["Xero-Tenant-Id"]).toBe("tenant-abc");
    expect(headers["Accept"]).toBe("application/json");
    expect(out).toHaveLength(1);
    expect(out[0]?.invoiceNumber).toBe("RO-0001");
    expect(out[0]?.amountTotalMinor).toBe("185000");
  });

  it("attaches If-Modified-Since when modifiedSince is set", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ Invoices: [] }));
    const adapter = new XeroRealAdapter({
      accessToken: "tok",
      tenantId: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await adapter.listInvoices(CONNECTION, { modifiedSince: new Date("2026-04-01T00:00:00Z") });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["If-Modified-Since"]).toBeDefined();
    expect(headers["If-Modified-Since"]).toMatch(/2026/);
  });

  it("treats 304 Not Modified as 'no rows', not an error", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 304 }));
    const adapter = new XeroRealAdapter({
      accessToken: "tok",
      tenantId: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = await adapter.listInvoices(CONNECTION, { modifiedSince: new Date() });
    expect(out).toEqual([]);
  });

  it("paginates until a short page is returned", async () => {
    // Page 1 = 100 rows, Page 2 = 50 rows → loop terminates after page 2.
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      ...SAMPLE_INVOICE,
      InvoiceID: `xero-inv-${i + 1}`,
      InvoiceNumber: `RO-${1000 + i}`,
    }));
    const shortPage = fullPage.slice(0, 50).map((r, i) => ({
      ...r,
      InvoiceID: `xero-inv-${i + 101}`,
      InvoiceNumber: `RO-${1100 + i}`,
    }));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ Invoices: fullPage }))
      .mockResolvedValueOnce(jsonResponse({ Invoices: shortPage }));
    const adapter = new XeroRealAdapter({
      accessToken: "tok",
      tenantId: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = await adapter.listInvoices(CONNECTION);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(150);
  });

  it("stops paginating once `limit` is reached", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      ...SAMPLE_INVOICE,
      InvoiceID: `xero-inv-${i + 1}`,
      InvoiceNumber: `RO-${1000 + i}`,
    }));
    const fetchImpl = vi.fn(async () => jsonResponse({ Invoices: fullPage }));
    const adapter = new XeroRealAdapter({
      accessToken: "tok",
      tenantId: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = await adapter.listInvoices(CONNECTION, { limit: 50 });
    // limit is applied at the projection layer (applyListOptions),
    // but pagination stops as soon as we have `limit` raw rows.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(50);
  });

  it("throws on non-2xx with the body excerpt", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("unauthorized", { status: 401 }),
    );
    const adapter = new XeroRealAdapter({
      accessToken: "tok",
      tenantId: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(adapter.listInvoices(CONNECTION)).rejects.toThrow(/Xero API error 401/);
  });

  it("rejects connections with a non-xero providerKey", async () => {
    const fetchImpl = vi.fn();
    const adapter = new XeroRealAdapter({
      accessToken: "tok",
      tenantId: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      adapter.listInvoices({ ...CONNECTION, providerKey: "quickbooks" }),
    ).rejects.toThrow(/providerKey must be "xero"/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
