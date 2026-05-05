# Round 3 — Parallel session prompts

These prompts launch **after** Round 2 (DB hardening, AI contract hardening,
workflow architecture, UI product flow spec) has integrated cleanly **and**
the legacy archive (`scripts/archive-legacy.mjs --execute`) has run.

Coordinator pre-flight checklist (do these in this chat before launching):

1. Read all four Round 2 final reports.
2. `node scripts/verify-packages.mjs` — must be green.
3. `cd apps/workers && npm test` — must be green.
4. Read `docs/workflows.md`, `docs/ui-product-flow.md`,
   `packages/ai/docs/threat-model.md`, `packages/ai/docs/eval-thresholds.md`,
   `packages/db/docs/rls.md`, `packages/db/docs/outbox.md`,
   `apps/workers/docs/determinism.md`.
5. Reconcile any contract gaps each session flagged.
6. Run `node scripts/archive-legacy.mjs` (dry run), review, then
   `node scripts/archive-legacy.mjs --execute`.
7. `rm -rf node_modules package-lock.json && pnpm install` (or npm).
8. `node scripts/verify-packages.mjs` again — still green after archive.
9. Commit the archive as one atomic move.
10. Then paste the four prompts below into four parallel sessions.

---

## Coordination contract (prepended to every Round 3 prompt)

> EXECUTE THIS TASK. This is an implementation request, not a template.
> Do not generate new prompts. Do not produce a "list of deliverables"
> document. Read the listed files, then WRITE CODE in the scope directory,
> run the verification commands, and report what you actually built. If
> you find yourself drafting prompts for other workers, stop — that is
> not your job.
>
> You may consume read-only types from sibling packages
> (@runwayops/domain, @runwayops/cash-engine, @runwayops/ai, @runwayops/db,
> the apps/workers Temporal interfaces). Your implementation must compile
> against the **current** state of those packages. Do not modify sibling
> packages. If you find a contract gap requiring a sibling change,
> document it in your final report — the integrator will reconcile.
> Do not run `npm install` from a sibling's directory.

---

## Session A — API skeleton (`apps/api`)

```
[paste coordination contract block above]

You are API Skeleton Worker for RunwayOps.

Repo: /Users/abhinavgupta/Desktop/Cash Management/RunwayPilot

Read first:
- /New Spec.md
- /IMPLEMENTATION_PLAN.md (sections on API surface, command/query
  pattern, idempotency, audit propagation)
- packages/db/src/index.ts and packages/db/docs/* (Session 1's repo
  surface, RLS contract, outbox contract)
- packages/domain/src/** (request/response types live here)
- packages/ai/src/index.ts (read-only — for ModelRouter type)

Current state: foundation packages are stable. apps/api does not exist
yet. Legacy apps/web has been archived to legacy/apps/web. The new
apps/web (Session B) will consume this API.

Scope: apps/api only. You may also add a top-level entry to
turbo.json and pnpm-workspace.yaml if needed for the new app.

Deliverables (all are CODE, not docs):

1. Fastify (or comparable) HTTP app under apps/api/src:
   - Entrypoint apps/api/src/server.ts.
   - Module folders: routes/, handlers/, middleware/, lib/.
   - Zod-validated request/response schemas referencing
     @runwayops/domain types where applicable.

2. Tenancy middleware:
   - Reads the authenticated company id from the request context.
   - Sets the Postgres GUC `app.current_company_id` for the
     transaction (per packages/db/docs/rls.md).
   - Rejects requests without a tenant context with a typed 401/403.

3. Command/Query handler pattern:
   - Commands return either a success result or a typed
     CommandError; never throw raw strings.
   - Queries are read-only and tenant-scoped via repository helpers.
   - Wire to packages/db repositories — never write raw SQL in handlers.

4. Idempotency middleware:
   - Reads `Idempotency-Key` header on POST/PUT.
   - Persists the result of the first invocation (via packages/db
     idempotency helper) and returns the cached result on retry.

5. Audit context propagation:
   - Every command handler appends an AuditEvent in the same
     transaction as the domain mutation.
   - Outbox enqueue is invoked for any domain event that downstream
     consumers (Temporal workers, future webhooks) care about.

6. Health endpoints:
   - GET /healthz (liveness)
   - GET /readyz (DB ping + outbox lag check)

7. Endpoints to ship (implement at least these, all tenant-scoped):
   - GET /api/forecast/today
   - GET /api/actions?status=pending
   - POST /api/actions/:id/approve  (requires approver role)
   - POST /api/actions/:id/reject
   - GET  /api/promises
   - POST /api/promises/:id/mark-fulfilled
   - GET  /api/audit?entityType=&entityId=
   Each with Zod request/response schemas.

8. Integration tests (Vitest + supertest or fastify.inject):
   - Happy-path test per endpoint.
   - Tenant-isolation test: request as company A cannot read
     company B data, even with a forged id (RLS enforces).
   - Idempotency test: POST twice with same key → same result, single
     mutation.

Verification (must pass before reporting):
   cd apps/api && npm install && npm run typecheck && npm run build && npm test
   node scripts/verify-packages.mjs

Final report format (about code you wrote, not a plan):
- Endpoints implemented (path + method per item)
- Middleware added (file path + responsibility)
- Repository functions consumed from @runwayops/db (list)
- Test results (last lines of vitest output)
- Changed paths (full list)
- Sibling-package contract gaps for the integrator
```

---

## Session B — New `apps/web` operational UI

```
[paste coordination contract block above]

You are Operational UI Worker for RunwayOps.

Repo: /Users/abhinavgupta/Desktop/Cash Management/RunwayPilot

Read first:
- /New Spec.md
- /IMPLEMENTATION_PLAN.md (UI sections)
- /docs/ui-product-flow.md (Session 4's data contracts and
  acceptance scenarios — your screens MUST satisfy these)
- packages/cash-engine/src/index.ts (read-only — fixture inputs)
- packages/domain/src/** (typed view models)

Current state: legacy apps/web has been archived. apps/web/ is empty.
The API (Session A) is being built in parallel — you do NOT call it
yet. Build the UI fixture-driven, consuming packages/cash-engine
outputs directly. The integrator will swap fixtures for API calls in
the next round.

Scope: apps/web only.

Deliverables (all are CODE):

1. Next.js 15 app router skeleton under apps/web/.
2. Three operational screens, each implementing the data contract,
   states, and acceptance scenarios from /docs/ui-product-flow.md:
   - Daily Cash Actions
   - Approval Inbox
   - Forecast
3. Shared UI primitives (apps/web/src/components):
   - EvidenceDrawer (every recommendation surfaces its evidence refs)
   - AuditDrawer (mutation timeline)
   - ApprovalAction (draft → approver → final → delivery, per spec)
4. Fixture layer (apps/web/src/fixtures):
   - Realistic simulated-day data feeding cash-engine.
   - Functions returning the typed view models the screens consume.
5. State handling:
   - Loading skeletons.
   - Empty states with explicit copy.
   - Error states distinguishing retryable from non-retryable.
   - Stale-data banner when fixture timestamp is > N hours old.
6. Playwright tests:
   - One acceptance scenario per screen, covering golden path +
     approval-required path + at least one failure path.
7. Storybook OR a /playground route showing every primitive in
   every state.

Hard refusals at the UI layer (must be enforced):
- No screen or component allows initiating a payment.
- No screen claims an obligation is "safe" — they show numbers and
  confidence; the safety call is human.
- Every external action button is disabled until the approval flow
  completes.

Verification:
   cd apps/web && npm install && npm run typecheck && npm run build
   cd apps/web && npm run test       # vitest unit
   cd apps/web && npm run e2e        # playwright

Final report format:
- Screens shipped (path + brief description)
- Components shipped (list)
- Fixture scenarios (count + names)
- Test results (last lines, both unit and e2e)
- Changed paths (full list)
- Contract gaps in cash-engine/domain flagged for the integrator
```

---

## Session C — Temporal activity wiring + outbox dispatcher

```
[paste coordination contract block above]

You are Temporal Wiring Worker for RunwayOps.

Repo: /Users/abhinavgupta/Desktop/Cash Management/RunwayPilot

Read first:
- /New Spec.md
- /IMPLEMENTATION_PLAN.md
- /docs/workflows.md (Session 3's design)
- apps/workers/src/temporal/** (interfaces and stubs to wire up)
- apps/workers/docs/determinism.md
- packages/db/src/index.ts and packages/db/docs/outbox.md
- packages/ai/src/index.ts (ModelRouter, mock adapter)
- packages/cash-engine/src/index.ts

Current state: apps/workers ships workflow code with mocked activity
stubs. Replay tests pass with canned data. Round 3 wires the stubs to
real implementations (DB repos, AI mock router, cash-engine functions)
and adds the outbox dispatcher.

Scope: apps/workers only.

Deliverables (all are CODE):

1. Replace activity stubs with real implementations:
   - DB-backed activities use packages/db repository helpers.
     Activities run their own DB transactions and pass the
     AuditEvent through the outbox enqueue helper.
   - AI activities use ModelRouter (mock). Every activity that
     consumes AI output runs the structured-output validator and
     domain mapper before returning to the workflow.
   - Cash-engine activities are pure calls into packages/cash-engine.
2. Outbox dispatcher worker (apps/workers/src/dispatcher/):
   - Polls the outbox table (or LISTEN/NOTIFY if simpler), claims
     batches with row-level lock, dispatches downstream, marks
     dispatched_at, increments attempts and records last_error on
     failure.
   - Backoff per failure with a max-attempts cap; afterwards the row
     moves to a dead-letter state requiring human action.
   - Tests: claim semantics, retry, dead-letter transition.
3. End-to-end simulation test:
   - Trigger DailyCashActionWorkflow with a fixture company.
   - Assert: forecast computed, actions ranked, audit events written,
     outbox events enqueued, dispatcher delivers them, workflow
     awaits approval signal.
   - Send approval signal → assert next state.
4. Replay tests still pass: workflow code remains deterministic;
   activity bodies do all I/O.
5. Activity-failure taxonomy from docs/workflows.md is enforced:
   each activity is marked retry / fail-fast / compensate /
   human-intervention via its retry policy and signals.

Verification:
   cd apps/workers && npm run typecheck && npm test
   node scripts/verify-packages.mjs

Final report format:
- Activities wired (name + backing module)
- Dispatcher behaviors implemented (claim, retry, dead-letter)
- End-to-end simulation result (last lines)
- Replay test result
- Changed paths (full list)
- Contract gaps in db/ai/cash-engine flagged for the integrator
```

---

## Session D — Approval policy engine + dispatch gate (`packages/policy`)

```
[paste coordination contract block above]

You are Policy Engine Worker for RunwayOps.

Repo: /Users/abhinavgupta/Desktop/Cash Management/RunwayPilot

Read first:
- /New Spec.md (sections on approval, no autonomous send, no payment
  initiation, evidence requirements, audit invariants)
- /IMPLEMENTATION_PLAN.md
- packages/domain/src/{approval,actions,audit,events}.ts
- packages/ai/src/validators/** (Round 2 hard-refusal patterns)

Current state: domain has approval/action types. AI has structured-
output validators that reject unsafe AI proposals. There is no
deterministic policy engine that decides — given a proposed action —
whether it is allowed to dispatch externally. That is what you build.

Scope: packages/policy only (new package).

Deliverables (all are CODE):

1. New package packages/policy with:
   - package.json, tsconfig.json (extends ../../tsconfig.base.json),
     vitest.config.ts.
   - Public entry packages/policy/src/index.ts.
2. Deterministic rules engine:
   - Pure function evaluatePolicy(action, context) → typed
     PolicyVerdict (Allow with required approvals listed | Deny with
     reason).
   - Rules are named, individually testable, and composable.
3. Hard-refusal rules (mirroring AI patterns at the deterministic
   layer):
   - rejectIfPaymentInitiation
   - rejectIfMissingEvidence
   - rejectIfAutonomousSend (no external-send action without an
     Approval row in approved state)
   - rejectIfApprovalExpired (TTL configurable per action kind)
   - rejectIfActorMismatch (system actor and human approver must be
     distinct identities; if same human acts in both roles, both
     hats are recorded explicitly in audit)
   - rejectIfClaimsObligationSafe (any text payload asserting
     payroll/tax/rent is safe is rejected)
4. Approval-requirement matrix:
   - Per action kind: required approver role, required evidence
     classes, TTL.
   - Encoded as a const object with a helper requirementsFor(kind).
5. Dispatch gate primitive:
   - mintGatePass(approval, action, idempotencyKey) →
     GatePassedAction (branded type) | typed error.
   - The branded type is the only type external connectors accept;
     enforce at compile time.
   - Add ts-expect-error fixtures proving a connector cannot be
     called without going through the gate.
6. Tests:
   - Unit test per rule (positive + negative case).
   - Integration test for mintGatePass: every refusal path returns a
     typed error; success path returns the brand.
   - Property test: for any random action kind + approval state,
     the gate's decision is reproducible.

Verification:
   cd packages/policy && npm install && npm run typecheck && npm run build && npm test
   node scripts/verify-packages.mjs

Final report format:
- Rules added (name + reason)
- Approval-requirement matrix entries (count)
- Gate API (signature only)
- Test results (last lines)
- Changed paths (full list)
- Contract gaps in domain flagged for the integrator
```

---

## After Round 3 reports

Integrator pass in this chat:

1. `node scripts/verify-packages.mjs` (now also covers apps/api,
   apps/web, apps/workers, packages/policy).
2. Wire `packages/policy` into `apps/api` command handlers (the gate
   is consulted before any external dispatch).
3. Replace `apps/web` fixtures with real API calls.
4. Run end-to-end Playwright + workflow simulation.
5. Tag a milestone: "Phase 5 — simulated daily action loop, end-to-end."

Round 4 then opens the gate to **simulated** integration adapters
(Xero stub, bank stub, email stub) per the spec's "simulation first"
principle.
