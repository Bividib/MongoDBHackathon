# Testing strategy

## Two-tier approach

We split the test surface in two:

1. **Unit / structural tests (always-on)** run against
   [pg-mem](https://github.com/oguimbal/pg-mem), an in-memory Postgres
   emulator. Fast (single-digit ms per test), zero external deps. Suitable
   for verifying SQL shape, repository logic, idempotency replay, content
   hash dedup, and outbox enqueue semantics.

2. **RLS smoke test (opt-in)** runs against a real Postgres because
   pg-mem does not implement Row Level Security. The test is gated on the
   environment variable `TEST_DATABASE_URL`. Set it to a throwaway
   Postgres (`testcontainers`, a local Docker container, or a CI service)
   to enable. When unset the test is skipped with a clear log line.

Vitest is the test runner. The default `npm test` recipe runs the
typecheck step plus the unit tests. The RLS smoke test is part of the
same suite and self-skips when the DB is absent — `npm test` is therefore
green on a developer machine with no Postgres installed.

## Why pg-mem instead of testcontainers as the default

| Concern        | pg-mem                                       | @testcontainers/postgresql              |
| -------------- | -------------------------------------------- | --------------------------------------- |
| Cold start     | ~10 ms                                       | 5–30 s (pull image, boot, wait healthy) |
| Dependencies   | Pure JS                                      | Requires Docker daemon                  |
| RLS support    | No                                           | Yes                                     |
| JSONB          | Yes                                          | Yes                                     |
| Triggers       | Limited (we work around our `updated_at` trigger) | Full                              |
| CI ergonomics  | Trivial                                      | Needs a Docker-in-Docker runner         |

For repository-shape tests pg-mem is plenty. For RLS we MUST use real
Postgres because the policy DSL, `current_setting`, and force-RLS are not
emulated. Hence the gated smoke test.

If you want to run the RLS test locally:

```bash
docker run --rm -d --name runwayops-rls -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm test --prefix packages/db
docker rm -f runwayops-rls
```

In CI, prefer `@testcontainers/postgresql` to manage the lifecycle. We did
not add it as a devDependency to keep the default install lean; add it
when wiring CI.

## What is covered

### Always-on (pg-mem)

- **Source-object content-hash dedup:** `upsertSourceObject` returns
  `inserted` once and `duplicate` for re-imports of the same payload.
  Cross-tenant isolation of the dedup is also covered.
- **Outbox enqueue (insert + idempotency):** `enqueueOutbox` writes the
  row with the requested payload, and the second call with the same
  `idempotency_key` returns the original row.
- **Idempotency reservation (insert + completion + tenant scope):** a
  fresh reservation persists, completion records the response, and the
  same `(scope, key)` reused in a different tenant is also fresh.

### Gated on `TEST_DATABASE_URL` (real Postgres)

- **Tenant isolation (RLS smoke):** insert rows for company A and B, set
  the GUC to A, expect to see only A's rows; flip and verify the inverse;
  unset and verify zero rows; reject cross-tenant writes.
- **Idempotency replay & conflict:** the second reservation with the same
  `(scope, key, requestHash)` returns `replay` with the recorded
  response; with a different hash it returns `conflict`.
- **Outbox transactional rollback:** when the enclosing transaction
  rolls back, the outbox row is undone and the same idempotency key is
  re-enqueueable.

The replay/conflict assertions and the rollback assertion are gated on
real Postgres because pg-mem diverges from Postgres in two ways that
matter here:

1. `INSERT ... ON CONFLICT (cols) DO NOTHING RETURNING` returns the
   existing row on conflict instead of zero rows.
2. drizzle's node-postgres pool/client BEGIN/ROLLBACK does not propagate
   correctly through pg-mem's adapter.

The repository code itself is correct against real Postgres (where the
hot path lives); we test the structural part of the same code on pg-mem
so the default `npm test` is fast and dependency-free.

## File layout

```
packages/db/
├── src/repositories/      # implementation under test
└── tests/
    ├── helpers/
    │   ├── pg-mem.ts      # bootstrap an in-memory schema + Drizzle client
    │   └── postgres.ts    # connect to TEST_DATABASE_URL, run migrations
    ├── idempotency.test.ts   # pg-mem: structural reserve + complete + tenant scope
    ├── outbox.test.ts        # pg-mem: structural insert + idempotency replay
    ├── source-dedup.test.ts  # pg-mem: full content-hash dedup
    ├── repos-real.test.ts    # gated on TEST_DATABASE_URL: idempotency replay/conflict, outbox rollback
    └── rls.test.ts           # gated on TEST_DATABASE_URL: tenant isolation
```

## Adding a test

For a new repository helper, default to a pg-mem unit test:

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { createMemDb, type MemDb } from "./helpers/pg-mem.js";

describe("myHelper", () => {
  let db: MemDb;
  beforeEach(async () => {
    db = await createMemDb();
  });

  it("does the thing", async () => {
    // ...
  });
});
```

Reach for the real-Postgres path only if the helper depends on RLS,
listen/notify, advisory locks, or other features pg-mem does not support.
