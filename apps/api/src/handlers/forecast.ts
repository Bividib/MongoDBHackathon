/**
 * GET /api/forecast/today — latest forecast for the active tenant.
 */
import type { FastifyInstance } from "fastify";

import { repositories } from "@runwayops/db";

import { withinTenant } from "../middleware/tenancy.js";

const { getLatestForecast } = repositories;

export async function forecastRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/forecast/today", async (request, reply) => {
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
}
