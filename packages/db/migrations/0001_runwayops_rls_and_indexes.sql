-- 0001_runwayops_rls_and_indexes
--
-- Hand-written migration. Drizzle-kit does not generate RLS DDL or partial
-- unique indexes correctly today, so we maintain this file by hand.
--
-- Scope:
--   1. Schema gaps: add collection_actions.due_at (timestamptz) for the
--      action queue hot path (spec section 6.1; current schema only had
--      due_date as a date).
--   2. Composite indexes for the four hot query paths called out by the spec
--      and the implementation plan.
--   3. Tenant-isolation Row Level Security on every table that carries
--      company_id, keyed off the session GUC `app.current_company_id`.
--   4. Content-hash dedup unique index on source_objects.

--------------------------------------------------------------------------------
-- 1. Schema gaps
--------------------------------------------------------------------------------

-- Action queue spec uses due_at (timestamptz). The Drizzle schema also defines
-- a date-only due_date for cases where we only know the calendar day. We add
-- due_at without dropping due_date so existing seeds keep working.
ALTER TABLE collection_actions ADD COLUMN IF NOT EXISTS due_at timestamptz;
--> statement-breakpoint

--------------------------------------------------------------------------------
-- 2. Composite indexes for hot query paths
--------------------------------------------------------------------------------

-- Hot path: action queue load.
--   "Show me the open / approval-required actions for this tenant in due order."
-- Supports queries of the form
--   WHERE company_id = $1 AND status IN (...) ORDER BY due_at NULLS LAST
-- The leading column is company_id (RLS predicate column), then status (low
-- cardinality), then due_at for ordering and range scans on time windows.
CREATE INDEX IF NOT EXISTS collection_actions_company_status_due_at_idx
  ON collection_actions (company_id, status, due_at);
--> statement-breakpoint

-- Hot path: forecast windowing.
--   "Find the most recent forecast(s) for this tenant for a given horizon."
-- Supports queries of the form
--   WHERE company_id = $1 AND horizon_days = $2 ORDER BY generated_at DESC
-- Leading by company_id (RLS predicate column), then generated_at for the
-- ORDER BY and range scans, then horizon_days as a tie-breaker / equality
-- predicate. We deliberately put generated_at before horizon_days because the
-- common access pattern is "latest forecast" first, with horizon as a filter.
CREATE INDEX IF NOT EXISTS cash_forecasts_company_generated_horizon_idx
  ON cash_forecasts (company_id, generated_at, horizon_days);
--> statement-breakpoint

-- Hot path: audit timeline.
--   "Show the audit history for entity X in tenant Y, newest first."
-- Spec naming is (company_id, target_kind, target_id, occurred_at) and the
-- physical schema in migration 0000 matches that field-for-field with the
-- domain auditEventSchema (no event-sourcing-style aggregate_* columns —
-- audit is who-did-what-to-what, distinct from outbox event sourcing).
--
-- This index supports queries of the form
--   WHERE company_id = $1 AND target_kind = $2 AND target_id = $3
--   ORDER BY occurred_at DESC
-- which is the dominant audit-timeline read pattern.
CREATE INDEX IF NOT EXISTS audit_events_company_target_occurred_at_idx
  ON audit_events (company_id, target_kind, target_id, occurred_at);
--> statement-breakpoint

-- Hot path: integration health.
--   "Which provider connections for this tenant have stale syncs?"
-- Picks integration_connections (not sync_jobs) because the dashboard view
-- groups by (tenant, provider) and reads last_successful_sync_at directly off
-- the connection. We treat last_successful_sync_at as last_sync_at semantically.
CREATE INDEX IF NOT EXISTS integration_connections_company_provider_last_sync_idx
  ON integration_connections (company_id, provider, last_successful_sync_at);
--> statement-breakpoint

-- Content-hash dedup for raw source payloads.
-- A re-import of an identical payload (same provider + same content_hash)
-- inside a tenant is treated as a no-op by repository code, but we add a
-- partial unique index so any racing dedup logic is enforced at the database
-- layer too. Partial index is keyed off non-null hash (the column is NOT NULL
-- already, so this is just `WHERE raw_payload_hash IS NOT NULL`'s no-op form).
-- We name the column raw_payload_hash physically; "content_hash" is the
-- domain term used in the spec and repository helpers.
CREATE UNIQUE INDEX IF NOT EXISTS source_objects_company_provider_payload_hash_unique
  ON source_objects (company_id, provider, raw_payload_hash);
--> statement-breakpoint

--------------------------------------------------------------------------------
-- 3. Row Level Security
--
-- Policy model:
--   * Every tenant-scoped table has RLS enabled and FORCE RLS so that the
--     table owner is also subject to policies (defense-in-depth: even a
--     compromised migration role cannot trivially read across tenants
--     unless it explicitly sets the GUC).
--   * Default policy is deny-by-default (no permissive policy = no rows).
--   * A single permissive policy named `<table>_tenant_isolation` reads the
--     session GUC `app.current_company_id` and matches it against
--     company_id (UUID equality after a safe cast).
--   * A bypass role pattern: a future role `runwayops_admin` can be granted
--     BYPASSRLS for migrations and the outbox dispatcher. We do not create
--     that role here because role provisioning is environment-specific; see
--     packages/db/docs/rls.md for the operational contract.
--
-- The GUC contract:
--   * The API request boundary calls
--       SELECT set_config('app.current_company_id', $1, true);
--     (the trailing `true` makes it transaction-local, matching SET LOCAL).
--   * If the GUC is unset or empty, current_setting('app.current_company_id', true)
--     returns NULL, the policy predicate evaluates to FALSE, and reads return
--     zero rows. Writes raise an RLS violation (sql state 42501).
--
-- Helper: a single SQL function that returns the active tenant as UUID, or
-- NULL when unset. Marked STABLE + leakproof-friendly so the planner can
-- inline it.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION runwayops_current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid
$$;
--> statement-breakpoint

-- Companies: special. A row is visible iff its own id matches the GUC.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY companies_tenant_isolation ON companies
  USING (id = runwayops_current_company_id())
  WITH CHECK (id = runwayops_current_company_id());
--> statement-breakpoint

-- Memberships: tenant-scoped on company_id. Memberships are how a user
-- proves they belong to the active tenant; the GUC has already been set by
-- the API after looking up the user's memberships.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY memberships_tenant_isolation ON memberships
  USING (company_id = runwayops_current_company_id())
  WITH CHECK (company_id = runwayops_current_company_id());
--> statement-breakpoint

-- All other tenant-scoped tables share the same predicate, so we generate
-- the policies in a DO block. Tables that need bespoke policies (companies,
-- memberships, users) are NOT in this list.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'company_policies',
    'source_objects',
    'integration_connections',
    'integration_tokens',
    'sync_jobs',
    'sync_cursors',
    'webhook_events',
    'idempotency_keys',
    'customers',
    'customer_contacts',
    'bank_accounts',
    'bank_transactions',
    'invoices',
    'invoice_line_items',
    'payments',
    'critical_obligations',
    'communication_threads',
    'communication_messages',
    'promise_to_pay_records',
    'cash_forecasts',
    'forecast_scenarios',
    'collection_actions',
    'collection_action_results',
    'message_drafts',
    'approval_requests',
    'approval_decisions',
    'audit_events',
    'outbox_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (company_id = runwayops_current_company_id()) WITH CHECK (company_id = runwayops_current_company_id())',
      t || '_tenant_isolation',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint

-- users is intentionally NOT under company_id-keyed RLS. Users are global by
-- email and accessed via memberships. The application layer is responsible
-- for never returning a user record outside the membership join. We still
-- enable RLS to deny the default and add a permissive policy that allows
-- reads of any user the active tenant has a membership for, plus the user
-- themselves where the auth provider id matches a future GUC. For now we
-- expose users to any authenticated session (no GUC-scoped predicate)
-- because login itself runs before any tenant is selected.
--
-- Operational contract: callers MUST join users to memberships and filter on
-- memberships.company_id = current GUC. Do not select * from users.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_via_membership ON users
  USING (
    EXISTS (
      SELECT 1
      FROM memberships m
      WHERE m.user_id = users.id
        AND m.company_id = runwayops_current_company_id()
    )
  )
  WITH CHECK (true);
--> statement-breakpoint

--------------------------------------------------------------------------------
-- 5. Role privilege grants (BYPASSRLS / RLS-enforced)
--
-- The runtime expects three roles per environment:
--
--   runwayops_admin       -- BYPASSRLS, owns migrations + maintenance.
--                            Provision: CREATE ROLE runwayops_admin BYPASSRLS;
--   runwayops_api         -- regular role, RLS enforced via the GUC. The API
--                            process logs in as this role.
--   runwayops_dispatcher  -- regular role, RLS enforced via the GUC. The
--                            outbox dispatcher worker logs in as this role.
--
-- Role CREATE belongs in environment provisioning (it requires superuser)
-- and is intentionally NOT in this migration. This block grants table
-- privileges IF the roles exist. Re-running is safe.
--
-- See packages/db/docs/rls.md for the full operator guide.
--------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runwayops_api') THEN
    GRANT USAGE ON SCHEMA public TO runwayops_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO runwayops_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO runwayops_api;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO runwayops_api;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO runwayops_api;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runwayops_dispatcher') THEN
    -- Dispatcher only needs to claim, update, and read the outbox + audit.
    GRANT USAGE ON SCHEMA public TO runwayops_dispatcher;
    GRANT SELECT, UPDATE ON outbox_events TO runwayops_dispatcher;
    GRANT SELECT, INSERT ON audit_events TO runwayops_dispatcher;
    GRANT SELECT ON companies, memberships, users TO runwayops_dispatcher;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runwayops_admin') THEN
    GRANT ALL ON SCHEMA public TO runwayops_admin;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO runwayops_admin;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO runwayops_admin;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO runwayops_admin;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO runwayops_admin;
  END IF;
END $$;
--> statement-breakpoint
