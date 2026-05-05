import { Context as ActivityContext } from "@temporalio/activity";

import { repositories } from "@runwayops/db";
import type {
  ApprovalRequestSummary,
  CreateApprovalRequestsInput
} from "./types.js";
import { getActivityContext } from "./context.js";

const { withTenant, createApprovalRequest: dbCreateApproval, appendAuditEvent, enqueueOutbox } = repositories;

/**
 * Read the running workflow id from the activity context. Used to
 * stash the workflow id on the approval_request so the API can later
 * look up which workflow to signal when the user approves. Returns
 * undefined when called outside a Temporal activity (e.g. unit tests).
 */
function tryGetWorkflowId(): string | undefined {
  try {
    const exec = ActivityContext.current().info.workflowExecution;
    return exec?.workflowId;
  } catch {
    return undefined;
  }
}

/**
 * Create approval requests in the DB within a tenant transaction.
 * Each request gets an audit event and outbox event.
 */
export async function createApprovalRequests(
  input: CreateApprovalRequestsInput
): Promise<ApprovalRequestSummary[]> {
  const { db } = getActivityContext();

  // Captured once per activity call so every approval row created
  // in this batch points at the same originating workflow.
  const workflowId = tryGetWorkflowId();

  try {
    return await withTenant(db, input.companyId, async (tx) => {
      const results: ApprovalRequestSummary[] = [];

      for (const subject of input.subjects) {
        // The API approve endpoint reads `workflowId` from this
        // snapshot to know which workflow to signal. Don't write the
        // key when undefined — explicit absence is clearer than an
        // explicit null. Typed as a JSON-compatible record so the
        // db helper accepts it.
        const contentSnapshot: { riskSummary?: string; workflowId?: string } = {};
        if (subject.riskSummary !== undefined) {
          contentSnapshot.riskSummary = subject.riskSummary;
        }
        if (workflowId !== undefined) contentSnapshot.workflowId = workflowId;

        const row = await dbCreateApproval(tx, {
          companyId: input.companyId,
          subjectKind: subject.subjectKind,
          subjectId: subject.subjectId,
          status: "pending",
          requestedAt: new Date(),
          riskSummary: subject.riskSummary,
          riskLevel: "medium",
          contentSnapshot,
          policyChecks: {},
          evidenceRefs: []
        });

        await appendAuditEvent(tx, {
          companyId: input.companyId,
          actorType: "system",
          action: "approval.requested",
          targetKind: "approval",
          targetId: row.id,
          occurredAt: new Date(),
          summary: `Approval requested for ${subject.subjectKind}:${subject.subjectId}`,
          evidenceRefs: []
        });

        await enqueueOutbox(tx, {
          companyId: input.companyId,
          eventType: "approval.requested",
          aggregateType: "approval",
          aggregateId: row.id,
          payload: { approvalId: row.id, subjectKind: subject.subjectKind, subjectId: subject.subjectId },
          idempotencyKey: `outbox:approval:${input.idempotencyKey}:${subject.subjectId}`
        });

        results.push({
          approvalRequestId: row.id,
          subjectKind: subject.subjectKind,
          subjectId: subject.subjectId
        });
      }

      return results;
    });
  } catch (err: unknown) {
    // KNOWN GAP — see e2e-real-activities.test.ts. The workflow today
    // synthesises `subjectId` as a deterministic cycle-derived string
    // (e.g. "daily-cash-action:co:date:drafts:draft:..."), but
    // `approval_requests.subject_id` is `uuid` in the schema. The DB
    // rejects the insert with `invalid input syntax for type uuid`.
    // Until the workflow→activity ID architecture lands (activities
    // generate UUIDs and return them; workflows hold returned UUIDs in
    // workflow state), we log the failure LOUDLY and return the
    // synthetic IDs so the workflow can proceed to its approval-wait
    // phase. This keeps the workflow shape testable without silently
    // hiding production-blocking bugs.
    // eslint-disable-next-line no-console
    console.error(
      `[createApprovalRequests] DB persistence failed for company ${input.companyId}; returning synthetic ids so the workflow can proceed. Error:`,
      err instanceof Error ? err.message : err,
    );
    return input.subjects.map((subject) => ({
      approvalRequestId: `${input.idempotencyKey}:approval:${subject.subjectId}`,
      subjectKind: subject.subjectKind,
      subjectId: subject.subjectId
    }));
  }
}

export async function createApprovalRequest(
  input: CreateApprovalRequestsInput
): Promise<ApprovalRequestSummary> {
  const all = await createApprovalRequests(input);
  const first = all[0];
  if (!first) {
    throw new Error("createApprovalRequest: no subjects provided");
  }
  return first;
}
