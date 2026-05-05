import { and, eq } from "drizzle-orm";

import { repositories, schema } from "@runwayops/db";

import {
  mapRawContactToCustomer,
  mapRawContactToSourceObject,
  mapRawInvoiceToInvoice,
  mapRawInvoiceToSourceObject,
  mapRawPaymentToPayment,
  mapRawPaymentToSourceObject,
} from "./mapper.js";
import type {
  AccountingProvider,
  ListOptions,
  ProviderConnection,
} from "./provider.js";

const { upsertSourceObject } = repositories;
const { customers, invoices: invoicesTable, payments: paymentsTable } = schema;

/**
 * Drizzle handle accepted by the sync orchestrator. Mirrors `DbHandle`
 * from `@runwayops/db` — derived from the repo function signature so we
 * track the same type without re-exporting it.
 */
type RepoHandle = Parameters<typeof upsertSourceObject>[0];

export interface SyncResult {
  readonly contactsImported: number;
  readonly contactsDeduped: number;
  readonly invoicesImported: number;
  readonly invoicesDeduped: number;
  readonly paymentsImported: number;
  readonly paymentsDeduped: number;
}

export interface SyncOptions {
  readonly modifiedSince?: Date;
  readonly invoiceLimit?: number;
  readonly paymentLimit?: number;
  readonly contactLimit?: number;
}

function listOpts(
  modifiedSince: Date | undefined,
  limit: number | undefined,
): ListOptions {
  const out: { modifiedSince?: Date; limit?: number } = {};
  if (modifiedSince !== undefined) out.modifiedSince = modifiedSince;
  if (limit !== undefined) out.limit = limit;
  return out;
}

function ifPresent<TKey extends string, TValue>(
  key: TKey,
  value: TValue | null,
): Partial<Record<TKey, TValue>> {
  return value === null ? {} : ({ [key]: value } as Record<TKey, TValue>);
}

/**
 * Pull the three lists from the provider, persist each row as a SourceObject
 * (running it through the dedup repo), then project each one onto its
 * canonical table (customers, invoices, payments). Tenant scope is the
 * caller's responsibility — wrap this in `withTenant(...)` from
 * `@runwayops/db` so RLS fires on every write.
 *
 * Order matters: contacts first because invoices and payments hold FK
 * references to `customers.id`. Within each section the SourceObject
 * insert lands first, so the canonical row can attach `source_object_id`.
 *
 * Idempotency:
 *   * SourceObject: `upsertSourceObject` returns `inserted` or `duplicate`.
 *   * Customer/Invoice/Payment: each canonical upsert checks for the
 *     row by its natural key (customer.sourceObjectId, invoice
 *     `(companyId, invoiceNumber)`, payment.sourceObjectId) and inserts only
 *     if missing. Re-running the sync against the same fixtures is a no-op.
 */
export async function syncProviderToSourceObjects(
  handle: RepoHandle,
  connection: ProviderConnection,
  provider: AccountingProvider,
  options: SyncOptions = {},
): Promise<SyncResult> {
  if (connection.providerKey !== provider.providerKey) {
    throw new Error(
      `sync: connection.providerKey ${connection.providerKey} does not match provider ${provider.providerKey}`,
    );
  }

  const [contacts, invoiceRows, paymentRows] = await Promise.all([
    provider.listContacts(connection, listOpts(options.modifiedSince, options.contactLimit)),
    provider.listInvoices(connection, listOpts(options.modifiedSince, options.invoiceLimit)),
    provider.listPayments(connection, listOpts(options.modifiedSince, options.paymentLimit)),
  ]);

  let contactsImported = 0;
  let contactsDeduped = 0;
  const customerByProviderObjectId = new Map<string, string>();
  for (const raw of contacts) {
    const upsert = mapRawContactToSourceObject(
      connection.companyId,
      provider.providerKey,
      raw,
    );
    const result = await upsertSourceObject(handle, upsert);
    if (result.kind === "inserted") contactsImported += 1;
    else contactsDeduped += 1;
    const customerId = await ensureCustomer(
      handle,
      result.row.id,
      mapRawContactToCustomer(connection.companyId, raw),
    );
    customerByProviderObjectId.set(raw.providerObjectId, customerId);
  }

  let invoicesImported = 0;
  let invoicesDeduped = 0;
  const invoiceIdByProviderObjectId = new Map<string, string>();
  for (const raw of invoiceRows) {
    const upsert = mapRawInvoiceToSourceObject(
      connection.companyId,
      provider.providerKey,
      raw,
    );
    const result = await upsertSourceObject(handle, upsert);
    if (result.kind === "inserted") invoicesImported += 1;
    else invoicesDeduped += 1;

    const projected = mapRawInvoiceToInvoice(connection.companyId, raw);
    const customerId = customerByProviderObjectId.get(projected.customerProviderObjectId);
    if (!customerId) {
      throw new Error(
        `sync: invoice ${raw.providerObjectId} references unknown contact ${projected.customerProviderObjectId}`,
      );
    }

    const invoiceId = await ensureInvoice(
      handle,
      result.row.id,
      customerId,
      projected,
    );
    invoiceIdByProviderObjectId.set(raw.providerObjectId, invoiceId);
  }

  let paymentsImported = 0;
  let paymentsDeduped = 0;
  for (const raw of paymentRows) {
    const upsert = mapRawPaymentToSourceObject(
      connection.companyId,
      provider.providerKey,
      raw,
    );
    const result = await upsertSourceObject(handle, upsert);
    if (result.kind === "inserted") paymentsImported += 1;
    else paymentsDeduped += 1;

    const projected = mapRawPaymentToPayment(connection.companyId, raw);
    const customerId = projected.customerProviderObjectId
      ? customerByProviderObjectId.get(projected.customerProviderObjectId) ?? null
      : null;
    const invoiceId = projected.invoiceProviderObjectId
      ? invoiceIdByProviderObjectId.get(projected.invoiceProviderObjectId) ?? null
      : null;

    await ensurePayment(handle, result.row.id, customerId, invoiceId, projected);
  }

  return {
    contactsImported,
    contactsDeduped,
    invoicesImported,
    invoicesDeduped,
    paymentsImported,
    paymentsDeduped,
  };
}

async function ensureCustomer(
  handle: RepoHandle,
  sourceObjectId: string,
  insert: ReturnType<typeof mapRawContactToCustomer>,
): Promise<string> {
  const existing = await handle
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.companyId, insert.companyId),
        eq(customers.sourceObjectId, sourceObjectId),
      ),
    )
    .limit(1);
  if (existing.length === 1) return existing[0]!.id;

  const inserted = await handle
    .insert(customers)
    .values({
      companyId: insert.companyId,
      sourceObjectId,
      displayName: insert.displayName,
      ...ifPresent("legalName", insert.legalName),
      status: insert.status,
    })
    .returning({ id: customers.id });
  return inserted[0]!.id;
}

async function ensureInvoice(
  handle: RepoHandle,
  sourceObjectId: string,
  customerId: string,
  insert: ReturnType<typeof mapRawInvoiceToInvoice>,
): Promise<string> {
  const existing = await handle
    .select({ id: invoicesTable.id })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.companyId, insert.companyId),
        eq(invoicesTable.invoiceNumber, insert.invoiceNumber),
      ),
    )
    .limit(1);
  if (existing.length === 1) return existing[0]!.id;

  const inserted = await handle
    .insert(invoicesTable)
    .values({
      companyId: insert.companyId,
      customerId,
      sourceObjectId,
      invoiceNumber: insert.invoiceNumber,
      issueDate: insert.issueDate,
      dueDate: insert.dueDate,
      status: insert.status,
      amountTotalMinor: insert.amountTotalMinor,
      amountDueMinor: insert.amountDueMinor,
      amountPaidMinor: insert.amountPaidMinor,
      currency: insert.currency,
      ...ifPresent("lastSourceUpdatedAt", insert.lastSourceUpdatedAt),
    })
    .returning({ id: invoicesTable.id });
  return inserted[0]!.id;
}

async function ensurePayment(
  handle: RepoHandle,
  sourceObjectId: string,
  customerId: string | null,
  invoiceId: string | null,
  insert: ReturnType<typeof mapRawPaymentToPayment>,
): Promise<string> {
  const existing = await handle
    .select({ id: paymentsTable.id })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.companyId, insert.companyId),
        eq(paymentsTable.sourceObjectId, sourceObjectId),
      ),
    )
    .limit(1);
  if (existing.length === 1) return existing[0]!.id;

  const inserted = await handle
    .insert(paymentsTable)
    .values({
      companyId: insert.companyId,
      sourceObjectId,
      ...ifPresent("customerId", customerId),
      ...ifPresent("invoiceId", invoiceId),
      paymentDate: insert.paymentDate,
      amountMinor: insert.amountMinor,
      currency: insert.currency,
      providerStatus: insert.providerStatus,
      ...ifPresent("reference", insert.reference),
    })
    .returning({ id: paymentsTable.id });
  return inserted[0]!.id;
}
