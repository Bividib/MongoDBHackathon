import type { JsonValue } from "@runwayops/domain";

/**
 * Stable identifier for an accounting provider. Round 4 ships only the
 * Xero simulated adapter; later rounds widen this union as real adapters
 * land. Keep the union closed so callers can `switch` exhaustively.
 */
export type AccountingProviderKey = "xero" | "quickbooks";

/**
 * What the engine knows about an active provider connection while a sync
 * is running. Round 4 is stateless — there is no `integration_tokens`
 * persistence yet — so this struct is the only thing an adapter receives.
 *
 * The adapter MUST treat this as read-only and MUST NOT mutate provider
 * state. The simulated Xero adapter only reads from disk, so this is a
 * trivial constraint here; the same interface will be the contract when
 * real adapters arrive.
 */
export interface ProviderConnection {
  readonly companyId: string;
  readonly providerKey: AccountingProviderKey;
  /** Optional provider-side account/tenant id, e.g. Xero `tenantId`. */
  readonly externalAccountId?: string;
  /** Bag of provider-specific knobs (fixture root, base URL, etc.). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Pagination / freshness filters every provider must accept. Real adapters
 * translate these into provider-specific cursor + If-Modified-Since calls;
 * the simulated adapter applies them in-memory.
 */
export interface ListOptions {
  readonly modifiedSince?: Date;
  readonly limit?: number;
}

/**
 * Provider-shaped invoice. `raw` carries the verbatim provider payload so
 * mappers can hash it, persist it as a SourceObject, and replay later. The
 * other fields are a thin normalization that every accounting provider can
 * fill in, mostly to drive the canonical-entity mapper without forcing it
 * to peek at provider-specific JSON paths.
 *
 * Money is carried as integer minor-unit strings (the same wire format the
 * domain `Money` schema accepts) to avoid number-precision loss at the
 * wire boundary.
 */
export interface RawInvoice {
  readonly providerObjectId: string;
  readonly invoiceNumber: string;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly status: string;
  readonly amountTotalMinor: string;
  readonly amountDueMinor: string;
  readonly amountPaidMinor: string;
  readonly currency: string;
  readonly contactProviderObjectId: string;
  readonly updatedAt?: string;
  readonly raw: JsonValue;
}

/**
 * Provider-shaped payment. `invoiceProviderObjectId` is optional because not
 * every payment is tied to an AR invoice on the provider side (e.g. a
 * customer prepayment).
 */
export interface RawPayment {
  readonly providerObjectId: string;
  readonly paymentDate: string;
  readonly amountMinor: string;
  readonly currency: string;
  readonly providerStatus: string;
  readonly contactProviderObjectId?: string;
  readonly invoiceProviderObjectId?: string;
  readonly reference?: string;
  readonly updatedAt?: string;
  readonly raw: JsonValue;
}

/**
 * Provider-shaped contact (a "customer" on Xero, an account name on QB).
 */
export interface RawContact {
  readonly providerObjectId: string;
  readonly displayName: string;
  readonly legalName?: string;
  readonly status?: string;
  readonly email?: string;
  readonly updatedAt?: string;
  readonly raw: JsonValue;
}

/**
 * Provider-shaped object types we hash and persist as SourceObjects.
 * Matches `provider_object_type` values stored on the row.
 */
export type ProviderObjectType = "invoice" | "payment" | "contact";

/**
 * Read-only adapter contract. Every provider exposes these three lists;
 * mapper + sync code projects them onto canonical SourceObjects + entity
 * tables. The adapter is intentionally side-effect-free (no token rotate,
 * no webhook subscribe) — those lifecycles belong in later rounds.
 */
export interface AccountingProvider {
  readonly providerKey: AccountingProviderKey;
  listInvoices(
    connection: ProviderConnection,
    opts?: ListOptions,
  ): Promise<RawInvoice[]>;
  listPayments(
    connection: ProviderConnection,
    opts?: ListOptions,
  ): Promise<RawPayment[]>;
  listContacts(
    connection: ProviderConnection,
    opts?: ListOptions,
  ): Promise<RawContact[]>;
}
