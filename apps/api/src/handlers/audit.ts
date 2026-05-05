/**
 * GET /api/audit?targetKind=&targetId= — query audit timeline
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { repositories } from "@runwayops/db";
import type { AuditTargetKind } from "@runwayops/domain";

import { withinTenant } from "../middleware/tenancy.js";

const { listAuditEventsForTarget } = repositories;

const auditQuerySchema = z.object({
  targetKind: z.string().min(1),
  targetId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/audit", async (request, reply) => {
    const ctx = request.tenantCtx!;
    const query = auditQuerySchema.safeParse(request.query);

    if (!query.success) {
      return reply.status(400).send({
        ok: false,
        error: { code: "BAD_REQUEST", message: "targetKind and targetId are required", statusCode: 400 },
      });
    }

    const { targetKind, targetId, limit } = query.data;

    const events = await withinTenant(ctx.companyId, async (tx) => {
      return listAuditEventsForTarget(tx, {
        companyId: ctx.companyId,
        targetKind: targetKind as AuditTargetKind,
        targetId,
        ...(limit !== undefined ? { limit } : {}),
      });
    });

    return reply.status(200).send({ ok: true, data: events });
  });
}
