/**
 * GET  /api/actions?status=...      — list collection actions by status
 * POST /api/actions/:id/approve     — approve action (flips status only)
 * POST /api/actions/:id/reject      — reject action
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { repositories } from "@runwayops/db";
import type { CollectionAction, CollectionActionStatus } from "@runwayops/domain";
import { evaluatePolicy } from "@runwayops/policy";

import { withinTenant } from "../middleware/tenancy.js";
import { ok, fail, notFound, type CommandResult } from "../lib/errors.js";

const { listActionsByStatus, getCollectionActionById, transitionCollectionActionStatus, appendAuditEvent, enqueueOutbox } = repositories;

/**
 * Evaluate the deterministic policy engine on the HYPOTHETICAL post-approval
 * shape of an action, before flipping its status. This catches actions that
 * could never legally dispatch (missing evidence, payment-initiation kinds,
 * obligation-safety claims) and refuses the approval at the API layer
 * rather than letting them sit in "approved" state for the workers to
 * refuse at dispatch time.
 *
 * approval=undefined because the API does not yet maintain a separate
 * ApprovalRequest entity per state flip. The TTL rule
 * (rejectIfApprovalExpired) skips when approval is undefined — correct
 * here since we are creating fresh approval state.
 */
function evaluateApproval(
  action: CollectionAction,
  approverActorId: string,
  now: Date,
) {
  const hypotheticalApprovedAction: CollectionAction = {
    ...action,
    status: "approved",
    approvedAt: now,
  };
  return evaluatePolicy(hypotheticalApprovedAction, {
    approval: undefined,
    proposerActorId: action.assignedToUserId ?? "system",
    approverActorId,
    now,
  });
}

const statusQuerySchema = z.object({
  status: z.string().optional(),
});

const decisionBodySchema = z.object({
  note: z.string().optional(),
});

export async function actionRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/actions
  app.get("/api/actions", async (request, reply) => {
    const ctx = request.tenantCtx!;
    const query = statusQuerySchema.parse(request.query);
    const status = (query.status ?? "proposed") as CollectionActionStatus;

    const actions = await withinTenant(ctx.companyId, async (tx) => {
      return listActionsByStatus(tx, { companyId: ctx.companyId, status });
    });

    return reply.status(200).send({ ok: true, data: actions });
  });

  // POST /api/actions/:id/approve
  app.post<{ Params: { id: string } }>("/api/actions/:id/approve", async (request, reply) => {
    const ctx = request.tenantCtx!;
    const { id } = request.params;
    const body = decisionBodySchema.parse(request.body ?? {});

    const result: CommandResult<unknown> = await withinTenant(ctx.companyId, async (tx) => {
      const action = await getCollectionActionById(tx, { companyId: ctx.companyId, id });
      if (!action) return notFound("collection_action", id);

      // Deterministic policy gate (first refusal layer; the workers are
      // the second). Refuses approval if the action could never legally
      // dispatch — missing evidence, payment-initiation kind, or
      // obligation-safety claim text.
      const now = new Date();
      const verdict = evaluateApproval(action, ctx.userId, now);
      if (!verdict.allowed) {
        // Audit the refusal so the timeline shows why approval was blocked.
        await appendAuditEvent(tx, {
          companyId: ctx.companyId,
          actorType: "user",
          actorId: ctx.userId,
          action: "collection_action.approval_denied_by_policy",
          targetKind: "collection_action",
          targetId: id,
          occurredAt: now,
          summary: `Approval denied by policy rule "${verdict.rule}": ${verdict.reason}`,
          evidenceRefs: [{ kind: "collection_action", id }],
        });
        return fail("POLICY_DENIED", `${verdict.rule}: ${verdict.reason}`, 422);
      }

      // Hard refusal: API never initiates payment or sends externally.
      // Approval flips status only; dispatch is workers' job, gated again
      // by mintGatePass at the connector chokepoint.
      const updated = await transitionCollectionActionStatus(tx, {
        companyId: ctx.companyId,
        actionId: id,
        from: action.status as CollectionActionStatus,
        to: "approved",
      });
      if (!updated) return fail("INVALID_TRANSITION", "Cannot approve action in current status", 422);

      await appendAuditEvent(tx, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.userId,
        action: "collection_action.approved",
        targetKind: "collection_action",
        targetId: id,
        occurredAt: now,
        summary: `Action ${id} approved by ${ctx.email}${body.note ? `: ${body.note}` : ""}`,
        evidenceRefs: [{ kind: "collection_action", id }],
      });

      await enqueueOutbox(tx, {
        companyId: ctx.companyId,
        eventType: "collection_action.approved",
        aggregateType: "collection_action",
        aggregateId: id,
        payload: { actionId: id, approvedBy: ctx.userId },
        idempotencyKey: `collection_action.approved:${id}:${ctx.userId}`,
      });

      return ok(updated);
    });

    if (!result.ok) {
      return reply.status(result.error.statusCode).send(result);
    }
    return reply.status(200).send(result);
  });

  // POST /api/actions/:id/reject
  app.post<{ Params: { id: string } }>("/api/actions/:id/reject", async (request, reply) => {
    const ctx = request.tenantCtx!;
    const { id } = request.params;
    const body = decisionBodySchema.parse(request.body ?? {});

    const result: CommandResult<unknown> = await withinTenant(ctx.companyId, async (tx) => {
      const action = await getCollectionActionById(tx, { companyId: ctx.companyId, id });
      if (!action) return notFound("collection_action", id);

      const updated = await transitionCollectionActionStatus(tx, {
        companyId: ctx.companyId,
        actionId: id,
        from: action.status as CollectionActionStatus,
        to: "rejected",
      });
      if (!updated) return fail("INVALID_TRANSITION", "Cannot reject action in current status", 422);

      await appendAuditEvent(tx, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.userId,
        action: "collection_action.rejected",
        targetKind: "collection_action",
        targetId: id,
        occurredAt: new Date(),
        summary: `Action ${id} rejected by ${ctx.email}${body.note ? `: ${body.note}` : ""}`,
        evidenceRefs: [{ kind: "collection_action", id }],
      });

      await enqueueOutbox(tx, {
        companyId: ctx.companyId,
        eventType: "collection_action.rejected",
        aggregateType: "collection_action",
        aggregateId: id,
        payload: { actionId: id, rejectedBy: ctx.userId },
        idempotencyKey: `collection_action.rejected:${id}:${ctx.userId}`,
      });

      return ok(updated);
    });

    if (!result.ok) {
      return reply.status(result.error.statusCode).send(result);
    }
    return reply.status(200).send(result);
  });
}
