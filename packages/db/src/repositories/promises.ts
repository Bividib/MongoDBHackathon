import { and, desc, eq } from "drizzle-orm";

import {
  type Money,
  money,
  type PromiseCreatedBy,
  type PromiseOutcome,
  type PromiseToPay,
  type PromiseType,
} from "@runwayops/domain";

import {
  deserializeEvidenceRefs,
  serializeEvidenceRefs,
} from "../schema/common.js";
import { promiseToPayRecords } from "../schema/promises.js";
import type { DbHandle } from "./tenant.js";

export type PromiseRow = typeof promiseToPayRecords.$inferSelect;

function toMoney(amountMinor: bigint | null, currency: string | null): Money | undefined {
  if (amountMinor === null || amountMinor === undefined || !currency) return undefined;
  return money(amountMinor.toString(), currency);
}

function toDateOrUndefined(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  return new Date(value);
}

export function rowToPromise(row: PromiseRow): PromiseToPay {
  const baseCurrency = row.currency ?? "GBP";
  return {
    id: row.id,
    companyId: row.companyId,
    customerId: row.customerId,
    invoiceId: row.invoiceId ?? undefined,
    sourceMessageId: row.sourceMessageId ?? undefined,
    amountPromised: toMoney(row.amountPromisedMinor, baseCurrency),
    promisedDate: toDateOrUndefined(row.promisedDate),
    promiseType: row.promiseType as PromiseType,
    conditionText: row.conditionText ?? undefined,
    extractedText: row.extractedText,
    confidenceAtCreation: Number(row.confidenceAtCreation ?? 0),
    evidenceRefs: deserializeEvidenceRefs(row.evidenceRefs ?? []) as PromiseToPay["evidenceRefs"],
    outcome: row.outcome as PromiseOutcome,
    actualPaymentDate: toDateOrUndefined(row.actualPaymentDate),
    actualAmountReceived: toMoney(row.actualAmountReceivedMinor, baseCurrency),
    createdBy: row.createdBy as PromiseCreatedBy,
    approvedByUserId: row.approvedByUserId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Insert a freshly extracted promise. The caller must have set the tenant
 * GUC via `withTenant`. Returns the persisted domain shape.
 */
export async function insertPromise(
  handle: DbHandle,
  input: Omit<PromiseToPay, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<PromiseToPay> {
  const values: typeof promiseToPayRecords.$inferInsert = {
    companyId: input.companyId,
    customerId: input.customerId,
    invoiceId: input.invoiceId ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    amountPromisedMinor: input.amountPromised?.amountMinor ?? null,
    currency: input.amountPromised?.currency ?? "GBP",
    promisedDate: input.promisedDate ? input.promisedDate.toISOString().slice(0, 10) : null,
    promiseType: input.promiseType,
    conditionText: input.conditionText ?? null,
    extractedText: input.extractedText,
    confidenceAtCreation: input.confidenceAtCreation.toFixed(4),
    evidenceRefs: serializeEvidenceRefs(input.evidenceRefs),
    outcome: input.outcome,
    actualPaymentDate: input.actualPaymentDate
      ? input.actualPaymentDate.toISOString().slice(0, 10)
      : null,
    actualAmountReceivedMinor: input.actualAmountReceived?.amountMinor ?? null,
    actualPaymentId: null,
    createdBy: input.createdBy,
    approvedByUserId: input.approvedByUserId ?? null,
  };
  if (input.id !== undefined) values.id = input.id;

  const inserted = await handle.insert(promiseToPayRecords).values(values).returning();

  if (inserted.length !== 1) throw new Error("insertPromise: insert returned no row");
  return rowToPromise(inserted[0]!);
}

export async function getPromiseById(
  handle: DbHandle,
  input: { companyId: string; id: string },
): Promise<PromiseToPay | null> {
  const rows = await handle
    .select()
    .from(promiseToPayRecords)
    .where(
      and(
        eq(promiseToPayRecords.companyId, input.companyId),
        eq(promiseToPayRecords.id, input.id),
      ),
    )
    .limit(1);

  return rows.length === 1 ? rowToPromise(rows[0]!) : null;
}

export async function listPendingPromisesForCompany(
  handle: DbHandle,
  input: { companyId: string; limit?: number },
): Promise<PromiseToPay[]> {
  const rows = await handle
    .select()
    .from(promiseToPayRecords)
    .where(
      and(
        eq(promiseToPayRecords.companyId, input.companyId),
        eq(promiseToPayRecords.outcome, "pending"),
      ),
    )
    .orderBy(desc(promiseToPayRecords.createdAt))
    .limit(input.limit ?? 200);

  return rows.map(rowToPromise);
}

export type RecordPromiseOutcomeInput = {
  companyId: string;
  promiseId: string;
  outcome: Extract<
    PromiseOutcome,
    "kept" | "partially_kept" | "late" | "broken" | "superseded" | "disputed"
  >;
  actualPaymentId?: string;
  actualPaymentDate?: Date;
  actualAmountReceived?: Money;
};

/**
 * Move a pending promise to a terminal (or dispute) state. Idempotent: if
 * the promise is already in a terminal state, returns the existing row
 * unchanged. The supplied outcome is only applied if the row is currently
 * `pending`, preventing concurrent classifiers from clobbering each other.
 */
export async function recordPromiseOutcome(
  handle: DbHandle,
  input: RecordPromiseOutcomeInput,
): Promise<PromiseToPay | null> {
  const updated = await handle
    .update(promiseToPayRecords)
    .set({
      outcome: input.outcome,
      actualPaymentId: input.actualPaymentId ?? null,
      actualPaymentDate: input.actualPaymentDate
        ? input.actualPaymentDate.toISOString().slice(0, 10)
        : null,
      actualAmountReceivedMinor: input.actualAmountReceived?.amountMinor ?? null,
      currency: input.actualAmountReceived?.currency ?? undefined,
    })
    .where(
      and(
        eq(promiseToPayRecords.companyId, input.companyId),
        eq(promiseToPayRecords.id, input.promiseId),
        eq(promiseToPayRecords.outcome, "pending"),
      ),
    )
    .returning();

  if (updated.length === 1) return rowToPromise(updated[0]!);

  // No row updated: either not found, or already terminal. Read back to decide.
  return getPromiseById(handle, { companyId: input.companyId, id: input.promiseId });
}
