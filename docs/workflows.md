# RunwayOps Temporal Workflows: Design Rationale

**Status:** Design lock for Phase 5 (Temporal Simulation Workflows).
**Owner:** apps/workers.
**Audience:** engineers implementing or modifying workflows, activities, signals,
or the worker bootstrap.

This document is the source-of-truth design rationale for the four workflows
that drive RunwayOps cash-aware receivables operations. It is paired with the
mechanical scaffolding under `apps/workers/`. Anyone changing a workflow,
adding a new activity, or modifying retry semantics must read this file and
update it in the same PR.

---

## 1. Why Temporal

RunwayOps coordinates work that:

- spans days or weeks (a promise-to-pay due date may be 21 days out);
- waits on external signals (customer reply, bank credit, human approval);
- must survive process restarts, deploys, and partial integration failures;
- must be auditable and reconstructable from the event log;
- must coexist with deterministic financial calculations and bounded AI
  reasoning, without ever conflating the two.

Temporal is the right substrate for this category of work because:

1. **Durable execution.** A workflow's state is the deterministic replay of
   its event history. If a worker crashes mid-step, another worker resumes
   from the same point with the same in-memory state. We do not have to
   maintain our own checkpoint tables, retry tables, or saga ledgers.
2. **Replay-based determinism.** Temporal re-executes workflow code against
   the recorded history to rebuild state. This forces a strict separation
   between workflow code (deterministic, pure) and activity code (anything
   that touches the outside world). That separation maps cleanly onto the
   product's hardest invariant: financial state transitions must be
   reproducible from the event log.
3. **First-class signals and queries.** Customer replies, bank credits, and
   human approvals are not poll loops. They arrive as signals; the workflow
   suspends on `condition` until one of them lands. Queries provide
   read-only views of in-flight workflows without breaking determinism.
4. **Retries and timeouts as policy, not code.** Each activity has a named
   retry policy (`retry-policies.ts`). Workflow code does not implement
   exponential backoff. Activities do not implement their own retry logic.
   This keeps the failure taxonomy explicit and centrally tunable.
5. **Long durable timers.** `sleep(promiseDueDate)` is safe and free.
   Temporal will wake the workflow at the right moment regardless of how
   many workers, deploys, or outages happened in the interim.
6. **Versioning.** `patched`/`getVersion` lets us evolve workflow code
   without breaking workflows that are already in flight, which matters
   because RunwayOps workflows can run for weeks.
7. **Test infrastructure.** `@temporalio/testing` gives us
   `TestWorkflowEnvironment` with time-skipping, mocked activities, and
   replay tests. We exercise multi-day workflows in milliseconds and prove
   determinism on every commit.

We considered three alternatives and rejected each:

- **Database triggers + cron.** Adequate for derived updates, inadequate
  for multi-day approvals, retries, and waits. State sprawls across tables;
  recovery semantics become bespoke.
- **A custom orchestrator on top of SQS/EventBridge.** We would re-build
  Temporal's history, replayer, signal infrastructure, and worker model.
  No team wins this.
- **An LLM agent loop as the orchestrator.** Non-deterministic. Cannot be
  audited from an event log. Cannot be safely resumed. Conflates reasoning
  with execution.

---

## 2. Workflow vs Activity discipline

This section is non-negotiable. Every reviewer must enforce it.

### 2.1 Workflow code is deterministic and pure

Workflow code is replayed against history. To ensure two replays produce the
same output, workflow code must:

- Use only the inputs of the workflow function and the results of awaited
  activities, signals, queries, and timers.
- Not call `Date.now()`, `Math.random()`, `crypto.randomUUID()`,
  `process.env`, `fs.*`, `fetch`, `setTimeout`, `setInterval`, or any
  network/disk API directly.
- Not import packages that perform side effects at import time.
- Not mutate module-level state or rely on it.
- Not use language features whose ordering Temporal cannot capture
  (raw `Promise.race` with non-deterministic timers, native timers,
  unawaited promises that resolve from external sources).

The Temporal-safe alternatives are:

| Forbidden in workflow code | Workflow-safe alternative                                  |
| -------------------------- | ---------------------------------------------------------- |
| `Date.now()`, `new Date()` | `workflow.workflowInfo().runStartedAt`, activity that returns time, or `workflow.now()` (deterministic clock) |
| `Math.random()`            | activity that generates the value, or seeded RNG passed in workflow input |
| `crypto.randomUUID()`      | activity that generates IDs                                |
| `setTimeout(ms)`           | `workflow.sleep(ms)` / `workflow.sleep(date)`              |
| `fetch`, `axios`, DB calls | activity                                                   |
| `process.env`              | inject config via workflow input or via an activity        |
| `fs.*`                     | activity                                                   |
| `console.log`              | `log` from `@temporalio/workflow` (replay-safe)            |

The cheatsheet `apps/workers/docs/determinism.md` is the operational version
of this list.

### 2.2 Activities own all I/O

Activities are where the world actually happens: DB reads, DB writes, AI
calls, HTTP calls, time-of-day side effects, `Date.now()`. Activities are
*not* replayed. Their results are recorded in workflow history; on replay
the workflow sees the recorded result and never re-executes the activity
body.

Activity rules:

- Activities are idempotent **by design**. The caller passes an idempotency
  key; the activity uses the key to deduplicate writes against a
  `idempotency_keys` table or an equivalent claim record.
- Activities do not retry internally. Retries are a Temporal retry policy
  attached at the call site.
- Activities log via the standard logger; they do not emit
  `console.log` (which is filtered by lint anyway).
- Activities do not reach back into other workflows. They use
  `client.workflow.signal/start` only via explicit dependency injection.

In this scaffolding round every activity body is a typed stub that returns
canned data. The interfaces are real; the bodies are not. Real wiring
lands after Session 1 (DB Hardening) ships repository surfaces.

### 2.3 Why this matters for RunwayOps specifically

RunwayOps is a financial workflow system with an adaptive AI layer around
it. If a workflow re-runs because a worker crashed, the cash forecast
recomputed from the same input must produce the same output, because the
audit trail and the customer-facing recommendation hang off it. Conflating
deterministic and non-deterministic code in workflow scope is the fastest
path to "the system told the customer two different things about the same
invoice."

---

## 3. The four workflows

All four workflows live in `apps/workers/src/temporal/workflows/`.

### 3.1 DailyCashActionWorkflow

**Purpose.** Triggered daily per company. Produces today's ranked
collection action queue and the approval requests that gate any external
action.

**Signature.**

```ts
DailyCashActionWorkflow(input: {
  companyId: string;
  asOfDate: string; // ISO yyyy-mm-dd
  triggerEventIds?: string[];
})
```

**Steps.**

1. `loadCompanyPolicy` (activity).
2. `loadFinancialFactsForForecast` (activity) — invoices, payments, bills,
   obligations, customer stats.
3. `computeCashForecast` — runs in cash-engine, but called inside an
   activity so cash-engine's date utilities and resolver run outside
   workflow scope. The result is the forecast object.
4. `rankCollectionsActions` (activity, calls `cash-engine.rankNextBestActions`).
5. `retrieveEvidenceForTopActions` (activity).
6. `draftMessages` (activity, calls `ai.draftMessage`).
7. `createApprovalRequests` (activity).
8. `writeAuditEvents` (activity).
9. Workflow then enters the **approval window** loop: `await
   workflow.condition(() => allApprovalsResolved || windowExpired)`.
10. Final `writeAuditEvents` summarises decisions and returns the cycle
    summary.

**Signals.** `approval_granted`, `approval_rejected`, `approval_edited`,
`cycle_cancel`. The first three carry an `approvalRequestId` and a
decision payload.

**Queries.** `getCycleSummary` (current state of forecast, draft actions,
approval status).

**Child workflows.** None in this round. `CustomerReplyWorkflow` and
`PromiseMonitoringWorkflow` are started by other entry points.

**Durable timers.** `workflow.sleep(approvalWindowDuration)` — typically
8–12 working hours; for fixtures we use a 1-hour skip.

**Idempotency.** The cycle as a whole is keyed
`daily-cash-action:{companyId}:{asOfDate}`. Re-triggering the workflow
with the same key is a no-op (`workflowIdReusePolicy = REJECT_DUPLICATE`).
Each activity that mutates state derives a child key, e.g.
`forecast:{companyId}:{asOfDate}`,
`approval-request:{cycleKey}:{actionId}`.

### 3.2 CustomerReplyWorkflow

**Purpose.** Triggered by an inbound customer reply event. Classifies,
extracts a promise (if any), updates the promise board, and queues a
follow-up draft.

**Signature.**

```ts
CustomerReplyWorkflow(input: {
  companyId: string;
  messageEventId: string;
  receivedAtIso: string;
})
```

**Steps.**

1. `loadCustomerMessage` (activity).
2. `classifyReply` (activity, calls `ai.classifyReply`).
3. `extractPromise` (activity, calls `ai.extractPromise`) — only if
   classification suggests a promise type.
4. `retrieveCustomerMemory` (activity).
5. `validateEvidence` (activity).
6. `upsertPromiseToPay` (activity).
7. `recomputeCashForecast` (activity).
8. `rerankCollectionActions` (activity).
9. `draftFollowUpIfNeeded` (activity).
10. `createApprovalRequest` (activity, only if a draft was produced).
11. Workflow waits on `human_override` for a bounded window
    (`workflow.condition` with `workflow.sleep(window)`). A human can
    override the AI classification or extraction; if so the relevant steps
    re-run with `humanProvided = true`.
12. `writeAuditEvent` (activity).

**Signals.** `human_override` (carries corrected classification, promise
type, condition text, or "discard"). `approval_granted`, `approval_rejected`,
`approval_edited` for the follow-up draft.

**Queries.** `getReplyState`.

**Durable timers.** `workflow.sleep(humanOverrideWindow)`.

**Idempotency.** Workflow ID `customer-reply:{messageEventId}`. Activities
that mutate use `{messageEventId}:{stepName}`.

### 3.3 PromiseMonitoringWorkflow

**Purpose.** Long-running, one workflow per active promise. Sleeps until
the promise's due date, then checks bank/accounting events to classify the
outcome (`kept`, `partially_kept`, `late`, `broken`). Opens a follow-up
case if the promise is broken.

**Signature.**

```ts
PromiseMonitoringWorkflow(input: {
  companyId: string;
  promiseId: string;
})
```

**Steps.**

1. `loadPromise` (activity).
2. `workflow.sleep(promisedDate + grace)` — durable timer. May be days or
   weeks.
3. Wake. Listen for `payment_received`, `bank_transaction_posted`,
   `promise_superseded`, `promise_voided`.
4. `checkPaymentMatch` (activity, calls
   `cash-engine.rankPaymentMatchCandidates`).
5. `classifyPromiseOutcome` (activity).
6. `updateCustomerReliability` (activity).
7. `recomputeCashForecast` (activity).
8. If outcome is `broken` or `partially_kept` with material shortfall:
   `openEscalationCase` (activity) — this opens a
   `CriticalObligationCaseWorkflow` via the parent's `client`. We do not
   start that workflow inside the monitoring workflow; we emit a domain
   event the API service consumes to start the case workflow.
9. `writeMemoryAndAudit` (activity).

**Signals.** `payment_received`, `bank_transaction_posted`,
`promise_superseded`, `promise_voided`, `promise_due_date_changed`. The
last one re-arms the durable timer.

**Queries.** `getPromiseState`.

**Child workflows.** None directly. We emit an event; the API service
starts `CriticalObligationCaseWorkflow` through the workflow client.

**Durable timers.** `workflow.sleep` to the promise due date plus grace.

**Idempotency.** Workflow ID `promise:{promiseId}`. Activities use
`{promiseId}:{stepName}:{round}` where `round` increments each wakeup.

### 3.4 CriticalObligationCaseWorkflow

**Purpose.** Opens when a forecast threshold is breached or a critical
obligation is at risk (payroll, tax, rent, loan, key supplier). Coordinates
evidence gathering, draft generation, human approval, action execution.
Closes only on explicit human signal plus resolution evidence.

**Signature.**

```ts
CriticalObligationCaseWorkflow(input: {
  companyId: string;
  caseId: string;
  obligationId: string;
})
```

**Steps.**

1. `openCase` (activity).
2. `computeShortfall` (activity).
3. `identifyCollectableInvoices` (activity).
4. `retrieveCustomerMemory` (activity).
5. `identifySupplierTimingOptions` (activity).
6. `draftCustomerActions` (activity).
7. `draftSupplierActions` (activity).
8. `createApprovalRequests` (activity).
9. **Wait loop.** `workflow.condition` over a set of signals:
   `approval_granted`, `approval_rejected`, `approval_edited`,
   `bank_transaction_posted`, `customer_reply_received`,
   `obligation_due_soon`, `case_resolution_evidence_received`,
   `case_close_request`. The case continues replanning until two
   conditions both hold: the operator has signalled
   `case_close_request`, AND `case_resolution_evidence_received` has
   delivered evidence the obligation is covered.
10. `replanForecast` (activity, on each material signal).
11. `executeApprovedActions` (activity, gated on approval signal).
12. `closeOrEscalate` (activity).
13. `writeMemoryAndAudit` (activity).

**Signals.** Listed above. The combination of
`case_close_request` + `case_resolution_evidence_received` is what makes
case closure deliberate, not implicit.

**Queries.** `getCaseSummary`, `getOutstandingApprovals`.

**Durable timers.** `workflow.sleep(replanInterval)` to ensure the case
re-evaluates at least daily even if no signal arrives.

**Idempotency.** Workflow ID `critical-obligation:{caseId}`. Action
execution uses `{caseId}:{actionId}`.

---

## 4. Activity-failure taxonomy

Each activity has one of four dispositions on failure. The disposition is
captured in `apps/workers/src/temporal/retry-policies.ts` and applied at
the call site.

| Disposition           | Meaning                                                                                              | Retry policy                                                                                                                                | Examples in this scaffolding                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **RETRY**             | Transient failure — network blip, DB connection reset, AI provider 429.                              | Exponential backoff. `initialInterval=1s`, `backoffCoefficient=2`, `maximumInterval=60s`, `maximumAttempts=10`. `nonRetryableErrorTypes` lists the few errors that bypass.  | `loadCustomerMessage`, `loadFinancialFactsForForecast`, `retrieveCustomerMemory`, `retrieveEvidenceForTopActions`. Pure reads. |
| **FAIL_FAST**         | Programmer error or input validation error. Retrying will not change the outcome.                    | `maximumAttempts=1`. Failure type added to `nonRetryableErrorTypes`. The workflow surfaces this to operators via the case state.            | `validateEvidence` rejecting because evidence schema is wrong; `upsertPromiseToPay` failing input validation.             |
| **COMPENSATE**        | Side effect was partially applied and must be undone.                                                | `maximumAttempts=3` for the compensating activity, then escalate to HUMAN_INTERVENTION. The originating activity is marked `FAIL_FAST` to avoid double-apply on retry.    | `executeApprovedActions` (real send/external call). Compensated by `revokeExternalAction`.                                |
| **HUMAN_INTERVENTION**| Failure that no automated retry will resolve. Workflow waits on a signal from a human operator.      | `maximumAttempts=1`. Workflow handles the activity error by transitioning to a `paused_for_human` state and `condition`s on a recovery signal. | `executeApprovedActions` after compensation exhausted; `openEscalationCase` if downstream case service is down past SLA.   |

### Per-activity disposition table

| Activity                          | Disposition       | Notes                                                                              |
| --------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `loadCompanyPolicy`               | RETRY              | Pure read. Cached.                                                                 |
| `loadFinancialFactsForForecast`   | RETRY              | Pure read across multiple repos.                                                   |
| `loadCustomerMessage`             | RETRY              | Pure read.                                                                         |
| `loadPromise`                     | RETRY              | Pure read.                                                                         |
| `retrieveCustomerMemory`          | RETRY              | Pure read.                                                                         |
| `retrieveEvidenceForTopActions`   | RETRY              | Pure read; AI-adjacent retrieval.                                                  |
| `classifyReply`                   | RETRY              | AI call. Idempotent because classification is a function of the message text.      |
| `extractPromise`                  | RETRY              | AI call. Idempotent.                                                               |
| `computeCashForecast`             | RETRY              | Wraps deterministic cash-engine call; fails only if input load fails.              |
| `rankCollectionsActions`          | RETRY              | Wraps deterministic cash-engine call.                                              |
| `rankPaymentMatchCandidates`      | RETRY              | Wraps deterministic cash-engine call.                                              |
| `validateEvidence`                | FAIL_FAST          | Schema/policy violation surfaces a programmer or data-quality issue.               |
| `upsertPromiseToPay`              | RETRY              | Idempotency key is `{messageEventId}:promise`. Conflict on idempotency = success.  |
| `createOrUpdatePromise`           | RETRY              | Same as above; aliased call site for monitoring workflow.                          |
| `recomputeCashForecast`           | RETRY              | Mutates `cash_forecasts`; idempotency key is `forecast:{cycle|case|promise}:{step}`.|
| `rerankCollectionActions`         | RETRY              | Mutates `collection_actions`; idempotency key is `rerank:{cycleId}:{round}`.       |
| `draftMessages` / `draftMessage`  | RETRY              | AI call. Idempotency key is `draft:{actionId}`; conflicts return existing draft.   |
| `createApprovalRequest(s)`        | RETRY              | Idempotency key is `approval:{subjectKind}:{subjectId}`.                           |
| `openCase`                        | RETRY              | Idempotency key is `case:{caseId}:open`.                                           |
| `computeShortfall`                | RETRY              | Pure compute on top of forecast snapshot.                                          |
| `identifyCollectableInvoices`     | RETRY              | Pure read + cash-engine call.                                                      |
| `identifySupplierTimingOptions`   | RETRY              | Pure read + policy call.                                                           |
| `draftCustomerActions`            | RETRY              |                                                                                    |
| `draftSupplierActions`            | RETRY              |                                                                                    |
| `replanForecast`                  | RETRY              | Idempotency key is `replan:{caseId}:{round}`.                                      |
| `checkPaymentMatch`               | RETRY              | Pure read + deterministic ranking.                                                 |
| `classifyPromiseOutcome`          | RETRY              | Pure compute against deterministic rules.                                          |
| `updateCustomerReliability`       | RETRY              | Idempotency key is `reliability:{customerId}:{promiseId}`.                         |
| `openEscalationCase`              | HUMAN_INTERVENTION | If escalation entry-point is unreachable past SLA, page ops.                       |
| `executeApprovedActions`          | COMPENSATE → HUMAN_INTERVENTION | First failure attempts `revokeExternalAction`. If revoke also fails, pause for human. |
| `revokeExternalAction`            | RETRY → HUMAN_INTERVENTION | Retries 3 times. If all fail, the case enters `paused_for_human` state.            |
| `writeAuditEvent(s)`              | RETRY              | Idempotency key is `audit:{eventId}`. Audit must never lose an event.              |
| `writeMemoryAndAudit`             | RETRY              | Same as above.                                                                     |
| `closeOrEscalate`                 | RETRY              | Idempotency key is `case:{caseId}:close|escalate`.                                 |

The activity *interfaces* live in `apps/workers/src/temporal/activities/`.
The *retry policy bindings* live in `apps/workers/src/temporal/retry-policies.ts`.
A workflow chooses the policy by activity name; the binding is explicit
and reviewable.

---

## 5. Idempotency

**Rule.** Every activity that mutates external state takes an
`idempotencyKey: string` as the last positional argument. The activity
either (a) finds an existing record by key and returns its result, or
(b) inserts and returns the new result. Re-running the activity with the
same key must produce the same return value and not duplicate the side
effect.

### 5.1 Key derivation per workflow

| Workflow                          | Cycle key                                          | Per-step key template                                       |
| --------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| `DailyCashActionWorkflow`         | `daily-cash-action:{companyId}:{asOfDate}`         | `{cycleKey}:{stepName}` or `{cycleKey}:{stepName}:{actionId}` |
| `CustomerReplyWorkflow`           | `customer-reply:{messageEventId}`                  | `{cycleKey}:{stepName}`                                     |
| `PromiseMonitoringWorkflow`       | `promise:{promiseId}`                              | `{cycleKey}:{stepName}:{round}` (round increments per wake) |
| `CriticalObligationCaseWorkflow`  | `critical-obligation:{caseId}`                     | `{cycleKey}:{stepName}` or `{cycleKey}:{stepName}:{round}` for re-plan steps |

Keys are constructed inside workflow code (deterministic) and passed to
activities. Workflow code never reads system clocks or hostnames to build a
key; the inputs are sufficient.

### 5.2 Storage

Idempotency keys are stored in the `idempotency_keys` table provided by
`@runwayops/db`. Activities that need to claim a key acquire a row-level
lock (or use `INSERT ... ON CONFLICT ... DO NOTHING RETURNING`) and write
the result hash so subsequent calls can short-circuit.

In this scaffolding round the activity stubs do not write to the DB; they
just thread the key through and return canned data. The interfaces are
fixed so the real implementations slot in without changing workflow code.

---

## 6. Versioning strategy

Workflows can run for weeks. We must be able to deploy new workflow code
without breaking in-flight executions whose history was recorded against
old code.

**Rules.**

1. **Adding a step.** Use `patched(patchId)` (or `getVersion(name, default,
   v1)` for the older API):
   ```ts
   if (workflow.patched("addEvidenceValidation-2026-06")) {
     await activities.validateEvidence(input, key);
   }
   ```
   Old histories take the false branch; new executions take the true
   branch. Once all in-flight workflows that started before the patch are
   complete, we replace the conditional with the unconditional call and
   call `deprecatePatch("addEvidenceValidation-2026-06")` for one release
   cycle, then remove it.
2. **Changing activity signatures.** Add a new activity name. Keep the old
   one as a no-op until in-flight workflows drain. Never change an
   activity's argument shape silently — Temporal serialises arguments and
   results, and a replay against an old history will compare against the
   recorded shape.
3. **Reordering steps.** Treat as a breaking change. Use `patched`.
4. **Renaming a workflow.** Treat as a new workflow. Continue running the
   old one until drain.
5. **Changing retry policy.** Safe at any time; retry policy is metadata
   on the activity call, not part of replay history.

This is the Temporal-native pattern; the `patched` API is documented at
<https://docs.temporal.io/develop/typescript/versioning>.

---

## 7. Test strategy

Tests live in `apps/workers/tests/`.

### 7.1 Replay tests with time-skipping

Every workflow has at least one happy-path replay test that:

- Boots `TestWorkflowEnvironment.createTimeSkipping()`.
- Registers the four workflows and a mocked activity bundle returning
  canned data.
- Executes the workflow with `client.workflow.execute(...)`.
- Asserts the workflow result.

Time-skipping means a workflow with `workflow.sleep(7 days)` finishes in
milliseconds because Temporal advances its virtual clock when nothing else
is pending.

### 7.2 Determinism (replay) check

Each happy-path test additionally calls `Worker.runReplayHistory(...)`
against the recorded history. If a future code change introduces a
non-deterministic call, replay will throw a
`DeterminismViolationError` and the test fails. We treat any such
warning as a CI-blocking error.

### 7.3 Signal injection

Workflows that wait on signals are tested by:

- Starting the workflow handle.
- Calling `handle.signal('signalName', payload)` from the test.
- Asserting the workflow resumes and produces the expected result.

Examples in this round:

- `DailyCashActionWorkflow` — inject `approval_granted` to release the
  approval window and see the audit summary.
- `CustomerReplyWorkflow` — inject `human_override` to override the AI
  classification.
- `CriticalObligationCaseWorkflow` — inject `case_close_request` and
  `case_resolution_evidence_received` to close the case.

### 7.4 Adding new tests

The pattern is documented in `apps/workers/README.md`. The short version:
copy a happy-path test, name the new file `<workflow>.<scenario>.test.ts`,
re-use the canned-activity stubs in `tests/helpers/activities.ts`, and add
the workflow under test to the `workflowsPath` registration.

---

## 8. Sibling-package contract gaps

This scaffold imports types only. Real wiring requires the following
contracts from siblings, which the integrator must close in later rounds:

1. **`@runwayops/db` repository surface.** `IdempotencyRepo`,
   `PromiseRepo`, `CashForecastRepo`, `CollectionActionRepo`,
   `ApprovalRepo`, `AuditRepo`, `CaseRepo`. Today the activity stubs do
   not import a repo; they just return canned data. Repos must accept an
   `idempotencyKey` everywhere they mutate.
2. **`@runwayops/ai` model router instance.** The activity layer needs a
   constructed `ModelRouter` injected, not the type. The factory and the
   provider/key handling stay outside the worker package.
3. **Domain-event publisher.** `PromiseMonitoringWorkflow` emits an event
   to start a `CriticalObligationCaseWorkflow`. The worker package needs
   a publisher injected — either a Temporal client signal-with-start, or
   a domain-event bus that the API process consumes. We have a typed stub
   activity (`emitDomainEvent`) for now.
4. **Authoritative `now()` activity.** Workflow code cannot call
   `Date.now()`. We expose a `getNow()` activity in `system.ts`. Until
   the integrator decides on a clock-control strategy for tests vs
   production, the stub returns `new Date()`.

---

## 9. Final mantra

> Determinism in the workflow. I/O in the activity. Idempotency on every
> mutation. Approvals before any external action. Audit on every step.

Anything that pushes against this mantra requires explicit review.
