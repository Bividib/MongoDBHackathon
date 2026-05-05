import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

import { createDb, createPool } from "@runwayops/db";
import { MockModelRouter } from "@runwayops/ai";

import * as activities from "../src/temporal/activities/index.js";
import { initActivityContext } from "../src/temporal/activities/context.js";
import { DailyCashActionWorkflow } from "../src/temporal/workflows/daily-cash-action.js";
import { cycleCancelSignal } from "../src/temporal/signals.js";
import { getCycleSummaryQuery } from "../src/temporal/queries.js";

/**
 * End-to-end DailyCashActionWorkflow against REAL activity bodies and
 * real Postgres. Distinct from `e2e-simulation.test.ts` (which wires
 * mock activities) — this test pins the load-bearing chain:
 *
 *   workflow → activity body → repository → Postgres
 *
 * Without this, every replay test passes while the production path is
 * unproven.
 *
 * SCOPE — what this test actually proves today:
 *   ✓ computeCashForecast persists `cash_forecasts` row.
 *   ✓ rankCollectionsActions persists `collection_actions` rows.
 *   ✓ Activities write `audit_events` and `outbox_events`.
 *   ✗ approval_requests are NOT asserted: the workflow generates
 *     synthetic deterministic strings as `subjectId`s (e.g.
 *     "daily-cash-action:co:date:drafts:draft:..."), but the
 *     `approval_requests.subject_id` column is `uuid`. The DB
 *     rejects the insert; the activity catches and returns synthetic
 *     ids so the workflow can keep running. This is a workflow→
 *     activity ID-architecture gap that needs its own slice (move
 *     UUID generation into activities and have workflows hold
 *     returned UUIDs in their state).
 *
 * AI is mocked deliberately: AI_MODE=mock keeps determinism; real-model
 * verification belongs in a separate nightly gate.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.ADMIN_DATABASE_URL;
const describeReal =
  TEST_DATABASE_URL && ADMIN_DATABASE_URL ? describe : describe.skip;

const WORKFLOWS_PATH = fileURLToPath(
  new URL("../src/temporal/workflows/index.ts", import.meta.url),
);

describeReal("DailyCashActionWorkflow — real activities + real Postgres", () => {
  const slug = `e2e-real-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  let env: TestWorkflowEnvironment;
  let worker: Worker;
  let workerPromise: Promise<void>;
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let companyId: string;
  let customerId: string;
  let invoiceId: string;

  beforeAll(async () => {
    adminPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL! });
    appPool = createPool(TEST_DATABASE_URL!);

    // Seed a fresh tenant with the minimum the workflow reads:
    //   company + customer + 1 open invoice + 1 obligation + 1 bank account.
    // The forecast/ranking activities will pick these up via the
    // fact-loader's tenant-scoped queries.
    const company = await adminPool.query<{ id: string }>(
      `INSERT INTO companies (display_name, slug, base_currency)
         VALUES ($1, $2, 'GBP') RETURNING id`,
      ["E2EReal Co", slug],
    );
    companyId = company.rows[0]!.id;

    const customer = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (company_id, display_name, status)
         VALUES ($1, 'Northstar', 'active') RETURNING id`,
      [companyId],
    );
    customerId = customer.rows[0]!.id;

    const invoice = await adminPool.query<{ id: string }>(
      `INSERT INTO invoices
         (company_id, customer_id, invoice_number, issue_date, due_date,
          status, amount_total_minor, amount_due_minor, amount_paid_minor, currency)
         VALUES ($1, $2, $3, '2026-04-01', '2026-04-30', 'sent',
                 185000, 185000, 0, 'GBP')
         RETURNING id`,
      [companyId, customerId, `INV-E2E-${slug}`],
    );
    invoiceId = invoice.rows[0]!.id;

    await adminPool.query(
      `INSERT INTO critical_obligations
         (company_id, obligation_type, counterparty_name, due_date,
          amount_minor, currency, criticality, manual_or_source, status)
         VALUES ($1, 'payroll', 'Staff', '2026-05-07', 200000, 'GBP',
                 'critical', 'manual', 'scheduled')`,
      [companyId],
    );

    await adminPool.query(
      `INSERT INTO bank_accounts
         (company_id, provider, account_name, currency,
          current_balance_minor, available_balance_minor, status)
         VALUES ($1, 'stub', 'Operating', 'GBP', 100000, 100000, 'active')`,
      [companyId],
    );

    // Boot Temporal in-process and wire a worker with REAL activity
    // bodies (not the mock harness). Activity context is initialised
    // with the real-PG drizzle handle + a mock AI router (mocking AI
    // is intentional — see file header).
    env = await TestWorkflowEnvironment.createTimeSkipping();
    initActivityContext({
      db: createDb(appPool),
      ai: new MockModelRouter(),
    });
    worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace ?? "default",
      taskQueue: "e2e-real-activities",
      workflowsPath: WORKFLOWS_PATH,
      activities,
    });
    workerPromise = worker.run();
  }, 60_000);

  afterAll(async () => {
    if (worker) {
      worker.shutdown();
      await workerPromise.catch(() => undefined);
    }
    if (env) await env.teardown().catch(() => undefined);
    if (adminPool) {
      // FK CASCADE handles dependents from companies.
      await adminPool
        .query(`DELETE FROM companies WHERE id = $1`, [companyId])
        .catch(() => undefined);
      await adminPool.end();
    }
    if (appPool) await appPool.end();
  }, 30_000);

  it("runs the daily cycle through awaiting_approval and persists forecast + actions + audit + outbox", async () => {
    const handle = await env.client.workflow.start(DailyCashActionWorkflow, {
      args: [
        {
          companyId,
          asOfDate: "2026-05-05",
          // trigger_event_ids column is uuid[] in the schema (FKs to
          // outbox_events.id), so the workflow input MUST be UUIDs.
          // Existing e2e-simulation.test.ts passes friendly strings,
          // but only works there because it uses mock activities that
          // never write to the DB.
          triggerEventIds: [randomUUID()],
        },
      ],
      taskQueue: "e2e-real-activities",
      workflowId: `e2e-real-${slug}`,
    });

    // Wait for the workflow to enter the approval window — i.e. all
    // pre-approval activities (forecast, ranking, evidence, drafts,
    // approval-request creation) have completed against real DB.
    let summary = await handle.query(getCycleSummaryQuery);
    let iterations = 0;
    while (summary.phase !== "awaiting_approval" && iterations < 200) {
      await new Promise((r) => setTimeout(r, 50));
      summary = await handle.query(getCycleSummaryQuery);
      iterations += 1;
    }
    expect(summary.phase).toBe("awaiting_approval");
    expect(summary.draftActionCount).toBeGreaterThan(0);

    // The workflow will sit indefinitely waiting on signals; cancel
    // it now so the test can finish. The activities that ran before
    // this point have already written their DB rows — we assert on
    // those below.
    await handle.signal(cycleCancelSignal, { reason: "e2e-test-complete" });
    const result = await handle.result();
    expect(result.cancelled).toBe(true);

    // Forecast persisted in cash_forecasts.
    const forecastRows = await adminPool.query<{ count: string }>(
      `SELECT count(*) FROM cash_forecasts WHERE company_id = $1`,
      [companyId],
    );
    expect(Number(forecastRows.rows[0]!.count)).toBeGreaterThanOrEqual(1);

    // Collection actions persisted (any status, since the ranker may
    // mark some as awaiting_approval and others as proposed).
    const actionRows = await adminPool.query<{ count: string }>(
      `SELECT count(*) FROM collection_actions WHERE company_id = $1`,
      [companyId],
    );
    expect(Number(actionRows.rows[0]!.count)).toBeGreaterThan(0);

    // Audit trail written (forecast + ranking emit audit rows).
    const auditRows = await adminPool.query<{ count: string }>(
      `SELECT count(*) FROM audit_events WHERE company_id = $1`,
      [companyId],
    );
    expect(Number(auditRows.rows[0]!.count)).toBeGreaterThan(0);

    // Outbox events queued (forecast + actions emit events).
    const outboxRows = await adminPool.query<{ count: string }>(
      `SELECT count(*) FROM outbox_events WHERE company_id = $1`,
      [companyId],
    );
    expect(Number(outboxRows.rows[0]!.count)).toBeGreaterThan(0);

    expect(invoiceId).toBeDefined(); // touched by fact-loader
  }, 120_000);
});
