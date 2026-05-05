# Idempotency-Key TTL Cleanup

## Policy

Idempotency keys in `idempotency_keys` table have a TTL set at creation
(default: 24 hours, configurable per-call via `ttlHours`).

A background process must periodically remove expired rows to prevent
unbounded table growth.

## Mechanism

The `IdempotencyCleanupWorkflow` runs as a Temporal workflow with an
internal 1-hour sleep loop. Each iteration executes the
`cleanupExpiredIdempotencyKeys` activity which runs:

```sql
DELETE FROM idempotency_keys WHERE expires_at < now()
```

## Scheduling

Option A — Temporal cron schedule:

```ts
await client.workflow.start(IdempotencyCleanupWorkflow, {
  taskQueue: "runwayops-workers",
  workflowId: "idempotency-cleanup",
  cronSchedule: "0 * * * *" // every hour
});
```

Option B — Single long-running workflow (current implementation):

```ts
await client.workflow.start(IdempotencyCleanupWorkflow, {
  taskQueue: "runwayops-workers",
  workflowId: "idempotency-cleanup"
});
```

The workflow sleeps internally. It survives restarts via Temporal's
durable execution. Only one instance should run (`REJECT_DUPLICATE`
workflow ID reuse policy).

## Configuration

| Parameter | Default | Notes |
|-----------|---------|-------|
| TTL per key | 24h | Set at reservation time |
| Cleanup interval | 1 hour | Internal sleep in workflow |
| Retry policy | RETRY_TRANSIENT | Standard exponential backoff |

## Operator notes

- If the cleanup workflow is not running, keys accumulate but the system
  still functions correctly — expired keys are simply inert.
- Monitor the `idempotency_keys` table row count. Alert if it grows
  beyond 100k rows (indicates cleanup is stalled).
- The cleanup activity uses `ADMIN_DATABASE_URL` (BYPASSRLS) because
  it must delete across all tenants.
