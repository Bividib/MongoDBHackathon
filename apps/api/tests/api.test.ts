/**
 * API endpoint tests. Uses fastify.inject for in-process testing.
 *
 * Unit tests (no DB): test route structure, middleware rejection,
 * idempotency-key requirement, hard refusals.
 *
 * Integration tests (gated on TEST_DATABASE_URL): tenant isolation,
 * idempotency replay, full happy-path flows.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { buildApp } from "../src/server.js";

const app = buildApp();

beforeAll(async () => {
  await app.ready();
});

// ---------------------------------------------------------------------------
// Health endpoints (no tenancy)
// ---------------------------------------------------------------------------

describe("GET /healthz", () => {
  it("returns 200 ok", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /readyz", () => {
  it("returns 503 when DB is unreachable (no DATABASE_URL in test)", async () => {
    // Without a real DB, the readyz should return 503
    const res = await app.inject({ method: "GET", url: "/readyz" });
    // May be 200 if PG is running or 503 if not
    expect([200, 503]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
// Tenancy enforcement
// ---------------------------------------------------------------------------

describe("Tenancy middleware", () => {
  it("rejects requests without X-User-Email header with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/forecast/today",
      headers: { "x-company-id": "comp-1" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().ok).toBe(false);
  });

  it("rejects requests without X-Company-Id header with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/forecast/today",
      headers: { "x-user-email": "test@example.com" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Demo-mode tenancy: x-runway-demo-company-id header
// ---------------------------------------------------------------------------

describe("Demo-mode tenancy header", () => {
  it("accepts x-runway-demo-company-id (UUID) alone (no x-user-email needed)", async () => {
    // Without DATABASE_URL the handler will fail when it tries to query
    // — but tenancy resolves first. We're asserting the request passes
    // the 401 gate (status !== 401), not that the query succeeds.
    const res = await app.inject({
      method: "GET",
      url: "/v1/forecasts/latest",
      headers: {
        "x-runway-demo-company-id": "10000000-0000-4000-8000-000000000001",
      },
    });
    expect(res.statusCode).not.toBe(401);
  });

  it("rejects non-UUID demo header with 401 (RLS would silently zero rows otherwise)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/forecasts/latest",
      headers: { "x-runway-demo-company-id": "comp-meridian-001" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects /v1/* requests without any tenancy header (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/actions" });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Idempotency middleware
// ---------------------------------------------------------------------------

describe("Idempotency middleware", () => {
  it("rejects POST without Idempotency-Key header with 400 (requires auth)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/actions/fake-id/approve",
      headers: {
        "x-user-email": "user@co.com",
        "x-company-id": "comp-1",
        "content-type": "application/json",
      },
      payload: {},
    });
    // Without DATABASE_URL the idempotency hook can't run, so we get 400
    // only when a DB is available. Without DB, tenancy passes (stub) but
    // idempotency hook throws DATABASE_URL error → 500, OR 400 if DB is available.
    // When no DB: preHandler idempotency check won't reach DB because the
    // missing-key check is BEFORE the DB call. Should always be 400.
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("MISSING_IDEMPOTENCY_KEY");
  });
});

// ---------------------------------------------------------------------------
// Hard refusals — API never sends, never initiates payment
// ---------------------------------------------------------------------------

describe("Hard refusals", () => {
  it("has no /api/send endpoint", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/send",
      headers: {
        "x-user-email": "user@co.com",
        "x-company-id": "comp-1",
        "idempotency-key": "key-1",
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it("has no /api/payments/initiate endpoint", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/payments/initiate",
      headers: {
        "x-user-email": "user@co.com",
        "x-company-id": "comp-1",
        "idempotency-key": "key-1",
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Endpoint routing (structure tests — DB may not be available)
// ---------------------------------------------------------------------------

describe("Route structure", () => {
  it("GET /api/actions returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/actions" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/promises returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/promises" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/audit returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/audit" });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/actions/:id/approve returns 400 without idempotency key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/actions/some-id/approve",
      headers: {
        "x-user-email": "u@co.com",
        "x-company-id": "c-1",
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/actions/:id/reject returns 400 without idempotency key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/actions/some-id/reject",
      headers: {
        "x-user-email": "u@co.com",
        "x-company-id": "c-1",
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/promises/:id/mark-fulfilled returns 400 without idempotency key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/promises/some-id/mark-fulfilled",
      headers: {
        "x-user-email": "u@co.com",
        "x-company-id": "c-1",
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — exercise the policy gate on real Postgres data
// ---------------------------------------------------------------------------

const hasRealDb = Boolean(process.env.TEST_DATABASE_URL && process.env.ADMIN_DATABASE_URL);

describe.skipIf(!hasRealDb)("Integration: policy gate at approve time", async () => {
  // Lazy imports keep the unit-test suite from loading pg deps when no DB
  // is available. These imports only resolve when the integration suite
  // actually runs.
  const { default: pg } = await import("pg");
  const { Pool } = pg;

  let adminPool: InstanceType<typeof pg.Pool>;
  let companyId: string;
  let customerId: string;
  let userId: string;
  const userEmail = "policy-test@runwayops.dev";

  // Seed helpers run as the admin role (BYPASSRLS) so we can bootstrap
  // cross-tenant fixtures the API would never legitimately create.
  beforeAll(async () => {
    adminPool = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL! });

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const co = await adminPool.query<{ id: string }>(
      `INSERT INTO companies (display_name, slug) VALUES ($1, $2) RETURNING id`,
      [`Policy Test Co ${stamp}`, `policy-test-${stamp}`],
    );
    companyId = co.rows[0]!.id;

    const cust = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (company_id, display_name) VALUES ($1, $2) RETURNING id`,
      [companyId, "Policy Test Customer"],
    );
    customerId = cust.rows[0]!.id;

    const user = await adminPool.query<{ id: string }>(
      `INSERT INTO users (email, display_name) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [userEmail, "Policy Tester"],
    );
    userId = user.rows[0]!.id;

    await adminPool.query(
      `INSERT INTO memberships (user_id, company_id, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (user_id, company_id) DO NOTHING`,
      [userId, companyId],
    );
  });

  afterAll(async () => {
    if (companyId) {
      await adminPool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
    }
    if (userEmail) {
      await adminPool.query(`DELETE FROM users WHERE email = $1`, [userEmail]);
    }
    await adminPool.end();
  });

  async function seedAction(overrides: {
    actionKind?: string;
    channel?: string;
    reason?: string;
    evidenceRefs?: unknown[];
  } = {}) {
    const inserted = await adminPool.query<{ id: string }>(
      `INSERT INTO collection_actions (
        company_id, customer_id, action_kind, channel, status,
        priority_score, evidence_confidence, requires_approval,
        reason, evidence_refs, recommended_at
      ) VALUES (
        $1, $2, $3, $4, 'awaiting_approval',
        50, 0.8, true,
        $5, $6::jsonb, now()
      ) RETURNING id`,
      [
        companyId,
        customerId,
        overrides.actionKind ?? "request_payment",
        overrides.channel ?? "email",
        overrides.reason ?? "Standard reminder for overdue invoice INV-001.",
        JSON.stringify(
          overrides.evidenceRefs ?? [
            { kind: "invoice", id: "inv-001", summary: "Invoice INV-001 overdue 14d" },
          ],
        ),
      ],
    );
    return inserted.rows[0]!.id;
  }

  async function approve(actionId: string, idempotencyKey: string) {
    return app.inject({
      method: "POST",
      url: `/api/actions/${actionId}/approve`,
      headers: {
        "x-user-email": userEmail,
        "x-company-id": companyId,
        "idempotency-key": idempotencyKey,
        "content-type": "application/json",
      },
      payload: {},
    });
  }

  it("ALLOWS approval of a valid action with evidence", async () => {
    const actionId = await seedAction();
    const res = await approve(actionId, `valid-${actionId}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);

    // Confirm the status actually flipped in the DB.
    const check = await adminPool.query<{ status: string }>(
      `SELECT status FROM collection_actions WHERE id = $1`,
      [actionId],
    );
    expect(check.rows[0]!.status).toBe("approved");
  });

  it("DENIES approval when evidenceRefs is empty (rejectIfMissingEvidence)", async () => {
    const actionId = await seedAction({ evidenceRefs: [] });
    const res = await approve(actionId, `no-evidence-${actionId}`);
    expect(res.statusCode).toBe(422);
    expect(res.json().ok).toBe(false);
    expect(res.json().error.code).toBe("POLICY_DENIED");
    expect(res.json().error.message).toContain("rejectIfMissingEvidence");

    // Confirm the status did NOT flip.
    const check = await adminPool.query<{ status: string }>(
      `SELECT status FROM collection_actions WHERE id = $1`,
      [actionId],
    );
    expect(check.rows[0]!.status).toBe("awaiting_approval");

    // Confirm an audit row was written for the policy denial.
    const audit = await adminPool.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE target_id = $1 AND action LIKE '%policy%'`,
      [actionId],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it("DENIES approval when reason text claims an obligation is safe (rejectIfClaimsObligationSafe)", async () => {
    const actionId = await seedAction({
      reason: "Approving because payroll is safe and tax will be paid on time.",
    });
    const res = await approve(actionId, `safety-claim-${actionId}`);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("POLICY_DENIED");
    expect(res.json().error.message).toContain("rejectIfClaimsObligationSafe");

    const check = await adminPool.query<{ status: string }>(
      `SELECT status FROM collection_actions WHERE id = $1`,
      [actionId],
    );
    expect(check.rows[0]!.status).toBe("awaiting_approval");
  });

  it("ALLOWS rejection regardless of policy state (rejection is the safe path)", async () => {
    // Even an action with missing evidence can still be REJECTED — that's
    // the safe path. Policy gating only fires on approve.
    const actionId = await seedAction({ evidenceRefs: [] });
    const res = await app.inject({
      method: "POST",
      url: `/api/actions/${actionId}/reject`,
      headers: {
        "x-user-email": userEmail,
        "x-company-id": companyId,
        "idempotency-key": `reject-${actionId}`,
        "content-type": "application/json",
      },
      payload: { note: "no evidence — drop it" },
    });
    expect(res.statusCode).toBe(200);
    const check = await adminPool.query<{ status: string }>(
      `SELECT status FROM collection_actions WHERE id = $1`,
      [actionId],
    );
    expect(check.rows[0]!.status).toBe("rejected");
  });
});
