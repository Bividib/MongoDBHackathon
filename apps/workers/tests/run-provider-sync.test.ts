import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDb, createPool } from "@runwayops/db";

import { initActivityContext } from "../src/temporal/activities/context.js";
import { runProviderSync } from "../src/temporal/activities/sync.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.ADMIN_DATABASE_URL;
const describeReal = TEST_DATABASE_URL && ADMIN_DATABASE_URL ? describe : describe.skip;

/**
 * End-to-end test of the production runProviderSync path against real
 * Postgres. Seeds a Xero-simulated connection (no OAuth needed),
 * points it at the bundled fixture root via metadataJson, runs the
 * activity, and asserts:
 *   - source_objects rows materialised
 *   - sync_jobs row transitioned to "completed" with recordsProcessed > 0
 *   - integration_connections.last_successful_sync_at stamped
 *
 * Real OAuth + the real adapter are exercised by the unit tests in
 * `@runwayops/integrations` — this test pins the activity wiring and
 * the sync_jobs bookkeeping.
 */

const SIMULATED_FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/integrations/fixtures/xero",
);

describeReal("runProviderSync (real Postgres + simulated Xero adapter)", () => {
  const testSlug = `sync-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  let adminPool: pg.Pool;
  let testPool: pg.Pool;
  let testCompanyId: string;
  let testConnectionId: string;

  beforeAll(async () => {
    adminPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL! });
    testPool = createPool(TEST_DATABASE_URL!);

    // Seed a fresh company + connection via raw SQL on the admin pool.
    const slug = testSlug;
    const company = await adminPool.query<{ id: string }>(
      `INSERT INTO companies (display_name, slug) VALUES ($1, $2) RETURNING id`,
      ["SyncTestCo", slug],
    );
    testCompanyId = company.rows[0]!.id;

    const conn = await adminPool.query<{ id: string }>(
      `INSERT INTO integration_connections
         (company_id, provider, status, display_name, reconnect_required, metadata_json)
         VALUES ($1, 'xero', 'connected', 'Xero (simulated)', false, $2)
         RETURNING id`,
      [
        testCompanyId,
        JSON.stringify({
          adapterMode: "simulated",
          fixtureRoot: SIMULATED_FIXTURE_ROOT,
        }),
      ],
    );
    testConnectionId = conn.rows[0]!.id;

    // Initialise the worker activity context with the real-PG handle.
    // No AI is needed for sync, so we override with a no-op router.
    initActivityContext({
      db: createDb(testPool),
      ai: {
        classifyReply: async () => ({}) as never,
        extractPromise: async () => ({}) as never,
        summarizeEvidence: async () => ({}) as never,
        draftMessage: async () => ({}) as never,
        generateAuditExplanation: async () => ({}) as never,
        recommendAction: async () => ({}) as never,
      },
    });
  });

  afterAll(async () => {
    // FK CASCADE handles connection + sync_jobs from companies.
    await adminPool.query(`DELETE FROM companies WHERE id = $1`, [testCompanyId]);
    await adminPool.end();
    await testPool.end();
  });

  it("syncs the simulated Xero fixtures, writes source_objects, completes the sync_job", async () => {
    const summary = await runProviderSync({
      companyId: testCompanyId,
      connectionId: testConnectionId,
      idempotencyKey: `runProviderSync:${testConnectionId}:1`,
    });

    expect(summary.status).toBe("completed");
    expect(summary.recordsProcessed).toBeGreaterThan(0);
    expect(summary.errorMessage).toBeUndefined();

    const jobRow = await adminPool.query<{ status: string; records_processed: number }>(
      `SELECT status, records_processed FROM sync_jobs WHERE id = $1`,
      [summary.syncJobId],
    );
    expect(jobRow.rows).toHaveLength(1);
    expect(jobRow.rows[0]?.status).toBe("completed");
    expect(jobRow.rows[0]?.records_processed).toBe(summary.recordsProcessed);

    const connRow = await adminPool.query<{ last_successful_sync_at: Date | null }>(
      `SELECT last_successful_sync_at FROM integration_connections WHERE id = $1`,
      [testConnectionId],
    );
    expect(connRow.rows[0]?.last_successful_sync_at).not.toBeNull();

    const sourceRow = await adminPool.query<{ count: string }>(
      `SELECT COUNT(*) FROM source_objects WHERE company_id = $1 AND provider = 'xero'`,
      [testCompanyId],
    );
    expect(Number(sourceRow.rows[0]!.count)).toBeGreaterThan(0);
  });

  it("re-running the same sync is a no-op on source_objects (dedup) but records a new job", async () => {
    const before = await adminPool
      .query<{ count: string }>(
        `SELECT COUNT(*) FROM source_objects WHERE company_id = $1`,
        [testCompanyId],
      )
      .then((r) => Number(r.rows[0]!.count));

    const summary = await runProviderSync({
      companyId: testCompanyId,
      connectionId: testConnectionId,
      idempotencyKey: `runProviderSync:${testConnectionId}:2`,
    });
    expect(summary.status).toBe("completed");

    const after = await adminPool
      .query<{ count: string }>(
        `SELECT COUNT(*) FROM source_objects WHERE company_id = $1`,
        [testCompanyId],
      )
      .then((r) => Number(r.rows[0]!.count));

    // Source objects are deduped on (provider, providerObjectType, providerObjectId)
    // so the count should not grow.
    expect(after).toBe(before);
  });
});
