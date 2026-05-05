/**
 * Outbox dispatcher worker.
 *
 * Polls `outbox_events` with `FOR UPDATE SKIP LOCKED`, claims a batch,
 * dispatches downstream, and marks dispatched_at or records failure.
 *
 * At-least-once semantics: downstream consumers must be idempotent.
 *
 * In Round 3 "dispatch" means appending to a structured log (stdout JSON).
 * Real downstream (SQS/EventBridge/Kafka) ships in Round 4.
 */
import pg from "pg";

const { Pool } = pg;

export interface DispatcherConfig {
  /** Maximum events per poll cycle */
  batchSize: number;
  /** Poll interval in ms */
  pollIntervalMs: number;
  /** Max attempts before dead-letter */
  maxAttempts: number;
  /** Base backoff in seconds */
  backoffBaseSeconds: number;
  /** Max backoff cap in seconds */
  backoffCapSeconds: number;
}

export const DEFAULT_DISPATCHER_CONFIG: DispatcherConfig = {
  batchSize: 25,
  pollIntervalMs: 1000,
  maxAttempts: 10,
  backoffBaseSeconds: 5,
  backoffCapSeconds: 600
};

export interface DispatchedEvent {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  attempt: number;
}

export interface DispatchResult {
  claimed: number;
  dispatched: number;
  failed: number;
  deadLettered: number;
}

export type DispatcherPool = InstanceType<typeof Pool>;

/**
 * Claim a batch of pending outbox events using FOR UPDATE SKIP LOCKED.
 * Returns the claimed rows (already incremented attempts).
 */
export async function claimBatch(
  pool: DispatcherPool,
  config: DispatcherConfig = DEFAULT_DISPATCHER_CONFIG
): Promise<DispatchedEvent[]> {
  const result = await pool.query<{
    id: string;
    event_type: string;
    aggregate_type: string;
    aggregate_id: string;
    payload_json: unknown;
    attempts: number;
  }>(`
    WITH claimed AS (
      SELECT id
      FROM outbox_events
      WHERE status = 'pending'
        AND available_at <= now()
      ORDER BY available_at, id
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE outbox_events o
    SET attempts = o.attempts + 1,
        updated_at = now()
    FROM claimed c
    WHERE o.id = c.id
    RETURNING o.id, o.event_type, o.aggregate_type, o.aggregate_id, o.payload_json, o.attempts
  `, [config.batchSize]);

  return result.rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    payload: row.payload_json,
    attempt: row.attempts
  }));
}

/**
 * Mark an event as successfully dispatched.
 */
export async function markDispatched(pool: DispatcherPool, eventId: string): Promise<void> {
  await pool.query(`
    UPDATE outbox_events
    SET status = 'published',
        dispatched_at = now(),
        last_error = NULL,
        updated_at = now()
    WHERE id = $1
  `, [eventId]);
}

/**
 * Record a dispatch failure. Applies exponential backoff via available_at.
 * If attempts >= maxAttempts, transitions to dead_letter status.
 */
export async function recordFailure(
  pool: DispatcherPool,
  eventId: string,
  error: string,
  attempts: number,
  config: DispatcherConfig = DEFAULT_DISPATCHER_CONFIG
): Promise<"retrying" | "dead_letter"> {
  if (attempts >= config.maxAttempts) {
    await pool.query(`
      UPDATE outbox_events
      SET status = 'dead_letter',
          last_error = $2,
          updated_at = now()
      WHERE id = $1
    `, [eventId, error]);
    return "dead_letter";
  }

  const backoffSeconds = Math.min(
    config.backoffCapSeconds,
    config.backoffBaseSeconds * Math.pow(2, attempts)
  );

  await pool.query(`
    UPDATE outbox_events
    SET status = 'pending',
        last_error = $2,
        available_at = now() + ($3 * interval '1 second'),
        updated_at = now()
    WHERE id = $1
  `, [eventId, error, backoffSeconds]);
  return "retrying";
}

/**
 * Dispatch a single event. In Round 3 this appends to structured log.
 * In Round 4 this will publish to SQS/EventBridge/Kafka.
 */
export function dispatchEvent(event: DispatchedEvent): void {
  const logEntry = {
    level: "info",
    msg: "outbox_dispatched",
    eventId: event.id,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    attempt: event.attempt,
    ts: new Date().toISOString()
  };
  process.stdout.write(JSON.stringify(logEntry) + "\n");
}

/**
 * Run one poll cycle: claim → dispatch → mark.
 */
export async function pollOnce(
  pool: DispatcherPool,
  config: DispatcherConfig = DEFAULT_DISPATCHER_CONFIG
): Promise<DispatchResult> {
  const batch = await claimBatch(pool, config);
  let dispatched = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const event of batch) {
    try {
      dispatchEvent(event);
      await markDispatched(pool, event.id);
      dispatched++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const result = await recordFailure(pool, event.id, errorMsg, event.attempt, config);
      if (result === "dead_letter") {
        deadLettered++;
      } else {
        failed++;
      }
    }
  }

  return { claimed: batch.length, dispatched, failed, deadLettered };
}

/**
 * Start the dispatcher loop. Returns a stop function.
 */
export function startDispatcher(
  pool: DispatcherPool,
  config: DispatcherConfig = DEFAULT_DISPATCHER_CONFIG
): { stop: () => void } {
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        await pollOnce(pool, config);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          JSON.stringify({ level: "error", msg: "dispatcher_poll_error", error: msg, ts: new Date().toISOString() }) + "\n"
        );
      }
      if (running) {
        await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
      }
    }
  };

  loop();
  return { stop: () => { running = false; } };
}
