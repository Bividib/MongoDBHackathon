/**
 * Xero JSON → `Raw{Contact,Invoice,Payment}` projection. Pure functions,
 * no I/O. Both the simulated adapter (reads fixtures from disk) and the
 * real adapter (reads from the Xero REST API) feed JSON through these
 * helpers, so the wire-shape interpretation lives in one place.
 *
 * Anything Xero-shaped (field names, status enums, currency conventions)
 * lives here. Anything transport-shaped (HTTP retry, fixture paths)
 * lives in the adapter.
 */
import type { JsonValue } from "@runwayops/domain";

import type {
  ListOptions,
  RawContact,
  RawInvoice,
  RawPayment,
} from "../provider.js";

export function asObject(value: JsonValue, ctx: string): Record<string, JsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`xero-projection: expected object at ${ctx}, got ${typeof value}`);
  }
  return value as Record<string, JsonValue>;
}

export function readString(
  obj: Record<string, JsonValue>,
  key: string,
  ctx: string,
): string {
  const value = obj[key];
  if (typeof value !== "string") {
    throw new Error(`xero-projection: missing string field ${key} at ${ctx}`);
  }
  return value;
}

export function readOptionalString(
  obj: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

export function readNumber(
  obj: Record<string, JsonValue>,
  key: string,
  ctx: string,
): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`xero-projection: missing number field ${key} at ${ctx}`);
  }
  return value;
}

/**
 * Convert a Xero major-unit decimal (e.g. 18500.5) into a minor-unit
 * string suitable for the Money schema. Xero invoices are quoted in
 * major units with up to 4 decimal places, but for AR/AP we treat
 * anything beyond the currency's minor-unit precision as an error
 * rather than rounding silently.
 */
export function majorToMinorString(major: number, currency: string): string {
  const minorUnits = currency === "JPY" ? 0 : 2;
  const factor = 10 ** minorUnits;
  const scaled = Math.round(major * factor);
  if (Math.abs(scaled / factor - major) > 1e-9) {
    throw new Error(
      `xero-projection: amount ${major} has more precision than ${currency} supports`,
    );
  }
  return scaled.toString();
}

export function applyListOptions<T extends { updatedAt?: string }>(
  rows: T[],
  opts: ListOptions | undefined,
): T[] {
  let out = rows;
  if (opts?.modifiedSince) {
    const since = opts.modifiedSince.getTime();
    out = out.filter((row) => {
      if (!row.updatedAt) return true;
      const ts = new Date(row.updatedAt).getTime();
      return Number.isNaN(ts) ? true : ts >= since;
    });
  }
  if (typeof opts?.limit === "number" && opts.limit >= 0) {
    out = out.slice(0, opts.limit);
  }
  return out;
}

export function mapContactStatus(xeroStatus: string): string {
  const upper = xeroStatus.toUpperCase();
  if (upper === "ACTIVE") return "active";
  if (upper === "ARCHIVED") return "archived";
  if (upper === "GDPRREQUEST") return "archived";
  return "active";
}

export function mapInvoiceStatus(xeroStatus: string): string {
  const upper = xeroStatus.toUpperCase();
  switch (upper) {
    case "DRAFT":
      return "draft";
    case "SUBMITTED":
      return "draft";
    case "AUTHORISED":
      return "authorised";
    case "PAID":
      return "paid";
    case "VOIDED":
      return "void";
    case "DELETED":
      return "void";
    default:
      return "authorised";
  }
}

export function mapPaymentStatus(xeroStatus: string): string {
  const upper = xeroStatus.toUpperCase();
  if (upper === "AUTHORISED") return "posted";
  if (upper === "DELETED") return "reversed";
  return "pending";
}

export function projectContact(rawJson: JsonValue, index: number): RawContact {
  const ctx = `contacts[${index}]`;
  const obj = asObject(rawJson, ctx);
  const out: RawContact = {
    providerObjectId: readString(obj, "ContactID", ctx),
    displayName: readString(obj, "Name", ctx),
    raw: rawJson,
  };
  const legalName = readOptionalString(obj, "LegalName");
  if (legalName !== undefined) (out as { legalName?: string }).legalName = legalName;
  const status = readOptionalString(obj, "ContactStatus");
  if (status !== undefined) (out as { status?: string }).status = mapContactStatus(status);
  const email = readOptionalString(obj, "EmailAddress");
  if (email !== undefined) (out as { email?: string }).email = email;
  const updatedAt = readOptionalString(obj, "UpdatedDateUTC");
  if (updatedAt !== undefined) (out as { updatedAt?: string }).updatedAt = updatedAt;
  return out;
}

export function projectInvoice(rawJson: JsonValue, index: number): RawInvoice {
  const ctx = `invoices[${index}]`;
  const obj = asObject(rawJson, ctx);
  const contact = asObject(obj["Contact"]!, `${ctx}.Contact`);
  const currency = readString(obj, "CurrencyCode", ctx);
  const total = readNumber(obj, "Total", ctx);
  const amountDue = readNumber(obj, "AmountDue", ctx);
  const amountPaid = readNumber(obj, "AmountPaid", ctx);
  const out: RawInvoice = {
    providerObjectId: readString(obj, "InvoiceID", ctx),
    invoiceNumber: readString(obj, "InvoiceNumber", ctx),
    issueDate: readString(obj, "Date", ctx),
    dueDate: readString(obj, "DueDate", ctx),
    status: mapInvoiceStatus(readString(obj, "Status", ctx)),
    amountTotalMinor: majorToMinorString(total, currency),
    amountDueMinor: majorToMinorString(amountDue, currency),
    amountPaidMinor: majorToMinorString(amountPaid, currency),
    currency,
    contactProviderObjectId: readString(contact, "ContactID", `${ctx}.Contact`),
    raw: rawJson,
  };
  const updatedAt = readOptionalString(obj, "UpdatedDateUTC");
  if (updatedAt !== undefined) (out as { updatedAt?: string }).updatedAt = updatedAt;
  return out;
}

export function projectPayment(rawJson: JsonValue, index: number): RawPayment {
  const ctx = `payments[${index}]`;
  const obj = asObject(rawJson, ctx);
  const currency = readString(obj, "CurrencyCode", ctx);
  const amount = readNumber(obj, "Amount", ctx);
  const out: RawPayment = {
    providerObjectId: readString(obj, "PaymentID", ctx),
    paymentDate: readString(obj, "Date", ctx),
    amountMinor: majorToMinorString(amount, currency),
    currency,
    providerStatus: mapPaymentStatus(readString(obj, "Status", ctx)),
    raw: rawJson,
  };
  const invoice = obj["Invoice"];
  if (invoice && typeof invoice === "object" && !Array.isArray(invoice)) {
    const id = readOptionalString(invoice as Record<string, JsonValue>, "InvoiceID");
    if (id !== undefined) {
      (out as { invoiceProviderObjectId?: string }).invoiceProviderObjectId = id;
    }
  }
  const reference = readOptionalString(obj, "Reference");
  if (reference !== undefined) (out as { reference?: string }).reference = reference;
  const updatedAt = readOptionalString(obj, "UpdatedDateUTC");
  if (updatedAt !== undefined) (out as { updatedAt?: string }).updatedAt = updatedAt;
  return out;
}
