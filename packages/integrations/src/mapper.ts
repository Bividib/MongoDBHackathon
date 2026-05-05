import { sha256OfJson } from "./hash.js";
import type {
  AccountingProviderKey,
  ProviderObjectType,
  RawContact,
  RawInvoice,
  RawPayment,
} from "./provider.js";

/**
 * Wire shape that matches `UpsertSourceObjectInput` in `@runwayops/db`.
 * Re-declared here so the mapper does not pull the db package into its
 * type signature — the calling sync code threads these through to the
 * repo helper.
 */
export interface SourceObjectUpsert {
  readonly companyId: string;
  readonly provider: string;
  readonly providerObjectType: ProviderObjectType;
  readonly providerObjectId: string;
  readonly contentHash: string;
  readonly rawPayload: RawInvoice["raw"];
  readonly sourceUpdatedAt?: Date;
}

/**
 * Canonical Customer projection from a RawContact. The integration sync
 * caller resolves the `companyId` and creates the row; we keep this in
 * the wire-friendly Drizzle insert shape (no FK ids; those are assigned
 * downstream).
 */
export interface CanonicalCustomerInsert {
  readonly companyId: string;
  readonly displayName: string;
  readonly legalName: string | null;
  readonly status: string;
  readonly providerObjectId: string;
}

/**
 * Canonical Invoice projection from a RawInvoice. `customerProviderObjectId`
 * is forwarded so the sync caller can resolve it to the local `customerId`
 * after contacts are upserted.
 */
export interface CanonicalInvoiceInsert {
  readonly companyId: string;
  readonly invoiceNumber: string;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly status: string;
  readonly amountTotalMinor: bigint;
  readonly amountDueMinor: bigint;
  readonly amountPaidMinor: bigint;
  readonly currency: string;
  readonly customerProviderObjectId: string;
  readonly providerObjectId: string;
  readonly lastSourceUpdatedAt: Date | null;
}

export interface CanonicalPaymentInsert {
  readonly companyId: string;
  readonly paymentDate: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly providerStatus: string;
  readonly reference: string | null;
  readonly customerProviderObjectId: string | null;
  readonly invoiceProviderObjectId: string | null;
  readonly providerObjectId: string;
}

function toBigIntMinor(value: string, field: string): bigint {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(
      `mapper: ${field} must be an integer minor-unit string, got ${JSON.stringify(value)}`,
    );
  }
  return BigInt(value);
}

function toUpdatedAtDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`mapper: invalid updatedAt timestamp: ${JSON.stringify(value)}`);
  }
  return date;
}

/**
 * RawContact → SourceObject upsert.
 *
 * Hash is over the verbatim provider payload, NOT the normalized fields.
 * Spec §15.2 puts the source object before any projection so a re-import
 * of bit-identical provider data is a no-op even if our normalization
 * code changed.
 */
export function mapRawContactToSourceObject(
  companyId: string,
  providerKey: AccountingProviderKey,
  raw: RawContact,
): SourceObjectUpsert {
  const upsert: SourceObjectUpsert = {
    companyId,
    provider: providerKey,
    providerObjectType: "contact",
    providerObjectId: raw.providerObjectId,
    contentHash: sha256OfJson(raw.raw),
    rawPayload: raw.raw,
  };
  const sourceUpdatedAt = toUpdatedAtDate(raw.updatedAt);
  return sourceUpdatedAt ? { ...upsert, sourceUpdatedAt } : upsert;
}

export function mapRawInvoiceToSourceObject(
  companyId: string,
  providerKey: AccountingProviderKey,
  raw: RawInvoice,
): SourceObjectUpsert {
  const upsert: SourceObjectUpsert = {
    companyId,
    provider: providerKey,
    providerObjectType: "invoice",
    providerObjectId: raw.providerObjectId,
    contentHash: sha256OfJson(raw.raw),
    rawPayload: raw.raw,
  };
  const sourceUpdatedAt = toUpdatedAtDate(raw.updatedAt);
  return sourceUpdatedAt ? { ...upsert, sourceUpdatedAt } : upsert;
}

export function mapRawPaymentToSourceObject(
  companyId: string,
  providerKey: AccountingProviderKey,
  raw: RawPayment,
): SourceObjectUpsert {
  const upsert: SourceObjectUpsert = {
    companyId,
    provider: providerKey,
    providerObjectType: "payment",
    providerObjectId: raw.providerObjectId,
    contentHash: sha256OfJson(raw.raw),
    rawPayload: raw.raw,
  };
  const sourceUpdatedAt = toUpdatedAtDate(raw.updatedAt);
  return sourceUpdatedAt ? { ...upsert, sourceUpdatedAt } : upsert;
}

/**
 * RawContact → canonical Customer row (Drizzle insert shape, sans FKs).
 * Status defaults to "active" when the provider does not surface one —
 * Xero contacts in particular do not always carry a status.
 */
export function mapRawContactToCustomer(
  companyId: string,
  raw: RawContact,
): CanonicalCustomerInsert {
  return {
    companyId,
    displayName: raw.displayName,
    legalName: raw.legalName ?? null,
    status: raw.status ?? "active",
    providerObjectId: raw.providerObjectId,
  };
}

export function mapRawInvoiceToInvoice(
  companyId: string,
  raw: RawInvoice,
): CanonicalInvoiceInsert {
  const updatedAt = toUpdatedAtDate(raw.updatedAt);
  return {
    companyId,
    invoiceNumber: raw.invoiceNumber,
    issueDate: raw.issueDate,
    dueDate: raw.dueDate,
    status: raw.status,
    amountTotalMinor: toBigIntMinor(raw.amountTotalMinor, "amountTotalMinor"),
    amountDueMinor: toBigIntMinor(raw.amountDueMinor, "amountDueMinor"),
    amountPaidMinor: toBigIntMinor(raw.amountPaidMinor, "amountPaidMinor"),
    currency: raw.currency,
    customerProviderObjectId: raw.contactProviderObjectId,
    providerObjectId: raw.providerObjectId,
    lastSourceUpdatedAt: updatedAt ?? null,
  };
}

export function mapRawPaymentToPayment(
  companyId: string,
  raw: RawPayment,
): CanonicalPaymentInsert {
  return {
    companyId,
    paymentDate: raw.paymentDate,
    amountMinor: toBigIntMinor(raw.amountMinor, "amountMinor"),
    currency: raw.currency,
    providerStatus: raw.providerStatus,
    reference: raw.reference ?? null,
    customerProviderObjectId: raw.contactProviderObjectId ?? null,
    invoiceProviderObjectId: raw.invoiceProviderObjectId ?? null,
    providerObjectId: raw.providerObjectId,
  };
}
