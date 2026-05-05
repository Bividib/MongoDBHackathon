# Row Level Security (RLS) policy model

## Goal

Postgres enforces tenant isolation independently of the application. Even if
an API handler forgets a `where company_id = ?` clause, the database returns
zero rows and rejects writes that would leak across tenants.

## How it works

1. Every tenant-scoped table (every table that has `company_id`) has
   `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL SECURITY`. Forcing means
   the table owner is also subject to policies — defense in depth against a
   compromised migration role.
2. Each table has exactly one permissive policy named
   `<table>_tenant_isolation` whose `USING` and `WITH CHECK` predicates are
   both `company_id = runwayops_current_company_id()`.
3. `runwayops_current_company_id()` is a `STABLE SQL` function that reads
   the session GUC `app.current_company_id`, casts it to UUID, and returns
   NULL when unset.
4. With no GUC set, the predicate is `company_id = NULL`, which is FALSE for
   every row. Reads return zero rows. Writes raise `42501 row-level
   security policy violation`.

The migration that installs all of this is
`packages/db/migrations/0001_runwayops_rls_and_indexes.sql`.

## Special tables

| Table         | Predicate                                                  | Why                                                                          |
| ------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `companies`   | `id = runwayops_current_company_id()`                      | Owns no `company_id`; the row IS the tenant.                                 |
| `users`       | Permits rows whose `id` has a membership in the active GUC | Users are global by email but only readable in the context of a membership.  |
| `memberships` | `company_id = runwayops_current_company_id()`              | Standard. Lookup-by-user during login MUST be done from a BYPASSRLS service. |

## Setting the GUC at the API boundary

Repository code never sets the GUC directly outside transactions. Use
`withTenant` from `@runwayops/db/repositories`:

```ts
import { createDb, repositories } from "@runwayops/db";

const db = createDb();
const result = await repositories.withTenant(db, companyId, async (tx) => {
  // Every query inside this callback runs with RLS pinned to companyId.
  return tx.select().from(invoices);
});
```

The helper executes
`SELECT set_config('app.current_company_id', $1, true)` as the first
statement of the transaction. The `true` makes the GUC transaction-local,
so it is automatically released on commit or rollback.

If you cannot use `withTenant` (e.g. you already own the transaction), call
`setTenant(tx, companyId)` as the first statement of the transaction.

## What happens if the GUC is unset

```sql
BEGIN;
-- no SET LOCAL or set_config
SELECT count(*) FROM invoices;  -- returns 0
INSERT INTO invoices (company_id, ...) VALUES (...);  -- 42501 RLS violation
COMMIT;
```

Application code should never rely on this — always set the GUC explicitly
— but it is safe to do so as a last line of defense.

## Bypass role for migrations and the dispatcher

Some operations must read or write across tenants:

- The migration runner applying schema changes.
- The transactional outbox dispatcher (a future `apps/workers` process)
  that polls `outbox_events` for any tenant ready to publish.
- Admin / support tooling.

The pattern is to run those operations as a Postgres role with the
`BYPASSRLS` attribute. We recommend creating a role per persona, not a
single all-bypass superuser:

```sql
-- Run once per environment, by an operator.
CREATE ROLE runwayops_admin WITH LOGIN BYPASSRLS PASSWORD '<env-secret>';
GRANT USAGE ON SCHEMA public TO runwayops_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO runwayops_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO runwayops_admin;

CREATE ROLE runwayops_dispatcher WITH LOGIN BYPASSRLS PASSWORD '<env-secret>';
GRANT USAGE ON SCHEMA public TO runwayops_dispatcher;
GRANT SELECT, UPDATE ON outbox_events TO runwayops_dispatcher;
```

The application API connects as a third role (e.g. `runwayops_api`) that
does NOT have `BYPASSRLS`. That role is what RLS protects you from.

We do not create these roles in the migration because role provisioning is
environment-specific and the connection string for migrations is usually a
superuser anyway.

## Adding a new tenant-scoped table

When you add a table with a `company_id` column:

1. In the schema file, declare `companyId: uuid("company_id").notNull().references(...)`.
2. In a new migration, add:

   ```sql
   ALTER TABLE my_new_table ENABLE ROW LEVEL SECURITY;
   ALTER TABLE my_new_table FORCE ROW LEVEL SECURITY;
   CREATE POLICY my_new_table_tenant_isolation ON my_new_table
     USING (company_id = runwayops_current_company_id())
     WITH CHECK (company_id = runwayops_current_company_id());
   ```

3. Add an integration test that proves cross-tenant isolation. See
   `packages/db/tests/rls.test.ts` for the template.

For tables that are NOT tenant-scoped (very rare in this codebase) the
default should still be deny-by-default plus an explicit policy that
documents the intended access.
