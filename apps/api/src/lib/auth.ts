/**
 * Lightweight auth/tenant resolution.
 *
 * In this skeleton we resolve from headers (X-User-Email / X-Company-Id).
 * Production will swap in JWT/session-based auth (Clerk/WorkOS). The contract
 * is stable: resolveRequestContext returns { userId, companyId } or throws.
 */
import type { FastifyRequest } from "fastify";

import { repositories } from "@runwayops/db";

type DbHandle = repositories.DbHandle;

export type RequestContext = {
  userId: string;
  companyId: string;
  email: string;
};

/**
 * Resolve authenticated user + tenant from request headers.
 * Returns null if the request is unauthenticated.
 */
export async function resolveRequestContext(
  request: FastifyRequest,
  db: DbHandle | null,
): Promise<RequestContext | null> {
  const email = request.headers["x-user-email"] as string | undefined;
  const companyId = request.headers["x-company-id"] as string | undefined;

  if (!email || !companyId) {
    return null;
  }

  // In production: validate session/JWT, look up user, check membership.
  // For the skeleton, trust the headers (guarded by gateway/auth service).
  const user = await lookupUserByEmail(db as DbHandle, email);
  if (!user) return null;

  // In stub mode (no real DB), trust the header-supplied companyId.
  // In production, the membership query verifies the user belongs to the company.
  const memberships = await listMembershipsForUser(db as DbHandle, user.id);
  const match = memberships.find((m) => m.companyId === companyId || m.companyId === "__any__");
  if (!match) return null;

  return { userId: user.id, companyId, email };
}

// ---------------------------------------------------------------------------
// Thin inline repos (lives closer to auth boundary, not in @runwayops/db)
// ---------------------------------------------------------------------------

export type UserRecord = { id: string; email: string };
export type MembershipRecord = { userId: string; companyId: string; role: string };

/**
 * Look up a user row by email. Uses the DB handle directly — this query
 * runs BEFORE withTenant (it is cross-tenant by design) so requires
 * BYPASSRLS or a table policy that allows email lookup.
 *
 * The migration 0001 grants the app role SELECT on users with a policy that
 * allows lookup when the user has a membership in the active GUC company.
 * For initial resolution (no GUC yet), the API gateway / auth service
 * sets headers after JWT validation. We trust those headers in this layer.
 */
export async function lookupUserByEmail(
  _db: DbHandle,
  email: string,
): Promise<UserRecord | null> {
  // Stub: in production, SELECT from users WHERE email = $1
  // For the skeleton, synthesize a deterministic user id from email
  if (!email) return null;
  return { id: `user_${email.replace(/[^a-z0-9]/gi, "_")}`, email };
}

export async function listMembershipsForUser(
  _db: DbHandle,
  userId: string,
): Promise<MembershipRecord[]> {
  // Stub: in production, query memberships table (BYPASSRLS or pre-GUC).
  // For skeleton, trust the header-supplied companyId — membership check
  // is effectively delegated to the auth gateway.
  if (!userId) return [];
  // Return a synthetic membership allowing any companyId (header-validated)
  return [{ userId, companyId: "__any__", role: "admin" }];
}
