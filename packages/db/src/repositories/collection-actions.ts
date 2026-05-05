import { and, desc, eq } from "drizzle-orm";

import {
  type CollectionAction,
  type CollectionActionChannel,
  type CollectionActionExecutionResult,
  type CollectionActionKind,
  type CollectionActionStatus,
  type CollectionActionTone,
  type Money,
  money,
  type RankingSnapshot,
} from "@runwayops/domain";

import { collectionActionResults, collectionActions } from "../schema/actions.js";
import {
  deserializeEvidenceRefs,
  serializeEvidenceRefs,
  type JsonObject,
} from "../schema/common.js";
import type { DbHandle } from "./tenant.js";

export type CollectionActionRow = typeof collectionActions.$inferSelect;
export type CollectionActionResultRow = typeof collectionActionResults.$inferSelect;

function toMoney(amountMinor: bigint | null, currency: string | null): Money | undefined {
  if (amountMinor === null || amountMinor === undefined || !currency) return undefined;
  return money(amountMinor.toString(), currency);
}

function rowToCollectionAction(row: CollectionActionRow): CollectionAction {
  return {
    id: row.id,
    companyId: row.companyId,
    customerId: row.customerId ?? undefined,
    invoiceId: row.invoiceId ?? undefined,
    promiseToPayId: row.promiseId ?? undefined,
    actionKind: row.actionKind as CollectionActionKind,
    channel: row.channel as CollectionActionChannel,
    tone: (row.tone as CollectionActionTone | null) ?? undefined,
    status: row.status as CollectionActionStatus,
    priorityScore: Number(row.priorityScore),
    expectedCashImpact: toMoney(row.expectedCashImpactMinor, row.currency ?? "GBP"),
    probabilityOfPayment:
      row.probabilityOfPayment !== null ? Number(row.probabilityOfPayment) : undefined,
    evidenceConfidence: Number(row.evidenceConfidence),
    relationshipRiskPenalty: Number(row.relationshipRiskPenalty),
    actionEffortPenalty: Number(row.actionEffortPenalty),
    requiresApproval: row.requiresApproval,
    approvalId: row.approvalId ?? undefined,
    recommendedAt: row.recommendedAt,
    dueAt: row.dueAt,
    approvedAt: row.approvedAt,
    rejectedAt: row.rejectedAt,
    executedAt: row.executedAt,
    completedAt: row.completedAt,
    reason: row.reason,
    draftMessageId: row.draftMessageId ?? undefined,
    assignedToUserId: row.assignedToUserId ?? undefined,
    evidenceRefs: deserializeEvidenceRefs(row.evidenceRefs ?? []) as CollectionAction["evidenceRefs"],
    rankingSnapshot: (row.rankingSnapshot as RankingSnapshot | undefined) ?? undefined,
    metadata: (row.metadata as JsonObject | undefined) ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToExecutionResult(
  row: CollectionActionResultRow,
): CollectionActionExecutionResult {
  return {
    id: row.id,
    companyId: row.companyId,
    actionId: row.actionId,
    attemptNumber: row.attemptNumber,
    dispatchedAt: row.dispatchedAt,
    deliveredAt: row.deliveredAt,
    outcome: row.outcome as CollectionActionExecutionResult["outcome"],
    externalMessageId: row.externalMessageId ?? undefined,
    idempotencyKey: row.idempotencyKey,
    errorMessage: row.errorMessage ?? undefined,
    metadata: (row.metadata as JsonObject | undefined) ?? undefined,
    createdAt: row.createdAt,
  };
}

export type InsertCollectionActionInput = Omit<
  CollectionAction,
  "id" | "createdAt" | "updatedAt"
> & { id?: string };

/**
 * Persist a freshly proposed (or already-approved) collection action. Status
 * defaults to "proposed" if not specified. The caller must have set the
 * tenant GUC via `withTenant`.
 */
export async function insertCollectionAction(
  handle: DbHandle,
  input: InsertCollectionActionInput,
): Promise<CollectionAction> {
  const values: typeof collectionActions.$inferInsert = {
    companyId: input.companyId,
    customerId: input.customerId ?? null,
    invoiceId: input.invoiceId ?? null,
    promiseId: input.promiseToPayId ?? null,
    actionKind: input.actionKind,
    channel: input.channel,
    tone: input.tone ?? null,
    status: input.status,
    priorityScore: input.priorityScore.toFixed(4),
    expectedCashImpactMinor: input.expectedCashImpact?.amountMinor ?? null,
    currency: input.expectedCashImpact?.currency ?? null,
    probabilityOfPayment:
      input.probabilityOfPayment !== undefined ? input.probabilityOfPayment.toFixed(4) : null,
    evidenceConfidence: input.evidenceConfidence.toFixed(4),
    relationshipRiskPenalty: input.relationshipRiskPenalty.toFixed(4),
    actionEffortPenalty: input.actionEffortPenalty.toFixed(4),
    requiresApproval: input.requiresApproval,
    approvalId: input.approvalId ?? null,
    reason: input.reason,
    draftMessageId: input.draftMessageId ?? null,
    assignedToUserId: input.assignedToUserId ?? null,
    evidenceRefs: serializeEvidenceRefs(input.evidenceRefs),
    rankingSnapshot: input.rankingSnapshot as JsonObject | undefined,
    metadata: input.metadata,
    recommendedAt: input.recommendedAt,
    dueAt: input.dueAt,
    approvedAt: input.approvedAt,
    rejectedAt: input.rejectedAt,
    executedAt: input.executedAt,
    completedAt: input.completedAt,
  };
  if (input.id !== undefined) values.id = input.id;

  const inserted = await handle.insert(collectionActions).values(values).returning();
  if (inserted.length !== 1) throw new Error("insertCollectionAction: insert returned no row");
  return rowToCollectionAction(inserted[0]!);
}

/**
 * Atomic status transition. Only applies when the current status matches
 * `from`, preventing concurrent transitions from clobbering each other.
 * Returns the new persisted state or null if the transition was rejected.
 */
export async function transitionCollectionActionStatus(
  handle: DbHandle,
  input: {
    companyId: string;
    actionId: string;
    from: CollectionActionStatus;
    to: CollectionActionStatus;
    timestamps?: Partial<
      Pick<CollectionAction, "approvedAt" | "rejectedAt" | "executedAt" | "completedAt">
    >;
  },
): Promise<CollectionAction | null> {
  const set: Partial<typeof collectionActions.$inferInsert> = { status: input.to };
  if (input.timestamps?.approvedAt !== undefined) set.approvedAt = input.timestamps.approvedAt;
  if (input.timestamps?.rejectedAt !== undefined) set.rejectedAt = input.timestamps.rejectedAt;
  if (input.timestamps?.executedAt !== undefined) set.executedAt = input.timestamps.executedAt;
  if (input.timestamps?.completedAt !== undefined)
    set.completedAt = input.timestamps.completedAt;

  const updated = await handle
    .update(collectionActions)
    .set(set)
    .where(
      and(
        eq(collectionActions.companyId, input.companyId),
        eq(collectionActions.id, input.actionId),
        eq(collectionActions.status, input.from),
      ),
    )
    .returning();

  return updated.length === 1 ? rowToCollectionAction(updated[0]!) : null;
}

export async function getCollectionActionById(
  handle: DbHandle,
  input: { companyId: string; id: string },
): Promise<CollectionAction | null> {
  const rows = await handle
    .select()
    .from(collectionActions)
    .where(
      and(eq(collectionActions.companyId, input.companyId), eq(collectionActions.id, input.id)),
    )
    .limit(1);
  return rows.length === 1 ? rowToCollectionAction(rows[0]!) : null;
}

export async function listActionsByStatus(
  handle: DbHandle,
  input: {
    companyId: string;
    status: CollectionActionStatus;
    limit?: number;
    offset?: number;
  },
): Promise<CollectionAction[]> {
  const rows = await handle
    .select()
    .from(collectionActions)
    .where(
      and(
        eq(collectionActions.companyId, input.companyId),
        eq(collectionActions.status, input.status),
      ),
    )
    .orderBy(desc(collectionActions.priorityScore))
    .limit(input.limit ?? 100)
    .offset(input.offset ?? 0);
  return rows.map(rowToCollectionAction);
}

/**
 * Append a per-attempt dispatch outcome. Idempotent: the
 * (action_id, idempotency_key) unique constraint causes a re-insert with
 * the same key to no-op; this helper returns the prior row in that case.
 */
export async function recordExecutionResult(
  handle: DbHandle,
  input: Omit<CollectionActionExecutionResult, "id" | "createdAt"> & { id?: string },
): Promise<CollectionActionExecutionResult> {
  const values: typeof collectionActionResults.$inferInsert = {
    companyId: input.companyId,
    actionId: input.actionId,
    attemptNumber: input.attemptNumber,
    dispatchedAt: input.dispatchedAt,
    deliveredAt: input.deliveredAt,
    outcome: input.outcome,
    externalMessageId: input.externalMessageId ?? null,
    idempotencyKey: input.idempotencyKey,
    errorMessage: input.errorMessage ?? null,
    metadata: input.metadata,
  };
  if (input.id !== undefined) values.id = input.id;

  const inserted = await handle
    .insert(collectionActionResults)
    .values(values)
    .onConflictDoNothing({
      target: [collectionActionResults.actionId, collectionActionResults.idempotencyKey],
    })
    .returning();

  if (inserted.length === 1) return rowToExecutionResult(inserted[0]!);

  const existing = await handle
    .select()
    .from(collectionActionResults)
    .where(
      and(
        eq(collectionActionResults.actionId, input.actionId),
        eq(collectionActionResults.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    throw new Error("recordExecutionResult: conflict but row not visible (RLS or cross-tenant)");
  }
  return rowToExecutionResult(existing[0]!);
}

export async function listExecutionResultsForAction(
  handle: DbHandle,
  input: { companyId: string; actionId: string; limit?: number },
): Promise<CollectionActionExecutionResult[]> {
  const rows = await handle
    .select()
    .from(collectionActionResults)
    .where(
      and(
        eq(collectionActionResults.companyId, input.companyId),
        eq(collectionActionResults.actionId, input.actionId),
      ),
    )
    .orderBy(desc(collectionActionResults.attemptNumber))
    .limit(input.limit ?? 50);
  return rows.map(rowToExecutionResult);
}
