/**
 * GET  /api/promises                  — list pending promises for tenant
 * POST /api/promises/:id/mark-fulfilled — mark a promise as kept
 */
import type { FastifyInstance } from "fastify";

import { repositories } from "@runwayops/db";

import { withinTenant } from "../middleware/tenancy.js";
import { ok, notFound, fail, type CommandResult } from "../lib/errors.js";

const { listPendingPromisesForCompany, getPromiseById, recordPromiseOutcome, appendAuditEvent, enqueueOutbox } = repositories;

export async function promiseRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/promises
  app.get("/api/promises", async (request, reply) => {
    const ctx = request.tenantCtx!;

    const promises = await withinTenant(ctx.companyId, async (tx) => {
      return listPendingPromisesForCompany(tx, { companyId: ctx.companyId });
    });

    return reply.status(200).send({ ok: true, data: promises });
  });

  // POST /api/promises/:id/mark-fulfilled
  app.post<{ Params: { id: string } }>("/api/promises/:id/mark-fulfilled", async (request, reply) => {
    const ctx = request.tenantCtx!;
    const { id } = request.params;

    const result: CommandResult<unknown> = await withinTenant(ctx.companyId, async (tx) => {
      const promise = await getPromiseById(tx, { companyId: ctx.companyId, id });
      if (!promise) return notFound("promise", id);

      if (promise.outcome !== "pending") {
        return fail("INVALID_STATE", "Promise is not pending", 422);
      }

      const updated = await recordPromiseOutcome(tx, {
        companyId: ctx.companyId,
        promiseId: id,
        outcome: "kept",
        actualPaymentDate: new Date(),
      });

      await appendAuditEvent(tx, {
        companyId: ctx.companyId,
        actorType: "user",
        actorId: ctx.userId,
        action: "promise.marked_fulfilled",
        targetKind: "promise_to_pay",
        targetId: id,
        occurredAt: new Date(),
        summary: `Promise ${id} marked fulfilled by ${ctx.email}`,
        evidenceRefs: [{ kind: "promise_to_pay", id }],
      });

      await enqueueOutbox(tx, {
        companyId: ctx.companyId,
        eventType: "promise.outcome_classified",
        aggregateType: "promise_to_pay",
        aggregateId: id,
        payload: { promiseId: id, outcome: "kept" },
        idempotencyKey: `promise.kept:${id}`,
      });

      return ok(updated);
    });

    if (!result.ok) {
      return reply.status(result.error.statusCode).send(result);
    }
    return reply.status(200).send(result);
  });
}
