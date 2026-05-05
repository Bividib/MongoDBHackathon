/**
 * Idempotency middleware for state-changing endpoints (POST/PUT/PATCH).
 *
 * Reads Idempotency-Key header. Uses reserveIdempotencyKey +
 * completeIdempotencyKey from @runwayops/db. Replays return the cached
 * response with no side effects.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";

import { repositories } from "@runwayops/db";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

import { withinTenant } from "./tenancy.js";

const { reserveIdempotencyKey, completeIdempotencyKey } = repositories;

const METHODS_REQUIRING_KEY = new Set(["POST", "PUT", "PATCH"]);

/**
 * Hook that enforces idempotency on mutation endpoints.
 * Attach as a preHandler on tenant-scoped routes.
 */
export async function idempotencyHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (reply.sent) return;
  if (!METHODS_REQUIRING_KEY.has(request.method)) return;

  const key = request.headers["idempotency-key"] as string | undefined;
  if (!key) {
    return reply.status(400).send({
      ok: false,
      error: { code: "MISSING_IDEMPOTENCY_KEY", message: "Idempotency-Key header required for state-changing requests", statusCode: 400 },
    });
  }

  const ctx = request.tenantCtx;
  if (!ctx) return; // tenancy middleware already rejected

  const requestHash = hashRequest(request);

  const result = await withinTenant(ctx.companyId, async (tx) => {
    return reserveIdempotencyKey(tx, {
      companyId: ctx.companyId,
      scope: request.url,
      key,
      requestHash,
    });
  });

  if (result.kind === "replay" && result.row.responseJson) {
    reply.status(result.row.statusCode ?? 200).send(result.row.responseJson);
    return;
  }

  if (result.kind === "conflict") {
    return reply.status(409).send({
      ok: false,
      error: { code: "IDEMPOTENCY_CONFLICT", message: "Idempotency key reused with different request body", statusCode: 409 },
    });
  }

  // kind === "fresh" — stash key info for completeIdempotencyKey in onSend
  (request as unknown as Record<string, unknown>).__idempotencyScope = request.url;
  (request as unknown as Record<string, unknown>).__idempotencyKey = key;
}

/**
 * onSend hook: persist the response into the idempotency_keys row so
 * future replays can return it without re-executing.
 */
export async function idempotencyOnSend(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: string,
): Promise<string> {
  const key = (request as unknown as Record<string, unknown>).__idempotencyKey as string | undefined;
  const scope = (request as unknown as Record<string, unknown>).__idempotencyScope as string | undefined;
  const ctx = request.tenantCtx;

  if (!key || !scope || !ctx) return payload;

  let responseJson: JsonObject = {};
  try {
    responseJson = JSON.parse(payload) as JsonObject;
  } catch {
    responseJson = { raw: payload } as unknown as JsonObject;
  }

  await withinTenant(ctx.companyId, async (tx) => {
    await completeIdempotencyKey(tx, {
      companyId: ctx.companyId,
      scope,
      key,
      responseJson,
      statusCode: reply.statusCode,
    });
  });

  return payload;
}

function hashRequest(request: FastifyRequest): string {
  const body = JSON.stringify(request.body ?? {});
  return createHash("sha256").update(`${request.method}:${request.url}:${body}`).digest("hex");
}
