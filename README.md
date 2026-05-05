# RunwayOps

Cash-aware receivables operations for SMBs. The system reads facts from
finance integrations, projects cash forward, ranks the best
collections actions to keep critical obligations covered, drafts
human-approved communications, and learns from outcomes.

**Status:** simulated daily action loop end-to-end across foundation
packages, API, web, workers, and policy engine, plus a Xero-simulated
integrations adapter, demo-mode header tenancy in the API, a real
Anthropic-backed `ModelRouter` wired into the worker activity context
behind an env kill switch (`AI_MODE=anthropic` + `ANTHROPIC_API_KEY`;
default is mock; resolved mode is logged at worker boot), AND a real
Xero adapter alongside the simulated one (REST + OAuth refresh +
plaintext token storage, swappable via factory; OAuth UI deferred
until the developer-account is registered). 308 tests pass via
`npm run verify:full` (real Postgres + RLS + dispatcher + e2e
workflow simulation + API policy gate + integrations real-PG sync +
workers cash-engine wiring + web→API demo-header + AI factory/
adapter/budget guard + activity-context wiring + Xero adapter wire
contract + OAuth refresh + token-store round-trip).

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

## Conventions

**Package manager: npm only.** Each package and app owns its own
`package.json` + `package-lock.json`. Cross-package dependencies use
`file:../<pkg>` — never `workspace:*`, `catalog:`, or `portal:`
protocols (those are pnpm/Yarn-specific and `npm install` rejects
them with `EUNSUPPORTEDPROTOCOL`). The verifier's pre-flight check
fails the build if any pnpm/Yarn artifacts (`pnpm-lock.yaml`,
`yarn.lock`, `pnpm-workspace.yaml`) appear anywhere in the tree.

**Why this matters:** Round 3's parallel sessions hit "local green,
CI red" twice because mixed package-manager conventions slipped past
local installs (which silently reconcile against an existing
`node_modules/`) but failed on cold CI checkouts. CI now catches this
in the pre-flight, before any test runs.

**Adding a new dependency to a package:**
```bash
cd packages/<pkg>      # or apps/<app>
npm install --save <dep>
git add package.json package-lock.json
```
Always commit BOTH files together. A lock that's out of sync with its
package.json is a latent bug — npm will silently reconcile on next
install, but the lock no longer reflects truth and `npm ci` will fail.

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
           packages/integrations packages/policy apps/workers apps/api apps/web; do
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
| `ai` | 105 | Mappers, validators, eval suite (≥95% accuracy thresholds), adversarial corpus, real-Anthropic adapter, cost-controlled router, env-gated factory |
| `db` | 32 | Repos, source dedup, idempotency, outbox, RLS isolation, forecast bigint round-trip, fact-loader, integration-tokens (real-PG) |
| `integrations` | 33 | Provider mapper, Xero simulated adapter, Xero real adapter (paginated wire contract), Xero OAuth helpers, factory with refresh-on-demand, source-object dedup (real-PG) |
| `policy` | 24 | All 6 hard-refusal rules, gate brand, ts-expect-error type tests |
| `workers` | 19 | 4 workflow replay tests, 6 dispatcher tests, 1 e2e simulation, 2 engine-projection tests, 6 activity-context wiring tests |
| `api` | 27 | Endpoints, tenancy, idempotency, policy gate, demo-mode header (UUID-guarded) |
| `web` | 23 | Wire format, hard-refusal UI invariants, API client, wire→view-model adapters |
| **total** | **308** | zero skips under `verify:full` |

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

## What's done in Round 3.7 (cash-engine wiring prep)

- Six new db repos project rows into the cash-engine input contract:
  invoices, payments, bank (balance + transactions), critical
  obligations, company policy whitelist, and a `loadFinancialFactsForForecast`
  aggregate that the workers fact-loader activity will call directly.
- `cash-engine` now ships a real `dist/` (was source-only). Adding `db
  → cash-engine` for type sharing forced the change; consumers without
  `allowImportingTsExtensions` now resolve the package the normal way.

## What's deferred to Round 4

- Workers activities still hold stub data — Round 4 Session E swaps them
  for `loadFinancialFactsForForecast` + `computeCashForecast` /
  `rankNextBestActions`.
- Web → real API (currently fixture-driven). Round 4 Session F.
- Xero simulated adapter via a `packages/integrations` interface. Round
  4 Session G.

## What's deferred past Round 4 (intentional)

- `supplier_bills`, `customer_payment_stats`, `evidence_chunks`,
  `case_files`: tables / repos exist in the spec but no consumer needs
  them in Round 4. Adding them now would mean deferred unused code.
- Communications repo helpers: not on the cash-engine fact-loader path.
  Will land when the AI message-context loader needs them.
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
