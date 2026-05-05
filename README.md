# RunwayOps

Cash-aware receivables operations for SMBs. The system reads facts from
finance integrations, projects cash forward, ranks the best
collections actions to keep critical obligations covered, drafts
human-approved communications, and learns from outcomes.

**Status:** simulated daily action loop end-to-end across foundation
packages, API, web, workers, and policy engine. 228 tests pass via
`npm run verify:full` (real Postgres + RLS + dispatcher + e2e workflow
simulation + API policy gate).

Source of truth for product + architecture:
- [`New Spec.md`](./New%20Spec.md) — full product specification
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — phased build manual

---

## Architecture

Five typed packages and three apps, coordinated via a single
`verify-packages.mjs` cross-check.

```
packages/
  domain/       Canonical types: Money (bigint), branded ids, Zod schemas
                for every entity. The single source of truth for shapes.
  cash-engine/  Deterministic forecast / risk / ranking / matching.
                Pure functions, no I/O, no AI. Boundary mappers project
                engine output into domain canonical shapes.
  ai/           ModelRouter (mock by default), structured-output schemas,
                proposal mappers, named policy validators, adversarial
                prompt-injection corpus, threshold-gated eval suite.
  db/           Drizzle/Postgres schema, RLS policies (deny-by-default
                tenant isolation via app.current_company_id GUC), 9
                repositories, transactional outbox enqueue.
  policy/       Deterministic rules engine. Hard-refusal rules
                (rejectIfPaymentInitiation, rejectIfMissingEvidence, etc).
                GatePassedAction branded type as the dispatch chokepoint.

apps/
  api/          Fastify HTTP API. Tenancy GUC middleware, idempotency,
                policy gate at approve time, audit + outbox propagation,
                bigint-safe JSON serialization.
  web/          Next.js 15 operational UI (Daily Cash Actions, Approval
                Inbox, Forecast). Currently fixture-driven; switches to
                real API in Round 4.
  workers/      Temporal workflows + activities. Outbox dispatcher with
                claim/retry/dead-letter. Replay-deterministic; activity
                bodies do all I/O.

legacy/         Original prototype (Next + Mongo + LangGraph + voice
                agents). Preserved for potential Phase 11+ revival of
                the voice channel. Not imported anywhere.
```

---

## Quick start

Requirements:
- Node.js >= 22.6 (cash-engine uses bigint test runner)
- npm 10+
- Docker + docker-compose (for `verify:full`)

```bash
# Install root tooling
npm install

# Install per-workspace deps (file: links, not npm workspaces)
for pkg in packages/domain packages/cash-engine packages/ai packages/db \
           packages/policy apps/workers apps/api apps/web; do
  npm install --prefix "$pkg"
done

# Fast verifier — typecheck + build + tests for every package and app
# (uses pg-mem for db tests, replay harness for workers)
npm run verify

# Full verifier — boots Postgres via docker-compose and runs the
# real-PG-gated tests too (RLS isolation, dispatcher claim/retry,
# end-to-end workflow simulation, API policy-gate integration tests)
npm run verify:full

# Tear down the docker-compose stack
npm run verify:full:down
```

CI runs `verify:full` on every PR via [.github/workflows/verify.yml](./.github/workflows/verify.yml).

---

## Test surface

| Package / app | Tests | What's covered |
|---|---|---|
| `domain` | 32 | Money arithmetic, schemas for every entity, type round-trips |
| `cash-engine` | 13 | Forecast, ranking, matching, money invariants |
| `ai` | 85 | Mappers, validators, eval suite (≥95% accuracy thresholds), adversarial corpus |
| `db` | 22 | Repos, source dedup, idempotency, outbox, RLS isolation, forecast bigint round-trip |
| `policy` | 24 | All 6 hard-refusal rules, gate brand, ts-expect-error type tests |
| `workers` | 11 | 4 workflow replay tests, 6 dispatcher tests, 1 e2e simulation |
| `api` | 24 | Endpoints, tenancy, idempotency, policy gate (4 real-PG integration tests) |
| `web` | 17 | Wire format, hard-refusal UI invariants |
| **total** | **228** | zero skips under `verify:full` |

---

## What works end-to-end today

- Tenant-scoped HTTP API with RLS-enforced isolation, idempotency replay,
  and policy-gated approve.
- Workers can claim outbox events, dispatch them (currently to a
  structured log), retry with exponential backoff, and dead-letter on
  exhausted attempts.
- Workflows replay deterministically — workflow code is pure, all I/O
  in activities.
- AI mappers reject any output that proposes payment initiation,
  claims an obligation is "safe", emits legal/tax advice, or lacks
  evidence refs. Adversarial multi-turn corpus is in CI.
- Web renders fixtures of the daily action loop with evidence drawers
  and approval flows; hard refusals (no payment buttons, no safety
  claims) are enforced in components and tested.

## What's deferred to Round 4

- Cash-engine wiring in workers activities (currently stub data).
  Depends on adding repos for invoice listing, supplier_bills,
  customer_payment_stats, communication_messages, evidence_chunks.
- Web → real API (currently fixture-driven).
- Simulated integration adapters (Xero stub, bank stub, email stub) per
  spec's "simulation first" principle.
- Demo seed coverage of new domain types.

## Beyond Round 4

- Real OAuth + Xero / GoCardless / TrueLayer / Gmail / Outlook adapters.
- Approved external dispatch (drafts → approver → real send).
- Critical-obligation case mode and voice channel revival from `legacy/`.

---

## Hard product invariants (enforced in code, not docs)

The system **must not**:
- Initiate any payment (`rejectIfPaymentInitiation`).
- Send any external communication without a human approval
  (`rejectIfAutonomousSend`, dispatch gate brand).
- Make safety calls on payroll/tax/rent/loan/supplier obligations
  (`rejectIfClaimsObligationSafe` at AI layer + policy layer).
- Give legal, tax, or insolvency advice (AI validators reject; policy
  refuses to dispatch).
- Mutate any row outside the active tenant (Postgres RLS denies even
  if application code forgets the WHERE clause).

These invariants are tested across `packages/ai`, `packages/policy`,
`apps/api`, `apps/web`, and `apps/workers`.
