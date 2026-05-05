-- Local-dev Postgres init script.
--
-- Postgres image runs every .sql file in /docker-entrypoint-initdb.d on
-- first boot of an empty data volume. We use it to create a non-superuser
-- application role so the RLS tests actually exercise row-level security
-- (SUPERUSER and BYPASSRLS roles silently bypass policies even with
-- FORCE ROW LEVEL SECURITY).
--
-- This file runs once per fresh data volume. After that, idempotency is
-- handled by the IF NOT EXISTS / DO blocks below.
--
-- Roles provisioned:
--   runwayops_app          NOSUPERUSER, owns nothing — used by tests and
--                          repo helpers via TEST_DATABASE_URL. RLS applies.
--   runwayops_admin        BYPASSRLS  — used only by migration tooling.
--                          Skipped here in development; production
--                          provisioning creates it explicitly.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runwayops_app') THEN
    CREATE ROLE runwayops_app
      LOGIN
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE
      INHERIT
      PASSWORD 'runwayops_app';
  END IF;
END $$;

GRANT CONNECT ON DATABASE runwayops_test TO runwayops_app;

-- runwayops_app needs CREATE on the DATABASE itself in order to issue
-- CREATE SCHEMA <name> (the test helper provisions per-run schemas).
-- Granting CREATE on schema public is NOT enough for that.
GRANT CREATE ON DATABASE runwayops_test TO runwayops_app;

-- Also USAGE / CREATE on the public schema so prior-art seed and migration
-- tooling has a workable namespace too.
GRANT USAGE, CREATE ON SCHEMA public TO runwayops_app;

-- For tables created by future migrations run as `postgres`, default privs
-- ensure runwayops_app can read/write through the normal repo paths.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO runwayops_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO runwayops_app;

-- The test helper (packages/db/tests/helpers/postgres.ts) creates a per-run
-- schema like `runwayops_test_<timestamp>_<rand>` and applies migrations
-- into it, so it owns those schemas itself and inherits the privileges.
