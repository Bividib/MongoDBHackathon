# @runwayops/workers

Temporal workflows and activities for RunwayOps cash-aware receivables
operations.

This package owns the durable execution layer of RunwayOps. The
deterministic cash engine (`@runwayops/cash-engine`), AI model router
(`@runwayops/ai`), and database surface (`@runwayops/db`) are imported as
**types only** in this round; activity bodies are typed stubs returning
canned data. Real wiring lands after Session 1 (DB Hardening) ships its
repository surface.

For the full design rationale see
[../../docs/workflows.md](../../docs/workflows.md). For determinism rules
see [docs/determinism.md](docs/determinism.md).

## Layout

```
apps/workers/
├── README.md                       — this file
├── docs/
│   └── determinism.md              — workflow-safe / unsafe API cheatsheet
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── worker.ts                   — worker entry point (compiles, not run yet)
│   └── temporal/
│       ├── signals.ts              — signal definitions (defineSignal)
│       ├── signal-types.ts         — signal payload types
│       ├── queries.ts              — query definitions (defineQuery)
│       ├── query-types.ts          — query return types
│       ├── retry-policies.ts       — named RetryPolicy values + activity-name → policy map
│       ├── activities/
│       │   ├── index.ts            — aggregate export registered with worker
│       │   ├── types.ts            — activity input/output types
│       │   ├── system.ts           — getNow
│       │   ├── policy.ts           — loadCompanyPolicy
│       │   ├── facts.ts            — loadFinancialFactsForForecast
│       │   ├── forecast.ts         — computeCashForecast, rankCollectionsActions, ...
│       │   ├── evidence.ts         — retrieveCustomerMemory, validateEvidence, ...
│       │   ├── messaging.ts        — classifyReply, extractPromise, draftMessages, ...
│       │   ├── promises.ts         — loadPromise, upsertPromiseToPay, ...
│       │   ├── approvals.ts        — createApprovalRequest(s)
│       │   ├── case.ts             — openCase, executeApprovedActions, revokeExternalAction, ...
│       │   └── audit.ts            — writeAuditEvent, writeMemoryAndAudit, emitDomainEvent
│       └── workflows/
│           ├── index.ts            — workflow entry-point exports
│           ├── activity-proxies.ts — `acts`, `failFastActs`, `compensateActs`
│           ├── daily-cash-action.ts
│           ├── customer-reply.ts
│           ├── promise-monitoring.ts
│           └── critical-obligation-case.ts
└── tests/
    ├── helpers/
    │   ├── env.ts                  — TestWorkflowEnvironment harness
    │   └── activities.ts           — canned activity implementations
    ├── daily-cash-action.test.ts
    ├── customer-reply.test.ts
    ├── promise-monitoring.test.ts
    └── critical-obligation-case.test.ts
```

## Verification

```
cd apps/workers
npm install
npm run typecheck
npm test
```

Tests boot a Temporal time-skipping test server. The first run downloads
the bundled test server binary; subsequent runs are fast. CI environments
must allow the test runner to fork that subprocess.

## Adding a new workflow test

1. Decide which workflow the test exercises and pick a scenario name. Use
   the file naming pattern `<workflow>.<scenario>.test.ts` (e.g.
   `customer-reply.dispute-classification.test.ts`).
2. Copy `tests/customer-reply.test.ts` and adapt:
   - Update the imported workflow function and inputs.
   - Override individual mock activity returns by spreading `mockActivities`
     and replacing the keys you care about. Pass the override into
     `createReplayHarness` (extend the helper if needed).
3. Drive the workflow with `handle.signal(...)` and `handle.query(...)`.
4. Assert the result.
5. Always finish with the determinism check:

   ```ts
   const history = await handle.fetchHistory();
   await Worker.runReplayHistory({ workflowsPath: harness.workflowsPath }, history);
   ```

   This is the single most important assertion: it guards against
   non-deterministic code reaching the workflow layer.

## Adding a new activity

1. Add the input/output types to `src/temporal/activities/types.ts`. The
   input must include `companyId` and `idempotencyKey` if it mutates
   state.
2. Add the stub implementation to the appropriate file under
   `src/temporal/activities/` (or create a new file if it belongs to a
   new domain).
3. Re-export from `src/temporal/activities/index.ts`.
4. Add the activity name to `ACTIVITY_RETRY_POLICY` in
   `src/temporal/retry-policies.ts` with the right disposition.
5. If the activity is FAIL_FAST or COMPENSATE, the calling workflow must
   import `failFastActs` / `compensateActs` from
   `src/temporal/workflows/activity-proxies.ts` rather than the default
   `acts`.

## Adding a new signal

1. Define the payload type in `src/temporal/signal-types.ts`.
2. Define the signal in `src/temporal/signals.ts` with `defineSignal`.
3. Register `setHandler(signal, fn)` at the top of the relevant workflow
   function. Handlers must be synchronous and update only workflow-local
   state.

## Status (2026-05-04)

- [x] Workflow design rationale (`docs/workflows.md`).
- [x] Workflow scaffolding compiles under TypeScript strict + replay
      sandbox conventions.
- [x] Replay tests for all four workflows pass under
      `TestWorkflowEnvironment.createTimeSkipping`.
- [ ] Real activity bodies wired to `@runwayops/db` repos. Pending Session 1
      DB Hardening.
- [ ] Real model router instance threaded into AI activities. Pending the
      `@runwayops/ai` consumer factory.
- [ ] Domain-event publisher for `PromiseMonitoringWorkflow → CriticalObligationCaseWorkflow`
      hand-off. Pending the API service.
