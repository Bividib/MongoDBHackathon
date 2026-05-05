# Transactional outbox

## Why

We use the transactional-outbox pattern to publish domain events
exactly-once-with-effect from operations that mutate Postgres state. The
producer writes the canonical row AND the outbox row in the same
transaction. A separate dispatcher (out of scope for `packages/db`)
polls the outbox and publishes events to the bus.

Reference: [AWS prescriptive guidance — transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).

## Producer contract (this package)

`enqueueOutbox(tx, event)` participates in the same Drizzle transaction as
the canonical mutation. It is idempotent on `idempotency_key`: re-running
the same producer with the same key returns the existing row and does not
duplicate.

```ts
import { createDb, repositories } from "@runwayops/db";
const { withTenant, enqueueOutbox } = repositories;

const db = createDb();

await withTenant(db, companyId, async (tx) => {
  const [action] = await tx.insert(collectionActions).values({ /* ... */ }).returning();

  await enqueueOutbox(tx, {
    companyId,
    eventType: "collection_action.recommended",
    aggregateType: "collection_action",
    aggregateId: action.id,
    payload: { actionId: action.id },
    idempotencyKey: `collection_action.recommended:${action.id}`,
  });
});
```

If `enqueueOutbox` throws, the surrounding transaction rolls back and the
canonical mutation is undone. There is no dual-write window.

## Outbox row contract

| Column            | Type        | Notes                                                                |
| ----------------- | ----------- | -------------------------------------------------------------------- |
| `id`              | uuid PK     | Generated server-side.                                               |
| `company_id`      | uuid FK     | Tenant scope. RLS-protected.                                         |
| `event_type`      | text        | Domain event name (e.g. `collection_action.recommended`).            |
| `aggregate_type`  | text        | The kind of entity the event is about.                               |
| `aggregate_id`    | uuid        | The id of that entity.                                               |
| `payload_json`    | jsonb       | Free-form domain payload.                                            |
| `headers_json`    | jsonb       | Routing / tracing metadata (correlation id, causation id, etc).      |
| `idempotency_key` | text UNIQUE | Producer-supplied. Replay-safe.                                      |
| `status`          | text        | `pending` → `published` → optionally `failed` after retries exhaust. |
| `attempts`        | int         | Incremented by the dispatcher.                                       |
| `available_at`    | timestamptz | NOT NULL. Earliest time the dispatcher may attempt this event.       |
| `published_at`    | timestamptz | Set by the dispatcher on success.                                    |
| `last_error`      | text        | Last failure message, for diagnostics.                               |
| `audit_event_id`  | uuid FK     | Optional link to the audit_events row that backs this event.         |
| `created_at`      | timestamptz | Inserted by the producer.                                            |
| `updated_at`      | timestamptz | Auto-bumped by the existing trigger.                                 |

The current schema names the timestamp column `published_at` rather than
`dispatched_at` (the term the spec uses interchangeably). Treat them as
synonyms in code review; we did not rename to avoid sibling churn.

## Dispatcher contract (out of scope for this package)

A future worker in `apps/workers` (or `apps/api` background loop) will
consume this table. The contract:

### 1. Claim

```sql
WITH claimed AS (
  SELECT id
  FROM outbox_events
  WHERE status = 'pending'
    AND available_at <= now()
  ORDER BY available_at, id
  LIMIT $batch
  FOR UPDATE SKIP LOCKED
)
UPDATE outbox_events o
SET attempts = o.attempts + 1,
    updated_at = now()
FROM claimed c
WHERE o.id = c.id
RETURNING o.*;
```

`FOR UPDATE SKIP LOCKED` lets multiple dispatcher workers run safely
without coordination — each gets a disjoint slice of pending rows.

The dispatcher process MUST run as a role that bypasses RLS (see
`docs/rls.md`) because it operates across tenants.

### 2. Publish

For each claimed row:

- Send the event to the downstream bus (SQS / EventBridge / Kafka / etc).
- The downstream consumer is responsible for de-duplicating on
  `headers_json.event_id` (or `id`) since this pipeline is at-least-once.

### 3. Mark dispatched OR record failure

On success:

```sql
UPDATE outbox_events
   SET status = 'published',
       published_at = now(),
       last_error = NULL
 WHERE id = $1;
```

On failure:

```sql
UPDATE outbox_events
   SET status = CASE
                  WHEN attempts >= $max_attempts THEN 'failed'
                  ELSE 'pending'
                END,
       last_error = $error,
       available_at = now() + ($backoff_seconds * interval '1 second')
 WHERE id = $1;
```

### Backoff

Exponential with jitter, capped:

```
backoff_seconds = min(cap, base * 2^attempts) * (0.5 + random())
```

Recommended starting parameters: `base = 5`, `cap = 600`, `max_attempts = 10`.

### Visibility timeout

We do not keep an in-memory lease — the lock is the row-level lock
acquired by `FOR UPDATE`. If the dispatcher crashes mid-publish:

- The transaction rolls back.
- `attempts` is NOT incremented (the UPDATE that bumped it is rolled
  back too).
- The row stays `status = 'pending'` and is re-claimable immediately.

If you want a true visibility timeout, increment `available_at` inside the
claim transaction before commit.

## Producer guarantees

- **At-least-once** delivery to downstream.
- **Idempotency key** is producer-supplied. Replays of the same producer
  command see the existing outbox row and do not duplicate.
- **Causal ordering per aggregate** is best-effort: the outbox is FIFO by
  `available_at, id` within a single dispatcher worker, but with multiple
  workers two events on the same aggregate may interleave. Consumers that
  care about order should apply payloads idempotently and check version
  numbers / `last_source_updated_at`.

## Failure modes to test

| Scenario                           | Expected behavior                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Producer transaction rolls back    | Outbox row is also rolled back. No phantom event.                                                            |
| Producer enqueues same key twice   | Second call returns the existing row, no duplicate.                                                          |
| Dispatcher crashes after publish   | Row status remains `pending`; re-publish on next claim. Downstream must dedup.                               |
| Dispatcher crashes before publish  | Row status remains `pending`; re-claim on next loop. `attempts` is the post-claim counter, not pre-publish.  |
| Downstream rejects payload forever | Row hits `max_attempts` and flips to `status = 'failed'`. Operator dashboard surfaces these for human triage. |
