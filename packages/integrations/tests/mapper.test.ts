import { describe, expect, it } from "vitest";

import { canonicalJsonStringify, sha256OfJson } from "../src/hash.js";
import {
  mapRawContactToCustomer,
  mapRawContactToSourceObject,
  mapRawInvoiceToInvoice,
  mapRawInvoiceToSourceObject,
  mapRawPaymentToPayment,
  mapRawPaymentToSourceObject,
} from "../src/mapper.js";
import type { RawContact, RawInvoice, RawPayment } from "../src/provider.js";

const COMPANY_ID = "11111111-1111-1111-1111-111111111111";

const baseContact: RawContact = {
  providerObjectId: "xero-contact-1",
  displayName: "Northstar Foods Ltd",
  legalName: "Northstar Foods Limited",
  status: "active",
  email: "ap@northstar.example",
  updatedAt: "2026-05-01T08:30:00Z",
  raw: {
    ContactID: "xero-contact-1",
    Name: "Northstar Foods Ltd",
    ContactStatus: "ACTIVE",
  },
};

const baseInvoice: RawInvoice = {
  providerObjectId: "xero-inv-1001",
  invoiceNumber: "RO-1001",
  issueDate: "2026-04-04",
  dueDate: "2026-05-04",
  status: "authorised",
  amountTotalMinor: "1850000",
  amountDueMinor: "1850000",
  amountPaidMinor: "0",
  currency: "GBP",
  contactProviderObjectId: "xero-contact-1",
  updatedAt: "2026-05-01T08:31:00Z",
  raw: {
    InvoiceID: "xero-inv-1001",
    InvoiceNumber: "RO-1001",
    Total: 18500.0,
    AmountDue: 18500.0,
    AmountPaid: 0.0,
    CurrencyCode: "GBP",
  },
};

const basePayment: RawPayment = {
  providerObjectId: "xero-pay-9001",
  paymentDate: "2026-04-22",
  amountMinor: "250000",
  currency: "GBP",
  providerStatus: "posted",
  invoiceProviderObjectId: "xero-inv-1002",
  reference: "BACS RO-1002 partial",
  updatedAt: "2026-04-22T15:20:00Z",
  raw: {
    PaymentID: "xero-pay-9001",
    Amount: 2500.0,
    CurrencyCode: "GBP",
  },
};

describe("canonicalJsonStringify", () => {
  it("orders object keys lexicographically and preserves array order", () => {
    expect(
      canonicalJsonStringify({ b: 1, a: { y: 2, x: [3, 1, 2] } }),
    ).toBe('{"a":{"x":[3,1,2],"y":2},"b":1}');
  });

  it("hashes payloads with reordered keys identically", () => {
    const a = { Name: "A", ContactID: "x", Status: "ACTIVE" };
    const b = { Status: "ACTIVE", ContactID: "x", Name: "A" };
    expect(sha256OfJson(a)).toBe(sha256OfJson(b));
  });

  it("emits a 64-char hex digest", () => {
    const hash = sha256OfJson({ k: "v" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("mapRawContactToSourceObject", () => {
  it("hashes the verbatim raw payload, not the normalized fields", () => {
    const upsert = mapRawContactToSourceObject(COMPANY_ID, "xero", baseContact);
    expect(upsert.contentHash).toBe(sha256OfJson(baseContact.raw));
    expect(upsert.companyId).toBe(COMPANY_ID);
    expect(upsert.provider).toBe("xero");
    expect(upsert.providerObjectType).toBe("contact");
    expect(upsert.providerObjectId).toBe("xero-contact-1");
    expect(upsert.rawPayload).toEqual(baseContact.raw);
    expect(upsert.sourceUpdatedAt?.toISOString()).toBe("2026-05-01T08:30:00.000Z");
  });

  it("omits sourceUpdatedAt when the provider does not surface it", () => {
    const { updatedAt: _drop, ...rest } = baseContact;
    void _drop;
    const upsert = mapRawContactToSourceObject(COMPANY_ID, "xero", rest);
    expect(upsert.sourceUpdatedAt).toBeUndefined();
  });

  it("rejects malformed updatedAt timestamps", () => {
    expect(() =>
      mapRawContactToSourceObject(COMPANY_ID, "xero", {
        ...baseContact,
        updatedAt: "not-a-date",
      }),
    ).toThrow(/invalid updatedAt/);
  });
});

describe("mapRawContactToCustomer", () => {
  it("projects display + legal + status with provider id passthrough", () => {
    const customer = mapRawContactToCustomer(COMPANY_ID, baseContact);
    expect(customer).toEqual({
      companyId: COMPANY_ID,
      displayName: "Northstar Foods Ltd",
      legalName: "Northstar Foods Limited",
      status: "active",
      providerObjectId: "xero-contact-1",
    });
  });

  it("defaults status to active when the provider is silent", () => {
    const { status: _drop, ...rest } = baseContact;
    void _drop;
    const customer = mapRawContactToCustomer(COMPANY_ID, rest);
    expect(customer.status).toBe("active");
    expect(customer.legalName).toBe("Northstar Foods Limited");
  });
});

describe("mapRawInvoiceToSourceObject", () => {
  it("emits an invoice-typed source-object upsert with content hash over raw", () => {
    const upsert = mapRawInvoiceToSourceObject(COMPANY_ID, "xero", baseInvoice);
    expect(upsert.providerObjectType).toBe("invoice");
    expect(upsert.providerObjectId).toBe("xero-inv-1001");
    expect(upsert.contentHash).toBe(sha256OfJson(baseInvoice.raw));
  });
});

describe("mapRawInvoiceToInvoice", () => {
  it("converts minor-unit strings to bigint and forwards the contact provider id", () => {
    const invoice = mapRawInvoiceToInvoice(COMPANY_ID, baseInvoice);
    expect(invoice.amountTotalMinor).toBe(1_850_000n);
    expect(invoice.amountDueMinor).toBe(1_850_000n);
    expect(invoice.amountPaidMinor).toBe(0n);
    expect(invoice.customerProviderObjectId).toBe("xero-contact-1");
    expect(invoice.lastSourceUpdatedAt?.toISOString()).toBe("2026-05-01T08:31:00.000Z");
    expect(invoice.invoiceNumber).toBe("RO-1001");
  });

  it("rejects non-integer minor-unit strings", () => {
    expect(() =>
      mapRawInvoiceToInvoice(COMPANY_ID, {
        ...baseInvoice,
        amountTotalMinor: "12.34",
      }),
    ).toThrow(/integer minor-unit/);
  });
});

describe("mapRawPaymentToSourceObject + mapRawPaymentToPayment", () => {
  it("forwards invoice provider id when present and nullifies optional fields otherwise", () => {
    const upsert = mapRawPaymentToSourceObject(COMPANY_ID, "xero", basePayment);
    expect(upsert.providerObjectType).toBe("payment");

    const payment = mapRawPaymentToPayment(COMPANY_ID, basePayment);
    expect(payment.amountMinor).toBe(250_000n);
    expect(payment.invoiceProviderObjectId).toBe("xero-inv-1002");
    expect(payment.reference).toBe("BACS RO-1002 partial");
    expect(payment.customerProviderObjectId).toBeNull();
  });

  it("nullifies invoiceProviderObjectId when missing", () => {
    const { invoiceProviderObjectId: _drop, ...rest } = basePayment;
    void _drop;
    const payment = mapRawPaymentToPayment(COMPANY_ID, rest);
    expect(payment.invoiceProviderObjectId).toBeNull();
  });
});
