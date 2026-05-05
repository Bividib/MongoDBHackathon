import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import pg from "pg";
import {
  claimBatch,
  markDispatched,
  recordFailure,
  pollOnce,
  DEFAULT_DISPATCHER_CONFIG,
  type DispatcherConfig,
  type DispatcherPool
} from "../src/dispatcher/index.js";

const { Pool } = pg;

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.ADMIN_DATABASE_URL;

const describeWithDb = TEST_DATABASE_URL && ADMIN_DATABASE_URL ? describe : describe.skip;

describeWithDb("Outbox Dispatcher", () => {
  let pool: DispatcherPool;
  // Per-run UUID so re-runs against the same DB don't collide on the
  // companies UNIQUE(slug) constraint and the suite stays idempotent.
  let testCompanyId: string;
  const testSlug = `dispatcher-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: ADMIN_DATABASE_URL! });

    // Real schema column is `display_name`, not `name`.
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO companies (display_name, slug)
       VALUES ($1, $2)
       RETURNING id`,
      ["Dispatcher Test Co", testSlug],
    );
    testCompanyId = inserted.rows[0]!.id;
  });

  afterAll(async () => {
    if (testCompanyId) {
      // ON DELETE CASCADE wipes the outbox rows tied to this company too.
      await pool.query(`DELETE FROM companies WHERE id = $1`, [testCompanyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM outbox_events WHERE company_id = $1`, [testCompanyId]);
  });

  async function seedOutboxEvent(overrides: Partial<{
    status: string;
    attempts: number;
    /**
     * If provided, sets available_at to this exact JS Date. If omitted,
     * the row is inserted with `available_at = now() - interval '1 second'`
     * so it's reliably claimable on the next call regardless of any
     * host/container clock skew (Docker on macOS shows ~ms drift between
     * the host JS clock and the container PG clock, which silently
     * causes claimBatch's `available_at <= now()` to filter the row out).
     */
    availableAt: Date;
    idempotencyKey: string;
  }> = {}) {
    const key = overrides.idempotencyKey ?? `test:${Date.now()}:${Math.random()}`;
    if (overrides.availableAt !== undefined) {
      await pool.query(`
        INSERT INTO outbox_events (
          company_id, event_type, aggregate_type, aggregate_id,
          payload_json, headers_json, idempotency_key, status,
          attempts, available_at
        ) VALUES (
          $1, 'test.event', 'test', gen_random_uuid(),
          '{"test": true}'::jsonb, '{}'::jsonb, $2,
          $3, $4, $5
        )
      `, [
        testCompanyId,
        key,
        overrides.status ?? "pending",
        overrides.attempts ?? 0,
        overrides.availableAt
      ]);
    } else {
      // Use PG's own clock for available_at to avoid host/container drift.
      await pool.query(`
        INSERT INTO outbox_events (
          company_id, event_type, aggregate_type, aggregate_id,
          payload_json, headers_json, idempotency_key, status,
          attempts, available_at
        ) VALUES (
          $1, 'test.event', 'test', gen_random_uuid(),
          '{"test": true}'::jsonb, '{}'::jsonb, $2,
          $3, $4, now() - interval '1 second'
        )
      `, [
        testCompanyId,
        key,
        overrides.status ?? "pending",
        overrides.attempts ?? 0,
      ]);
    }
    return key;
  }

  it("claims pending events with FOR UPDATE SKIP LOCKED", async () => {
    await seedOutboxEvent({ idempotencyKey: "claim-test-1" });
    await seedOutboxEvent({ idempotencyKey: "claim-test-2" });

    const batch = await claimBatch(pool, { ...DEFAULT_DISPATCHER_CONFIG, batchSize: 10 });
    expect(batch.length).toBe(2);
    expect(batch[0]!.attempt).toBe(1);
    expect(batch[1]!.attempt).toBe(1);
  });

  it("does not claim events with future available_at", async () => {
    const future = new Date(Date.now() + 60_000);
    await seedOutboxEvent({ idempotencyKey: "future-1", availableAt: future });
    await seedOutboxEvent({ idempotencyKey: "future-available" });

    const batch = await claimBatch(pool, { ...DEFAULT_DISPATCHER_CONFIG, batchSize: 10 });
    expect(batch.length).toBe(1);
    expect(batch[0]!.eventType).toBe("test.event");
  });

  it("marks event as dispatched on success", async () => {
    await seedOutboxEvent({ idempotencyKey: "mark-test" });
    const batch = await claimBatch(pool, DEFAULT_DISPATCHER_CONFIG);
    expect(batch.length).toBe(1);

    await markDispatched(pool, batch[0]!.id);

    const result = await pool.query<{ status: string; dispatched_at: string | null }>(
      `SELECT status, dispatched_at FROM outbox_events WHERE id = $1`, [batch[0]!.id]
    );
    expect(result.rows[0]!.status).toBe("published");
    expect(result.rows[0]!.dispatched_at).not.toBeNull();
  });

  it("applies exponential backoff on failure", async () => {
    await seedOutboxEvent({ idempotencyKey: "backoff-test" });
    const batch = await claimBatch(pool, DEFAULT_DISPATCHER_CONFIG);
    const event = batch[0]!;

    const outcome = await recordFailure(pool, event.id, "connection refused", 1, DEFAULT_DISPATCHER_CONFIG);
    expect(outcome).toBe("retrying");

    const result = await pool.query<{ status: string; last_error: string; available_at: string }>(
      `SELECT status, last_error, available_at FROM outbox_events WHERE id = $1`, [event.id]
    );
    expect(result.rows[0]!.status).toBe("pending");
    expect(result.rows[0]!.last_error).toBe("connection refused");
    expect(new Date(result.rows[0]!.available_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("transitions to dead_letter after max attempts", async () => {
    const config: DispatcherConfig = { ...DEFAULT_DISPATCHER_CONFIG, maxAttempts: 3 };
    await seedOutboxEvent({ idempotencyKey: "dead-letter-test", attempts: 2 });

    const batch = await claimBatch(pool, config);
    const event = batch[0]!;

    const outcome = await recordFailure(pool, event.id, "permanent failure", event.attempt, config);
    expect(outcome).toBe("dead_letter");

    const result = await pool.query<{ status: string }>(
      `SELECT status FROM outbox_events WHERE id = $1`, [event.id]
    );
    expect(result.rows[0]!.status).toBe("dead_letter");
  });

  it("pollOnce claims, dispatches, and marks in one cycle", async () => {
    await seedOutboxEvent({ idempotencyKey: "poll-test-1" });
    await seedOutboxEvent({ idempotencyKey: "poll-test-2" });

    const result = await pollOnce(pool, DEFAULT_DISPATCHER_CONFIG);
    expect(result.claimed).toBe(2);
    expect(result.dispatched).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.deadLettered).toBe(0);
  });
});
