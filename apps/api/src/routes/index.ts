/**
 * Route registration — all tenant-scoped routes + public health endpoints.
 */
import type { FastifyInstance } from "fastify";

import { tenancyGuard, tenancyErrorHandler } from "../middleware/tenancy.js";
import { idempotencyHook, idempotencyOnSend } from "../middleware/idempotency.js";
import { healthRoutes } from "../handlers/health.js";
import { forecastRoutes } from "../handlers/forecast.js";
import { actionRoutes } from "../handlers/actions.js";
import { promiseRoutes } from "../handlers/promises.js";
import { auditRoutes } from "../handlers/audit.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Public endpoints — NOT tenant-scoped
  await app.register(healthRoutes);

  // Tenant-scoped routes
  await app.register(async (tenantApp) => {
    // Error handler for this encapsulated context
    tenantApp.setErrorHandler(tenancyErrorHandler);

    // Tenancy guard — must run before any handler
    tenantApp.addHook("onRequest", tenancyGuard);

    // Idempotency on mutation endpoints
    tenantApp.addHook("preHandler", idempotencyHook);
    tenantApp.addHook("onSend", idempotencyOnSend);

    // Domain routes
    await tenantApp.register(forecastRoutes);
    await tenantApp.register(actionRoutes);
    await tenantApp.register(promiseRoutes);
    await tenantApp.register(auditRoutes);
  });
}
