# Determinism cheatsheet

Workflow code in `apps/workers/src/temporal/workflows/` is executed by
Temporal in a sandbox that **replays** the function against recorded
history to rebuild state. If the replayed code samples a different value
than the original execution, replay fails with
`DeterminismViolationError`. The rules below are not advisory; they are
enforced by the runtime.

## Forbidden inside a workflow function

| API                                    | Why it breaks replay                                                |
| -------------------------------------- | ------------------------------------------------------------------- |
| `Date.now()`                           | Wall clock differs between original run and replay.                 |
| `new Date()` (no argument)             | Same as above.                                                      |
| `performance.now()`                    | Same as above.                                                      |
| `Math.random()`                        | Different value on every call.                                      |
| `crypto.randomUUID()`                  | Same.                                                               |
| `crypto.getRandomValues(...)`          | Same.                                                               |
| `setTimeout` / `setInterval`           | Native timers, not Temporal-managed.                                |
| `fetch`, `axios`, `XMLHttpRequest`     | Network I/O.                                                        |
| `fs.*` (any node:fs API)               | Disk I/O.                                                           |
| Direct DB / repository calls           | I/O.                                                                |
| `process.env.*`                        | Resolved at process start, not in workflow input — drift if redeployed. |
| `process.hrtime`, `process.cpuUsage`   | Wall-clock-derived.                                                 |
| Native `console.log`                   | Side effect; not replay-safe. Use `log` from `@temporalio/workflow`. |
| Module-level mutable state             | Different across worker boots.                                      |
| Floating, unawaited promises that resolve via external events | Temporal cannot capture their ordering. |
| Iteration over a `Set` / `Map` whose insertion order depends on non-deterministic input | Order is not stable across replays. |

## Workflow-safe alternatives

| Need                          | Use                                                          |
| ----------------------------- | ------------------------------------------------------------ |
| Current time                  | `getNow` activity (returns `nowIso`). Or accept the time as workflow input. |
| Random IDs                    | Activity that generates and returns the ID, *or* derive deterministically from workflow input + step name. |
| Wait N milliseconds           | `import { sleep } from "@temporalio/workflow"`               |
| Wait until a date             | `sleep(durationMs)` with a duration computed from inputs (do not call `new Date(iso).getTime()` inside workflow scope — pass the millisecond delta from an activity instead). |
| Wait until a signal arrives   | `import { condition } from "@temporalio/workflow"`           |
| Read config                   | Pass via workflow input. If config is sensitive, fetch via activity. |
| Logging                       | `import { log } from "@temporalio/workflow"`                 |
| HTTP / DB / AI calls          | Activity.                                                    |
| Generate UUID                 | Activity, or `workflowInfo().workflowId` + step name.        |
| Get hostname / pid            | Activity (it should not influence workflow logic anyway).    |

## Patterns we use in this codebase

- All activity proxies live in
  `src/temporal/workflows/activity-proxies.ts`. Workflow files import
  `acts`, `failFastActs`, or `compensateActs` and never touch
  `proxyActivities` directly.
- Idempotency keys are constructed from workflow inputs + a step name
  string literal. They never include time, hostname, or random values.
- Signal handlers are registered with `setHandler(...)` at the top of the
  workflow function, before any `await`. Handlers must be synchronous and
  pure: they update local variables, but they do not `await` activities.
  The workflow's main flow is the only place that awaits.
- Workflow code uses `condition(predicate, timeoutMs?)` to wait for state
  transitions. The predicate must read only workflow-local state.
- We do not call `Promise.race` against a non-Temporal source. A
  `Promise.race([sleep(...), condition(...)])` pair is safe because both
  arguments are Temporal-managed.

## How replay tests catch violations

`tests/*.test.ts` ends each happy-path scenario with:

```ts
const history = await handle.fetchHistory();
await Worker.runReplayHistory({ workflowsPath }, history);
```

If a future code change introduces a non-deterministic call,
`runReplayHistory` throws `DeterminismViolationError`. The test fails;
the build fails; the change does not merge.

## When in doubt

If a piece of logic touches any of the items in the "Forbidden" table
above, move it into an activity. The cost of an extra activity call is
negligible compared to the cost of a workflow that cannot replay.
