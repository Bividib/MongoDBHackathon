/**
 * v1 read-only endpoints consumed by apps/web in demo mode.
 *
 *   GET /v1/forecasts/latest          — most recent CashForecast for the tenant
 *   GET /v1/actions?status=...        — collection actions filtered by status
 *   GET /v1/approvals?status=pending  — approval requests filtered by status
 *
 * Mutations live on the existing /api/* routes (notably
 * POST /api/actions/:id/approve), which the web app calls through the
 * same demo-header tenancy. v1 is a read alias — it intentionally does
 * not duplicate any side-effecting endpoint.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { repositories } from "@runwayops/db";
import type {
  ApprovalStatus,
  CollectionActionStatus,
} from "@runwayops/domain";

import { withinTenant } from "../middleware/tenancy.js";

const {
  getLatestForecast,
  listActionsByStatus,
  listPendingApprovalsForCompany,
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
}
