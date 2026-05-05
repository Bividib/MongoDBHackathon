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
import { getCycleSummaryQuery } from "../src/temporal/queries.js";
import { pollOnce, type DispatcherConfig } from "../src/dispatcher/index.js";
import { buildApprovalDispatchHandlers } from "../src/dispatcher/handlers/temporal-signal.js";

/**
 * End-to-end approval-signal path:
 *
 *   workflow reaches awaiting_approval
 *     → outbox event "approval.granted" (synthesised here to mirror
 *       what the API endpoint would write in production)
 *     → dispatcher pollOnce reads + invokes the temporal-signal handler
 *     → handler signals workflow with approvalGrantedSignal
 *     → workflow's awaiting-approval condition fires, cycle completes.
 *
 * This test wires the real workflow + real activities + real Postgres
 * + real Temporal (via TestWorkflowEnvironment) + the real dispatcher.
 * Without it the API-side approve endpoint and the dispatcher handler
 * are individually tested but never proven to compose.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.ADMIN_DATABASE_URL;
const describeReal =
  TEST_DATABASE_URL && ADMIN_DATABASE_URL ? describe : describe.skip;

const WORKFLOWS_PATH = fileURLToPath(
  new URL("../src/temporal/workflows/index.ts", import.meta.url),
);

describeReal("Approval signal: outbox → dispatcher → workflow", () => {
  const slug = `e2e-sig-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  let env: TestWorkflowEnvironment;
  let worker: Worker;
  let workerPromise: Promise<void>;
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let dispatcherPool: pg.Pool;
  let companyId: string;
  let dispatcherConfig: DispatcherConfig;

  beforeAll(async () => {
    adminPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL! });
    appPool = createPool(TEST_DATABASE_URL!);
    dispatcherPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL! });

    // Seed minimum tenant data the workflow reads.
    const company = await adminPool.query<{ id: string }>(
      `INSERT INTO companies (display_name, slug, base_currency)
         VALUES ($1, $2, 'GBP') RETURNING id`,
      ["E2ESignalCo", slug],
    );
    companyId = company.rows[0]!.id;

    const customer = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (company_id, display_name, status)
         VALUES ($1, 'Counterparty', 'active') RETURNING id`,
      [companyId],
    );
    const customerId = customer.rows[0]!.id;

    await adminPool.query(
      `INSERT INTO invoices
         (company_id, customer_id, invoice_number, issue_date, due_date,
          status, amount_total_minor, amount_due_minor, amount_paid_minor, currency)
         VALUES ($1, $2, $3, '2026-04-01', '2026-04-30', 'sent',
                 185000, 185000, 0, 'GBP')`,
      [companyId, customerId, `INV-${slug}`],
    );
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

    env = await TestWorkflowEnvironment.createTimeSkipping();
    initActivityContext({
      db: createDb(appPool),
      ai: new MockModelRouter(),
    });
    worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace ?? "default",
      taskQueue: "e2e-approval-signal",
      workflowsPath: WORKFLOWS_PATH,
      activities,
    });
    workerPromise = worker.run();

    dispatcherConfig = {
      batchSize: 25,
      pollIntervalMs: 1000,
      maxAttempts: 10,
      backoffBaseSeconds: 5,
      backoffCapSeconds: 600,
      handlers: buildApprovalDispatchHandlers(env.client),
    };
  }, 60_000);

  afterAll(async () => {
    if (worker) {
      worker.shutdown();
      await workerPromise.catch(() => undefined);
    }
    if (env) await env.teardown().catch(() => undefined);
    if (adminPool) {
      await adminPool
        .query(`DELETE FROM companies WHERE id = $1`, [companyId])
        .catch(() => undefined);
      await adminPool.end();
    }
    if (appPool) await appPool.end();
    if (dispatcherPool) await dispatcherPool.end();
  }, 30_000);

  it("dispatcher delivers approval.granted outbox events as approvalGrantedSignal and the workflow completes", async () => {
    const workflowId = `e2e-approval-signal-${slug}`;
    const handle = await env.client.workflow.start(DailyCashActionWorkflow, {
      args: [
        {
          companyId,
          asOfDate: "2026-05-05",
          triggerEventIds: [randomUUID()],
        },
      ],
      taskQueue: "e2e-approval-signal",
      workflowId,
    });

    // Wait for awaiting_approval — i.e. createApprovalRequests has
    // persisted approval_requests rows with workflowId in
    // content_snapshot.
    let summary = await handle.query(getCycleSummaryQuery);
    let iterations = 0;
    while (summary.phase !== "awaiting_approval" && iterations < 200) {
      await new Promise((r) => setTimeout(r, 50));
      summary = await handle.query(getCycleSummaryQuery);
      iterations += 1;
    }
    expect(summary.phase).toBe("awaiting_approval");
    expect(summary.draftActionCount).toBeGreaterThan(0);

    // Read the persisted approval rows. Each carries the workflowId
    // in content_snapshot — that's the contract between
    // createApprovalRequests and the dispatcher handler.
    const approvals = await adminPool.query<{
      id: string;
      subject_kind: string;
      subject_id: string;
      content_snapshot: { workflowId?: string };
    }>(
      `SELECT id, subject_kind, subject_id, content_snapshot
         FROM approval_requests
         WHERE company_id = $1 AND status = 'pending'`,
      [companyId],
    );
    expect(approvals.rows.length).toBeGreaterThan(0);
    for (const row of approvals.rows) {
      expect(row.content_snapshot.workflowId).toBe(workflowId);
    }

    // Synthesise outbox events as the API approve endpoint would.
    // Real production goes API → DB write; we go straight to the
    // outbox row to keep the test single-process and not require an
    // HTTP server. The dispatcher contract under test is the same.
    const now = new Date().toISOString();
    for (const row of approvals.rows) {
      await adminPool.query(
        `INSERT INTO outbox_events
           (company_id, event_type, aggregate_type, aggregate_id,
            payload_json, headers_json, idempotency_key, status, attempts, available_at)
           VALUES ($1, 'approval.granted', 'approval', $2, $3, '{}'::jsonb, $4, 'pending', 0, now())`,
        [
          companyId,
          row.id,
          JSON.stringify({
            approvalRequestId: row.id,
            workflowId,
            decision: "approved",
            decidedByUserId: "user-e2e-1",
            decidedAtIso: now,
            subjectKind: row.subject_kind,
            subjectId: row.subject_id,
          }),
          `approval.granted:${row.id}:user-e2e-1`,
        ],
      );
    }

    // Run dispatcher poll cycles until everything is drained. The
    // workflow itself emits other outbox events (forecast.computed,
    // approval.requested, etc.) that the default log handler also
    // consumes; we want all of them dispatched so the next assertion
    // (workflow completion) only depends on the approval.granted
    // signal having landed.
    let totalDispatched = 0;
    let totalFailed = 0;
    for (let i = 0; i < 5; i += 1) {
      const result = await pollOnce(dispatcherPool, dispatcherConfig);
      totalDispatched += result.dispatched;
      totalFailed += result.failed;
      if (result.claimed === 0) break;
    }
    expect(totalFailed).toBe(0);
    expect(totalDispatched).toBeGreaterThanOrEqual(approvals.rows.length);

    // Workflow should now exit awaiting_approval and complete.
    const workflowResult = await handle.result();
    expect(workflowResult.cycleKey).toBe(`daily-cash-action:${companyId}:2026-05-05`);
    expect(workflowResult.cancelled).toBe(false);
    expect(workflowResult.approved).toBeGreaterThan(0);

    // Outbox rows now marked published.
    const dispatched = await adminPool.query<{ count: string }>(
      `SELECT count(*) FROM outbox_events
         WHERE company_id = $1 AND event_type = 'approval.granted' AND status = 'published'`,
      [companyId],
    );
    expect(Number(dispatched.rows[0]!.count)).toBe(approvals.rows.length);
  }, 120_000);
});
