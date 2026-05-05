#!/usr/bin/env node
// Run the full verifier with TEST_DATABASE_URL pointed at a real Postgres,
// so the 8 RLS / repo-real tests actually run instead of skipping.
//
// Usage:
//   node scripts/verify-full.mjs            # boots compose, runs verify, leaves it up
//   node scripts/verify-full.mjs --down     # tears down the compose stack
//
// Why this exists: the default `npm run verify` runs against pg-mem for the
// db package's tests, which silently passes RLS tests because pg-mem does
// not enforce policies. This script provisions a real Postgres, points
// TEST_DATABASE_URL at the non-superuser role provisioned by
// scripts/postgres-init/01-app-role.sql, and re-runs verify so the
// real-Postgres-gated suite actually exercises tenant isolation.

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const COMPOSE_HOST = "127.0.0.1";
const COMPOSE_PORT = 54329;
const COMPOSE_DB = "runwayops_test";
const COMPOSE_APP_USER = "runwayops_app";
const COMPOSE_APP_PASS = "runwayops_app";
const COMPOSE_SUPER_USER = "postgres";
const COMPOSE_SUPER_PASS = "postgres_dev_only";

const TEST_DATABASE_URL = `postgres://${COMPOSE_APP_USER}:${COMPOSE_APP_PASS}@${COMPOSE_HOST}:${COMPOSE_PORT}/${COMPOSE_DB}`;
const ADMIN_DATABASE_URL = `postgres://${COMPOSE_SUPER_USER}:${COMPOSE_SUPER_PASS}@${COMPOSE_HOST}:${COMPOSE_PORT}/${COMPOSE_DB}`;

const args = process.argv.slice(2);

function run(label, cmd, cmdArgs, opts = {}) {
  console.log(`\n==> ${label}`);
  const res = spawnSync(cmd, cmdArgs, {
    cwd: opts.cwd ?? rootDir,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: opts.silent ? "pipe" : "inherit",
    shell: false,
  });
  if (res.status !== 0) {
    if (opts.silent && res.stdout) process.stdout.write(res.stdout);
    if (opts.silent && res.stderr) process.stderr.write(res.stderr);
    console.error(`\nverify-full failed at: ${label}`);
    process.exit(res.status ?? 1);
  }
  return res;
}

function tryRun(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, {
    cwd: opts.cwd ?? rootDir,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: "pipe",
    shell: false,
  });
}

if (args.includes("--down")) {
  run("compose down", "docker", ["compose", "down", "-v"]);
  console.log("\nTeardown complete.");
  process.exit(0);
}

run("compose up postgres", "docker", ["compose", "up", "-d", "postgres"]);

console.log("\n==> waiting for postgres healthcheck + init scripts");
// pg_isready returns 0 during the init-script phase too, so we probe for the
// actual runwayops_app role created by 01-app-role.sql before trusting the
// container. The init scripts only run on first boot of the data volume.
const startedAt = Date.now();
const timeoutMs = 60_000;
let healthy = false;
while (Date.now() - startedAt < timeoutMs) {
  const probe = tryRun("docker", [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    COMPOSE_SUPER_USER,
    "-d",
    COMPOSE_DB,
    "-tAc",
    "SELECT 1 FROM pg_roles WHERE rolname = 'runwayops_app'",
  ]);
  if (probe.status === 0 && probe.stdout?.toString().trim() === "1") {
    healthy = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}
if (!healthy) {
  console.error("postgres did not become ready (with init scripts applied) within 60s");
  process.exit(1);
}
console.log("postgres ready (runwayops_app role provisioned)");

// Apply migrations as the superuser. We blow away any existing public-schema
// state from a prior run so migrations can re-apply cleanly. Only the public
// schema in the runwayops_test database is touched.
//
// We also re-apply role grants here (idempotently) so existing data volumes
// from before scripts/postgres-init/01-app-role.sql learned about the
// database-level CREATE privilege still get the right grants.
console.log("\n==> resetting public schema and re-applying migrations + grants");
run(
  "drop+recreate public schema + role grants",
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    COMPOSE_SUPER_USER,
    "-d",
    COMPOSE_DB,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    [
      "DROP SCHEMA IF EXISTS public CASCADE",
      "CREATE SCHEMA public",
      "GRANT CREATE ON DATABASE runwayops_test TO runwayops_app",
      "GRANT USAGE, CREATE ON SCHEMA public TO runwayops_app",
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO runwayops_app",
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO runwayops_app",
    ].join("; "),
  ],
);

run(
  "db:migrate (against real PG)",
  "npm",
  ["run", "db:migrate", "--prefix", resolve(rootDir, "packages/db")],
  { env: { DATABASE_URL: ADMIN_DATABASE_URL } },
);

run(
  "verify-packages with TEST_DATABASE_URL + ADMIN_DATABASE_URL set",
  "node",
  [resolve(rootDir, "scripts/verify-packages.mjs")],
  {
    env: {
      // The app role pool (RLS enforced) — under-test code runs through this.
      TEST_DATABASE_URL,
      // The admin pool (BYPASSRLS) — for cross-tenant seed in beforeAll only.
      ADMIN_DATABASE_URL,
    },
  },
);

console.log("\nverify:full passed. compose stack left up — run with --down to tear it down.");
console.log(`TEST_DATABASE_URL=${TEST_DATABASE_URL}`);
console.log(`ADMIN_DATABASE_URL=${ADMIN_DATABASE_URL}`);
