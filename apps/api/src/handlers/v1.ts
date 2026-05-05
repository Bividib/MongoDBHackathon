/**
 * v1 endpoints consumed by apps/web in demo mode.
 *
 *   GET  /v1/forecasts/latest          — most recent CashForecast for the tenant
 *   GET  /v1/actions?status=...        — collection actions filtered by status
 *   GET  /v1/approvals?status=pending  — approval requests filtered by status
 *   POST /v1/approvals/:id/approve     — record decision + emit outbox event
 *                                        for the dispatcher to forward as a
 *                                        Temporal signal to the originating
 *                                        workflow.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { repositories } from "@runwayops/db";
import type {
  ApprovalStatus,
  CollectionActionStatus,
} from "@runwayops/domain";

import { withinTenant } from "../middleware/tenancy.js";
import { ok, fail, notFound, type CommandResult } from "../lib/errors.js";

const {
  getLatestForecast,
  listActionsByStatus,
  listPendingApprovalsForCompany,
  getApprovalRequestById,
  getApprovalRequestWorkflowId,
  recordApprovalDecision,
  appendAuditEvent,
  enqueueOutbox,
} = repositories;

const actionStatusSchema = z.object({
  status: z.string().optional(),
});

const approvalStatusSchema = z.object({
  status: z.string().optional(),
});

export async function v1Routes(app: FastifyInstance): Promise<void> {
  app.get("/v1/forecasts/latest", async (request, reply) => {
    const ctx = request.tenantCtx!;

    const forecast = await withinTenant(ctx.companyId, async (tx) => {
      return getLatestForecast(tx, { companyId: ctx.companyId });
    });

    if (!forecast) {
      return reply.status(404).send({
        ok: false,
        error: { code: "NOT_FOUND", message: "No forecast available", statusCode: 404 },
      });
    }

    return reply.status(200).send({ ok: true, data: forecast });
  });

  app.get("/v1/actions", async (request, reply) => {
    const ctx = request.tenantCtx!;
    const query = actionStatusSchema.parse(request.query);
    const status = (query.status ?? "awaiting_approval") as CollectionActionStatus;

    const actions = await withinTenant(ctx.companyId, async (tx) => {
      return listActionsByStatus(tx, { companyId: ctx.companyId, status });
    });

    return reply.status(200).send({ ok: true, data: actions });
  });

  app.get("/v1/approvals", async (request, reply) => {
    const ctx = request.tenantCtx!;
    const query = approvalStatusSchema.parse(request.query);
    const status = (query.status ?? "pending") as ApprovalStatus;

    // Only "pending" is supported in demo mode — the inbox screen only
    // lists pending approvals. Other statuses return an empty array
    // rather than 400 so the web client can pass any value defensively.
    if (status !== "pending") {
      return reply.status(200).send({ ok: true, data: [] });
    }

    const approvals = await withinTenant(ctx.companyId, async (tx) => {
      return listPendingApprovalsForCompany(tx, { companyId: ctx.companyId });
    });

    return reply.status(200).send({ ok: true, data: approvals });
  });

  // POST /v1/approvals/:id/approve
  //
  // Records the decision in the DB and writes a "approval.granted"
  // outbox event carrying the originating workflowId. The workers'
  // dispatcher → Temporal-signal handler (separate slice) forwards
  // that outbox event to the running workflow as
  // `approvalGrantedSignal({ approvalRequestId, ... })`. The split
  // keeps the API HTTP-bounded and unaware of Temporal internals.
  //
  // Failure shape: 422 if the approval is already decided or if
  // workflowId is missing from the approval's content_snapshot
  // (means the approval was created before the activity captured
  // workflow context — these need manual handling, not silent skip).
  app.post<{ Params: { id: string }; Body: unknown }>(
    "/v1/approvals/:id/approve",
    async (request, reply) => {
      const ctx = request.tenantCtx!;
      const { id } = request.params;
      const body = approveBodySchema.parse(request.body ?? {});

      const result: CommandResult<unknown> = await withinTenant(
        ctx.companyId,
        async (tx) => {
          const existing = await getApprovalRequestById(tx, {
            companyId: ctx.companyId,
            id,
          });
          if (!existing) return notFound("approval_request", id);
          if (existing.status !== "pending") {
            return fail(
              "INVALID_TRANSITION",
              `Approval ${id} is in '${existing.status}' state and cannot be approved again`,
              422,
            );
          }

          const workflowId = await getApprovalRequestWorkflowId(tx, {
            companyId: ctx.companyId,
            id,
          });
          if (!workflowId) {
            return fail(
              "MISSING_WORKFLOW_ID",
              "Approval was not created with a workflow context; cannot signal a workflow to advance",
              422,
            );
          }

          const now = new Date();
          const decisionInput: Parameters<typeof recordApprovalDecision>[1] = {
            companyId: ctx.companyId,
            approvalRequestId: id,
            decision: "approved",
            decidedByUserId: ctx.userId,
            decidedAt: now,
          };
          if (body.note !== undefined) decisionInput.note = body.note;
          const updated = await recordApprovalDecision(tx, decisionInput);
          if (!updated) {
            // recordApprovalDecision returns null on race (someone else
            // moved it out of pending between the read above and the
            // update). Surface as 422 rather than masking.
            return fail(
              "INVALID_TRANSITION",
              "Approval was decided concurrently",
              422,
            );
          }

          await appendAuditEvent(tx, {
            companyId: ctx.companyId,
            actorType: "user",
            actorId: ctx.userId,
            action: "approval.granted",
            targetKind: "approval",
            targetId: id,
            occurredAt: now,
            summary: `Approval ${id} granted by ${ctx.email}${body.note ? `: ${body.note}` : ""}`,
            evidenceRefs: [{ kind: "approval", id }],
          });

          await enqueueOutbox(tx, {
            companyId: ctx.companyId,
            eventType: "approval.granted",
            aggregateType: "approval",
            aggregateId: id,
            payload: {
              approvalRequestId: id,
              workflowId,
              decision: "approved",
              decidedByUserId: ctx.userId,
              decidedAtIso: now.toISOString(),
            },
            idempotencyKey: `approval.granted:${id}:${ctx.userId}`,
          });

          return ok(updated);
        },
      );

      if (!result.ok) {
        return reply.status(result.error.statusCode).send(result);
      }
      return reply.status(200).send(result);
    },
  );
}

const approveBodySchema = z.object({
  note: z.string().optional(),
});
