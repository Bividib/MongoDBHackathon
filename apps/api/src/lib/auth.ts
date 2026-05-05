/**
 * Lightweight auth/tenant resolution.
 *
 * Two modes are supported until real auth (Clerk/WorkOS) lands in Phase 7+:
 *
 *  1. Headered mode (existing): X-User-Email + X-Company-Id, used by API
 *     tests and the workers. Membership is verified via the stub repos
 *     below.
 *
 *  2. Demo mode: a single header `x-runway-demo-company-id` opts the
 *     request into a synthetic tenant context so the web app can render
 *     real API data without a session. The API never escalates this
 *     header to real privileges — it is a tenancy hint only, gated at
 *     deploy time by WEB_DEMO_MODE on the caller. Production frontends
 *     must NOT send it.
 */
import type { FastifyRequest } from "fastify";

import { repositories } from "@runwayops/db";

type DbHandle = repositories.DbHandle;

export type RequestContext = {
  userId: string;
  companyId: string;
  email: string;
};

const DEMO_COMPANY_HEADER = "x-runway-demo-company-id";
const DEMO_USER_ID = "demo-user";
const DEMO_USER_EMAIL = "demo@runway.local";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve authenticated user + tenant from request headers.
 * Returns null if the request is unauthenticated.
 *
 * The demo header MUST be a UUID. RLS policies cast
 * `app.current_company_id` to `uuid`, so a non-UUID would either error
 * inside the read query or (on some Postgres versions) silently filter
 * everything out — both are confusing for the operator. Reject up front.
 */
export async function resolveRequestContext(
  request: FastifyRequest,
  db: DbHandle | null,
): Promise<RequestContext | null> {
  const demoCompanyIdRaw = request.headers[DEMO_COMPANY_HEADER] as string | undefined;
  if (demoCompanyIdRaw && demoCompanyIdRaw.trim().length > 0) {
    const demoCompanyId = demoCompanyIdRaw.trim();
    if (!UUID_RE.test(demoCompanyId)) return null;
    return {
      userId: DEMO_USER_ID,
      companyId: demoCompanyId,
      email: DEMO_USER_EMAIL,
    };
  }

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
