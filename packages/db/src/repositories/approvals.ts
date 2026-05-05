import { and, desc, eq } from "drizzle-orm";

import type {
  ApprovalDecision,
  ApprovalDecisionKind,
  ApprovalRequest,
  ApprovalStatus,
  ApprovalSubjectKind,
} from "@runwayops/domain";

import { approvalDecisions, approvalRequests } from "../schema/approvals.js";
import {
  deserializeEvidenceRefs,
  serializeEvidenceRefs,
} from "../schema/common.js";
import type { JsonObject } from "../schema/common.js";
import type { DbHandle } from "./tenant.js";

export type ApprovalRequestRow = typeof approvalRequests.$inferSelect;
export type ApprovalDecisionRow = typeof approvalDecisions.$inferSelect;

function rowToApprovalRequest(row: ApprovalRequestRow): ApprovalRequest {
  const baseRequest = {
    id: row.id,
    companyId: row.companyId,
    subjectKind: row.subjectKind as ApprovalSubjectKind,
    subjectId: row.subjectId,
    status: row.status as ApprovalStatus,
    requestedByUserId: row.requestedByUserId ?? undefined,
    assignedApproverId: row.assignedToUserId ?? undefined,
    requestedAt: row.requestedAt,
    expiresAt: row.expiresAt ?? undefined,
    riskSummary: row.riskSummary ?? undefined,
    evidenceRefs: deserializeEvidenceRefs(row.evidenceRefs ?? []) as ApprovalRequest["evidenceRefs"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  if (row.decisionKind && row.decidedAt && row.decidedByUserId) {
    const decision: ApprovalDecision = {
      decision: row.decisionKind as ApprovalDecisionKind,
      decidedByUserId: row.decidedByUserId,
      decidedAt: row.decidedAt,
      ...(row.decisionNote ? { note: row.decisionNote } : {}),
      ...(row.decisionEditedPayload
        ? { editedPayload: row.decisionEditedPayload as JsonObject }
        : {}),
    };
    return { ...baseRequest, decision } as ApprovalRequest;
  }

  return baseRequest as ApprovalRequest;
}

export type CreateApprovalRequestInput = Omit<
  ApprovalRequest,
  "id" | "decision" | "createdAt" | "updatedAt"
> & {
  id?: string;
  /** When the subject is a collection_action, denormalize the FK for hot reads. */
  actionId?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  contentSnapshot?: JsonObject;
  policyChecks?: JsonObject;
  dueAt?: Date;
};

/**
 * Create a fresh `pending` approval request. Idempotency at this layer is
 * left to the caller (workflows derive a deterministic id from the
 * subject id + cycle key — see workflows.md). Returns the persisted shape.
 */
export async function createApprovalRequest(
  handle: DbHandle,
  input: CreateApprovalRequestInput,
): Promise<ApprovalRequest> {
  const values: typeof approvalRequests.$inferInsert = {
    companyId: input.companyId,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    actionId: input.actionId ?? null,
    requestedByUserId: input.requestedByUserId ?? null,
    assignedToUserId: input.assignedApproverId ?? null,
    status: "pending",
    riskLevel: input.riskLevel ?? "medium",
    riskSummary: input.riskSummary ?? null,
    contentSnapshot: input.contentSnapshot ?? {},
    policyChecks: input.policyChecks ?? {},
    evidenceRefs: serializeEvidenceRefs(input.evidenceRefs),
    requestedAt: input.requestedAt,
    expiresAt: input.expiresAt ?? null,
    dueAt: input.dueAt ?? null,
  };
  if (input.id !== undefined) values.id = input.id;

  const inserted = await handle.insert(approvalRequests).values(values).returning();
  if (inserted.length !== 1) throw new Error("createApprovalRequest: insert returned no row");
  return rowToApprovalRequest(inserted[0]!);
}

export type RecordApprovalDecisionInput = {
  companyId: string;
  approvalRequestId: string;
  decision: ApprovalDecisionKind;
  decidedByUserId: string;
  decidedAt: Date;
  note?: string;
  editedPayload?: JsonObject;
};

/**
 * Record a decision against a pending approval request. Atomic at the row
 * level: only updates if the request is currently `pending`, so concurrent
 * approvers cannot clobber each other. Returns the new persisted state, or
 * null if the request was not pending. Also writes a row to the decision
 * history table for tamper-evident audit (the latest decision lives both
 * inline on `approval_requests` for hot reads and in the append-only
 * `approval_decisions` table for full history).
 */
export async function recordApprovalDecision(
  handle: DbHandle,
  input: RecordApprovalDecisionInput,
): Promise<ApprovalRequest | null> {
  const newStatus: ApprovalStatus =
    input.decision === "approved"
      ? "approved"
      : input.decision === "edited"
        ? "edited"
        : "rejected";

  const updated = await handle
    .update(approvalRequests)
    .set({
      status: newStatus,
      decisionKind: input.decision,
      decidedByUserId: input.decidedByUserId,
      decidedAt: input.decidedAt,
      decisionNote: input.note ?? null,
      decisionEditedPayload: input.editedPayload ?? null,
    })
    .where(
      and(
        eq(approvalRequests.companyId, input.companyId),
        eq(approvalRequests.id, input.approvalRequestId),
        eq(approvalRequests.status, "pending"),
      ),
    )
    .returning();

  if (updated.length !== 1) return null;

  await handle.insert(approvalDecisions).values({
    companyId: input.companyId,
    approvalRequestId: input.approvalRequestId,
    decidedByUserId: input.decidedByUserId,
    decision: input.decision,
    decidedAt: input.decidedAt,
    reason: input.note ?? null,
    editedContent: input.editedPayload ?? null,
  });

  return rowToApprovalRequest(updated[0]!);
}

/**
 * Read the workflow_id stored on an approval_request's content_snapshot.
 * Returns null when the row doesn't exist or wasn't created by a
 * workflow-scoped activity (legacy rows, manual API-created approvals).
 * Used by the API approve endpoint to know which Temporal workflow
 * should receive the approvalGrantedSignal.
 */
export async function getApprovalRequestWorkflowId(
  handle: DbHandle,
  input: { companyId: string; id: string },
): Promise<string | null> {
  const rows = await handle
    .select({ contentSnapshot: approvalRequests.contentSnapshot })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.companyId, input.companyId),
        eq(approvalRequests.id, input.id),
      ),
    )
    .limit(1);
  if (rows.length !== 1) return null;
  const snapshot = rows[0]!.contentSnapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const workflowId = (snapshot as Record<string, unknown>)["workflowId"];
  return typeof workflowId === "string" && workflowId.length > 0 ? workflowId : null;
}

export async function getApprovalRequestById(
  handle: DbHandle,
  input: { companyId: string; id: string },
): Promise<ApprovalRequest | null> {
  const rows = await handle
    .select()
    .from(approvalRequests)
    .where(
      and(eq(approvalRequests.companyId, input.companyId), eq(approvalRequests.id, input.id)),
    )
    .limit(1);
  return rows.length === 1 ? rowToApprovalRequest(rows[0]!) : null;
}

export async function listPendingApprovalsForCompany(
  handle: DbHandle,
  input: {
    companyId: string;
    assigneeUserId?: string;
    limit?: number;
    offset?: number;
  },
): Promise<ApprovalRequest[]> {
  const conditions = [
    eq(approvalRequests.companyId, input.companyId),
    eq(approvalRequests.status, "pending"),
  ];
  if (input.assigneeUserId) {
    conditions.push(eq(approvalRequests.assignedToUserId, input.assigneeUserId));
  }
  const rows = await handle
    .select()
    .from(approvalRequests)
    .where(and(...conditions))
    .orderBy(desc(approvalRequests.requestedAt))
    .limit(input.limit ?? 100)
    .offset(input.offset ?? 0);
  return rows.map(rowToApprovalRequest);
}
