import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { JsonValue } from "@runwayops/domain";

import type {
  AccountingProvider,
  ListOptions,
  ProviderConnection,
  RawContact,
  RawInvoice,
  RawPayment,
} from "../provider.js";

/**
 * Resolve the bundled fixture root once at module load. Tests can override
 * via `metadata.fixtureRoot` on the `ProviderConnection` so a per-test
 * directory can stage different scenarios without mutating the package.
 */
const PACKAGE_FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/xero",
);

function resolveFixtureRoot(connection: ProviderConnection): string {
  const override = connection.metadata?.fixtureRoot;
  if (typeof override === "string" && override.length > 0) return override;
  return PACKAGE_FIXTURE_ROOT;
}

/**
 * Read a fixture file as JSON. The simulated adapter is read-only, so a
 * missing fixture is treated as a hard failure (not "no records") — the
 * caller should know which lists are populated.
 */
async function readFixture(
  fixtureRoot: string,
  name: "contacts" | "invoices" | "payments",
): Promise<JsonValue[]> {
  const filePath = path.join(fixtureRoot, `${name}.json`);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `xero-simulated: fixture ${name}.json must be a JSON array, got ${typeof parsed}`,
    );
  }
  return parsed as JsonValue[];
}

function asObject(value: JsonValue, ctx: string): Record<string, JsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`xero-simulated: expected object at ${ctx}, got ${typeof value}`);
  }
  return value as Record<string, JsonValue>;
}

function readString(
  obj: Record<string, JsonValue>,
  key: string,
  ctx: string,
): string {
  const value = obj[key];
  if (typeof value !== "string") {
    throw new Error(`xero-simulated: missing string field ${key} at ${ctx}`);
  }
  return value;
}

function readOptionalString(
  obj: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(
  obj: Record<string, JsonValue>,
  key: string,
  ctx: string,
): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`xero-simulated: missing number field ${key} at ${ctx}`);
  }
  return value;
}

/**
 * Convert a Xero major-unit decimal (e.g. 18500.5) into a minor-unit string
 * suitable for the Money schema. Xero invoices are quoted in major units
 * with up to 4 decimal places, but for AR/AP we treat anything beyond the
 * currency's minor-unit precision as an error rather than rounding silently.
 */
function majorToMinorString(major: number, currency: string): string {
  const minorUnits = currency === "JPY" ? 0 : 2;
  const factor = 10 ** minorUnits;
  const scaled = Math.round(major * factor);
  if (Math.abs(scaled / factor - major) > 1e-9) {
    throw new Error(
      `xero-simulated: amount ${major} has more precision than ${currency} supports`,
    );
  }
  return scaled.toString();
}

function applyListOptions<T extends { updatedAt?: string }>(
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

function projectContact(rawJson: JsonValue, index: number): RawContact {
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

function mapContactStatus(xeroStatus: string): string {
  const upper = xeroStatus.toUpperCase();
  if (upper === "ACTIVE") return "active";
  if (upper === "ARCHIVED") return "archived";
  if (upper === "GDPRREQUEST") return "archived";
  return "active";
}

function mapInvoiceStatus(xeroStatus: string): string {
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

function mapPaymentStatus(xeroStatus: string): string {
  const upper = xeroStatus.toUpperCase();
  if (upper === "AUTHORISED") return "posted";
  if (upper === "DELETED") return "reversed";
  return "pending";
}

function projectInvoice(rawJson: JsonValue, index: number): RawInvoice {
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

function projectPayment(rawJson: JsonValue, index: number): RawPayment {
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

/**
 * File-backed Xero adapter. No HTTP, no OAuth — fixtures live on disk and
 * the adapter reads them on each call. Real-Xero adapter parity:
 *   * Contacts → invoices (Contact.ContactID FK) → payments (Invoice.InvoiceID FK)
 *   * `UpdatedDateUTC` powers `modifiedSince` filtering.
 *   * Currency code from the row drives minor-unit conversion.
 *
 * Hard invariant: the adapter only reads. There is no mutation API on this
 * class, deliberately, so a Round-4 caller can never accidentally write to
 * a "provider" that has no remote.
 */
export class XeroSimulatedAdapter implements AccountingProvider {
  readonly providerKey = "xero" as const;

  async listContacts(
    connection: ProviderConnection,
    opts?: ListOptions,
  ): Promise<RawContact[]> {
    this.assertProvider(connection);
    const root = resolveFixtureRoot(connection);
    const rows = await readFixture(root, "contacts");
    const projected = rows.map((row, idx) => projectContact(row, idx));
    return applyListOptions(projected, opts);
  }

  async listInvoices(
    connection: ProviderConnection,
    opts?: ListOptions,
  ): Promise<RawInvoice[]> {
    this.assertProvider(connection);
    const root = resolveFixtureRoot(connection);
    const rows = await readFixture(root, "invoices");
    const projected = rows.map((row, idx) => projectInvoice(row, idx));
    return applyListOptions(projected, opts);
  }

  async listPayments(
    connection: ProviderConnection,
    opts?: ListOptions,
  ): Promise<RawPayment[]> {
    this.assertProvider(connection);
    const root = resolveFixtureRoot(connection);
    const rows = await readFixture(root, "payments");
    const projected = rows.map((row, idx) => projectPayment(row, idx));
    return applyListOptions(projected, opts);
  }

  private assertProvider(connection: ProviderConnection): void {
    if (connection.providerKey !== "xero") {
      throw new Error(
        `XeroSimulatedAdapter: connection.providerKey must be "xero", got ${connection.providerKey}`,
      );
    }
  }
}
