import { drizzle } from "drizzle-orm/node-postgres";
import { DataType, newDb } from "pg-mem";
import pg from "pg";

import * as schema from "../../src/schema/index.js";

export type MemDbContext = {
  pool: pg.Pool;
  db: ReturnType<typeof drizzle<typeof schema>>;
  reset: () => Promise<void>;
};

/**
 * Spin up an in-memory Postgres bound to a Drizzle client.
 *
 * pg-mem covers DDL, DML, JSONB, and basic indexes — enough to test the
 * shape and semantics of the repository helpers. It does NOT support RLS,
 * `current_setting`, or partial unique indexes; tests that rely on those
 * features must run against a real Postgres (see `tests/helpers/postgres.ts`).
 *
 * We bootstrap the schema with a hand-trimmed DDL that mirrors the
 * production migration's CREATE TABLE / CREATE INDEX statements but skips
 * extensions, triggers, and RLS — the subset pg-mem can run.
 */
export async function createMemDb(): Promise<MemDbContext> {
  const mem = newDb({ autoCreateForeignKeyIndices: true });

  // pg-mem ships shims for some functions but not all. Register the ones
  // our DDL relies on. `impure: true` is critical — without it pg-mem
  // treats the function as deterministic and reuses the first generated
  // UUID for every DEFAULT-driven insert.
  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    impure: true,
    implementation: () => crypto.randomUUID(),
  });

  // Apply the trimmed DDL.
  mem.public.none(MEM_DDL);

  const adapter = mem.adapters.createPg() as { Pool: new () => pg.Pool };
  const pool = new adapter.Pool();

  // Drizzle's node-postgres driver sets a `types: { getTypeParser }` field on
  // every query, which pg-mem rejects with "getTypeParser is not supported".
  // Strip that field before pg-mem sees the query (both on pool.query and on
  // any client returned by pool.connect, since transactions go through the
  // client path).
  patchStripTypes(pool);

  const db = drizzle(pool, { schema });

  return {
    pool,
    db,
    reset: async () => {
      mem.public.none(TRUNCATE_DDL);
    },
  };
}

type QueryFn = (...args: unknown[]) => unknown;
type AdaptedQuery = {
  args: unknown[];
  needsArrayMode: boolean;
  cols: string[] | null;
};

/**
 * drizzle's node-postgres driver attaches two fields pg-mem rejects:
 *   * `types: { getTypeParser }`  → "getTypeParser is not supported"
 *   * `rowMode: 'array'`           → "pg rowMode is not supported"
 * On the response side, drizzle expects array-mode rows (arrays indexed by
 * column position from the SQL projection). pg-mem always returns objects
 * keyed by column name. We therefore:
 *   1. Strip `types` and `rowMode` from the outbound query.
 *   2. After pg-mem returns, if the original query asked for array mode,
 *      convert each row from `{ col: value }` to `[value, ...]` in the
 *      column order parsed from the SQL projection (RETURNING / SELECT).
 */
function adaptQuery(args: unknown[]): AdaptedQuery {
  const first = args[0];
  if (!first || typeof first !== "object") {
    return { args, needsArrayMode: false, cols: null };
  }
  const obj = first as Record<string, unknown>;
  const wantsArray = obj.rowMode === "array";
  if (!("types" in obj) && !("rowMode" in obj)) {
    return { args, needsArrayMode: false, cols: null };
  }
  const text = typeof obj.text === "string" ? obj.text : "";
  const cleaned = { ...obj };
  delete cleaned.types;
  delete cleaned.rowMode;
  return {
    args: [cleaned, ...args.slice(1)],
    needsArrayMode: wantsArray,
    cols: wantsArray ? extractProjectionCols(text) : null,
  };
}

const COL_RE = /"([^"]+)"/g;

function extractProjectionCols(sql: string): string[] | null {
  const lower = sql.toLowerCase();
  // Prefer the LAST `returning` clause (handles INSERT/UPDATE/DELETE).
  const retIdx = lower.lastIndexOf(" returning ");
  if (retIdx >= 0) {
    return parseColList(sql.slice(retIdx + " returning ".length));
  }
  // Otherwise pick the FIRST `select ... from` projection.
  const selMatch = lower.match(/^\s*select\s/);
  if (selMatch) {
    const fromIdx = lower.search(/\sfrom\s/);
    if (fromIdx > 0) {
      const projection = sql.slice(selMatch[0].length, fromIdx);
      return parseColList(projection);
    }
  }
  return null;
}

function parseColList(projection: string): string[] {
  const cols: string[] = [];
  let m: RegExpExecArray | null;
  COL_RE.lastIndex = 0;
  while ((m = COL_RE.exec(projection)) !== null) {
    cols.push(m[1]!);
  }
  return cols.length > 0 ? cols : projection
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function rowsToArrayMode(
  result: unknown,
  cols: string[],
): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as { rows?: unknown[] };
  if (!Array.isArray(r.rows) || r.rows.length === 0) return result;
  if (Array.isArray(r.rows[0])) return result; // already array mode
  r.rows = r.rows.map((row) => {
    const o = row as Record<string, unknown>;
    return cols.map((c) => o[c]);
  });
  return result;
}

function patchStripTypes(pool: pg.Pool): void {
  const wrap = (origRaw: QueryFn) => {
    return (async (...args: unknown[]) => {
      const adapted = adaptQuery(args);
      const result = await origRaw(...adapted.args);
      if (adapted.needsArrayMode && adapted.cols) {
        return rowsToArrayMode(result, adapted.cols);
      }
      return result;
    }) as QueryFn;
  };

  const poolAny = pool as unknown as { query: QueryFn; connect: QueryFn };
  const origPoolQuery = poolAny.query.bind(pool) as QueryFn;
  poolAny.query = wrap(origPoolQuery);

  const origConnect = poolAny.connect.bind(pool) as QueryFn;
  poolAny.connect = (async (...args: unknown[]) => {
    const client = (await origConnect(...args)) as { query: QueryFn };
    const origClientQuery = client.query.bind(client) as QueryFn;
    client.query = wrap(origClientQuery);
    return client;
  }) as QueryFn;
}

// Minimal schema trimmed to what the repository tests actually touch.
// Using TEXT instead of CHAR(3) for currency to dodge pg-mem strictness.
// Keep ordering: parents first, children later for FK creation.
const MEM_DDL = `
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  display_name text NOT NULL,
  legal_name text,
  slug text NOT NULL,
  base_currency text NOT NULL DEFAULT 'GBP',
  country_code text NOT NULL DEFAULT 'GB',
  timezone text NOT NULL DEFAULT 'Europe/London',
  status text NOT NULL DEFAULT 'active',
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE source_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_object_type text NOT NULL,
  provider_object_id text NOT NULL,
  source_updated_at timestamptz,
  raw_payload jsonb NOT NULL,
  raw_payload_hash text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_objects_provider_identity_unique
    UNIQUE (company_id, provider, provider_object_type, provider_object_id),
  CONSTRAINT source_objects_company_provider_payload_hash_unique
    UNIQUE (company_id, provider, raw_payload_hash)
);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_json jsonb,
  status_code integer,
  expires_at timestamptz NOT NULL,
  CONSTRAINT idempotency_keys_company_scope_key_unique UNIQUE (company_id, scope, key)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_type text NOT NULL,
  actor_id text,
  action text NOT NULL,
  target_kind text NOT NULL,
  target_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  correlation_id uuid,
  causation_event_id uuid
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  last_error text,
  audit_event_id uuid REFERENCES audit_events(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX outbox_events_idempotency_key_unique
  ON outbox_events (idempotency_key);
`;

const TRUNCATE_DDL = `
DELETE FROM outbox_events;
DELETE FROM audit_events;
DELETE FROM idempotency_keys;
DELETE FROM source_objects;
DELETE FROM companies;
`;
