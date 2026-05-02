# LangGraph Integration Notes

RunwayOps should use LangGraph as an orchestration wrapper around durable MongoDB state, not as the system of record.

The spike lives in:

```text
experiments/langgraph/runwayops-graph.ts
```

Validated setup:

```bash
npm install --prefix experiments/langgraph
npm --prefix experiments/langgraph run demo
npm --prefix experiments/langgraph run test
npm --prefix experiments/langgraph run typecheck
npm run check:data
```

It models the six-worker flow from the implementation plan:

```text
Event Router
Customer Memory Agent
Forecast Agent
Collections Agent
Payment Run Agent
Audit / Learning Agent
```

## Production Shape

The production orchestrator should process one `event_inbox` document at a time:

```text
event_inbox pending document
-> hydrate case state from MongoDB
-> invoke LangGraph with thread_id = case_id
-> receive writePlan
-> apply writes to MongoDB
-> mark event_inbox processed
```

The graph should return write intents for:

```text
events
tasks
retrieval_attempts
agent_runs
cashflow_forecasts
payment_run_plans
decision_log
founder_briefings
memory_cards
```

This keeps the six agents explainable: each worker produces documents the MongoDB Atlas Live State panel can show.

LangGraph is the right layer for this because it is built for long-running, stateful workflow orchestration, human-in-the-loop control, durable execution, and LangSmith observability. MongoDB remains the durable operational state layer: case state, event history, tasks, retrieval attempts, forecasts, payment plans, decisions, memory, and checkpoint/resume data.

## Worker Responsibilities

`eventRouter` classifies events, prevents duplicate work, and creates durable tasks.

`customerMemoryAgent` rewrites retrieval queries, retrieves customer evidence, and classifies ambiguous replies.

`forecastAgent` computes deterministic cash scenarios and risk transitions. It must never use an LLM for arithmetic.

`collectionsAgent` drafts approval-ready customer follow-up actions. It should not send messages.

`paymentRunAgent` recommends supplier payment timing under human approval.

`auditLearningAgent` writes decision logs, founder briefing text, artifact metadata, and future-case memory.

## Spike To Production Worker Map

| Spike node | Production worker | Production responsibility |
|---|---|---|
| `eventRouter` | Event Router | Claim a pending `event_inbox` document, classify the event, resolve `case_id`, check idempotency, and create downstream tasks. |
| `customerMemoryAgent` | Customer Memory Agent | Retrieve invoice, thread, payment-history, and memory evidence; classify ambiguous customer language. |
| `forecastAgent` | Forecast Agent | Compute deterministic cash scenarios, risk transitions, and forecast versions. |
| `collectionsAgent` | Collections Agent | Create approval-ready collection draft tasks; never send messages directly. |
| `paymentRunAgent` | Payment Run Agent | Recommend supplier-payment timing changes under human approval. |
| `auditLearningAgent` | Audit / Learning Agent | Write decision explanations, founder briefing text, artifact metadata, and memory-card updates. |

## Node Write Contract

Each node should produce write intents that Person 1 can apply in `apps/web/lib/orchestrator.ts`.

### `eventRouter`

Writes:

```text
events
tasks
agent_runs
event_inbox
```

Production notes:

```text
events: insert canonical immutable event copied from event_inbox.
tasks: insert downstream durable work items for the workers that should run.
agent_runs: insert Event Router execution trace.
event_inbox: update status from pending -> processing -> processed/failed.
```

### `customerMemoryAgent`

Writes:

```text
retrieval_attempts
events
agent_runs
```

Production notes:

```text
retrieval_attempts: store original query, rewritten query, strategy, top evidence IDs, confidence, sufficiency judgement.
events: optional derived event such as customer_reply.classified.
agent_runs: insert Customer Memory Agent execution trace with classification output.
```

### `forecastAgent`

Writes:

```text
cashflow_forecasts
cases
events
agent_runs
```

Production notes:

```text
cashflow_forecasts: insert forecast v2/v3 documents and deterministic scenario totals.
cases: update compact live state: risk_level, current_cash_gbp, active_forecast_id, updated_at.
events: optional derived event such as forecast.created or risk.changed.
agent_runs: insert Forecast Agent trace with the inputs and scenario totals.
```

### `collectionsAgent`

Writes:

```text
collection_drafts
tasks
agent_runs
```

Production notes:

```text
collection_drafts: insert Northstar/Blue Finch approval-ready draft records.
tasks: insert approval_required task for the founder or finance lead.
agent_runs: insert Collections Agent trace.
```

The spike currently represents the draft inside `agent_runs.output` plus an approval task. In production, split that into an actual `collection_drafts` document and keep the `agent_runs` output as a short summary/reference.

### `paymentRunAgent`

Writes:

```text
payment_run_plans
tasks
decision_log
agent_runs
```

Production notes:

```text
payment_run_plans: insert v2/v3 supplier timing recommendation.
tasks: insert approval_required task for supplier hold/timing change.
decision_log: explain why supplier timing changed.
agent_runs: insert Payment Run Agent trace.
```

### `auditLearningAgent`

Writes:

```text
decision_log
founder_briefings
memory_cards
artifacts
events
agent_runs
```

Production notes:

```text
decision_log: write founder-readable explanation of risk and plan changes.
founder_briefings: insert transcript and later ElevenLabs/S3 audio metadata.
memory_cards: insert/update future-case memory, especially Northstar PO-dependent behaviour.
artifacts: store references to audio or exported briefing files.
events: optional derived event such as briefing.generated or memory.written.
agent_runs: insert Audit / Learning Agent trace.
```

The spike writes `founder_briefings` and `memory_cards` directly. Production should add `artifacts` when ElevenLabs audio or S3 output exists.

## Required Graph State

The production graph state should stay compact. Do not pass full collections through LangGraph; pass IDs, snapshots, and evidence excerpts.

Shared state fields:

```text
event
caseSnapshot
routeIntents
classification
classificationConfidence
forecastVersion
paymentPlanVersion
riskLevel
writePlan
```

### `eventRouter` Required State

Inputs:

```text
event._id
event.event_key
event.event_type
event.company_id
event.case_id
event.source
event.received_at
event.payload
caseSnapshot._id
caseSnapshot.riskLevel
```

Outputs:

```text
routeIntents
writePlan events/tasks/agent_runs/event_inbox update
```

### `customerMemoryAgent` Required State

Inputs:

```text
event.payload.customer_id
event.payload.invoice_id
event.payload.message
routeIntents
caseSnapshot.case_id
evidence snapshot IDs or excerpts
```

Outputs:

```text
classification
classificationConfidence
retrieval_attempts write intent
agent_runs write intent
```

### `forecastAgent` Required State

Inputs:

```text
event.event_type
event.payload.amount_gbp
caseSnapshot.currentCashGbp
caseSnapshot.payrollDueGbp
caseSnapshot.supplierBillGbp
caseSnapshot.northstarInvoiceGbp
caseSnapshot.forecastVersion
classification
classificationConfidence
```

Outputs:

```text
forecastVersion
riskLevel
updated caseSnapshot
cashflow_forecasts write intent
cases live-state update intent
agent_runs write intent
```

### `collectionsAgent` Required State

Inputs:

```text
event.payload.customer_id
event.payload.invoice_id
classification
classificationConfidence
routeIntents
retrieved evidence references
caseSnapshot.riskLevel
```

Outputs:

```text
collection_drafts write intent
approval task write intent
agent_runs write intent
```

### `paymentRunAgent` Required State

Inputs:

```text
forecastVersion
riskLevel
caseSnapshot.paymentPlanVersion
supplier bill snapshot
supplier terms snapshot
scenario totals from forecastAgent
```

Outputs:

```text
paymentPlanVersion
updated caseSnapshot
payment_run_plans write intent
approval task write intent
decision_log write intent
agent_runs write intent
```

### `auditLearningAgent` Required State

Inputs:

```text
event
classification
classificationConfidence
forecastVersion
paymentPlanVersion
riskLevel
caseSnapshot
retrieval_attempt IDs
payment plan recommendation
```

Outputs:

```text
decision_log write intent
founder_briefings write intent
memory_cards write intent
artifacts write intent when audio exists
events write intent for generated artifacts/memory
agent_runs write intent
```

## Thread ID Mapping

Use the Payroll Risk Case ID as the LangGraph thread ID:

```ts
await graph.invoke(inputState, {
  configurable: {
    thread_id: event.case_id,
  },
});
```

For the demo case:

```text
thread_id = case_payroll_2026_05_08
```

This keeps all checkpoints, traces, and worker runs grouped around the durable case rather than a transient browser session or API request.

## Future Checkpoint Storage

The spike uses `MemorySaver`; production should not rely on process memory.

Later checkpoint storage should be represented in MongoDB with one of these patterns:

```text
checkpoints collection
cases.workflow_checkpoint compact embedded snapshot
agent_runs.checkpoint_ref
```

Recommended first version:

```text
checkpoints
  _id
  company_id
  case_id
  thread_id
  event_id
  graph_version
  state_summary
  latest_node
  write_plan_ids
  created_at
```

Keep full document history in the domain collections. The checkpoint should point to durable documents rather than duplicating every event, forecast, task, and decision.

## What Person 1 Should Copy

Person 1 should not copy the mock fixtures. They should copy the orchestration shape:

```text
StateGraph Annotation.Root state definition
six addNode calls
START -> eventRouter -> customerMemoryAgent -> forecastAgent -> collectionsAgent -> paymentRunAgent -> auditLearningAgent -> END
thread_id = event.case_id
writePlan return pattern
agentRun helper shape
task helper shape
```

From `experiments/langgraph/runwayops-graph.ts`, copy/adapt:

```text
RunwayOpsState
WritePlanItem type
CaseSnapshot type
buildGraph()
invokeRunwayOpsGraph() shape
agentRun() helper
task() helper
node function boundaries and return shape
```

Replace in production:

```text
mock events -> pending event_inbox document
BASELINE_CASE -> MongoDB case/forecast/payment-plan hydration
mock retrieval -> Atlas Search / Vector Search / keyword fallback
mock classification -> Fireworks classification with deterministic fallback
mock drafts -> Fireworks draft generation with template fallback
console output -> ordered MongoDB writes
MemorySaver -> MongoDB-backed checkpoint/resume later
```

Production orchestrator pseudocode:

```ts
const event = await claimPendingEventInboxDocument();
const caseSnapshot = await hydrateCaseSnapshot(event.case_id);
const graph = buildRunwayOpsGraph();

const result = await graph.invoke(
  {
    event,
    caseSnapshot,
    writePlan: [],
  },
  {
    configurable: {
      thread_id: event.case_id,
    },
  },
);

await applyWritePlan(result.writePlan);
await markEventProcessed(event._id);
```

The production `applyWritePlan` function should be idempotent. Use `_id` and `event_key`-based upserts where duplicate event processing is possible.

## LangSmith

If LangSmith tracing is enabled, store the run URL or trace URL on `agent_runs.langsmith_trace_url`.

If LangSmith fails or is disabled, the internal `agent_runs` collection is still sufficient for the demo and judging story.

## Human Approval

Human approval should be modeled as MongoDB tasks first:

```text
status: approval_required
assigned_agent: human_founder
```

LangGraph `interrupt()` can be added later, but it is not necessary for the first demo-ready orchestrator.

## Checkpointing

The spike uses `MemorySaver` only to demonstrate the API. LangGraph's JavaScript docs use `MemorySaver` for local memory and recommend a database-backed checkpointer in production. For RunwayOps, production should be able to resume from MongoDB documents:

```text
case state
event history
tasks
agent_runs
forecasts
payment plans
decision logs
checkpoints
```

The case ID should be the graph `thread_id`, for example:

```text
case_payroll_2026_05_08
```

## Why Not Deep Agents Yet

Deep Agents are useful for open-ended research agents with planning tools, file-system tools, and subagents. RunwayOps is more constrained: each worker has a predictable job and must produce auditable MongoDB writes. The first production version should use `StateGraph` directly. Deep Agents UI can inspire future visual debugging, but the hackathon cockpit should be custom to the payroll-risk case.

## References Checked

- LangGraph overview: https://docs.langchain.com/oss/python/langgraph/overview
- LangGraph.js memory and checkpointers: https://docs.langchain.com/oss/javascript/langgraph/add-memory
- LangChain + MongoDB partnership: https://www.langchain.com/blog/announcing-the-langchain-mongodb-partnership-the-ai-agent-stack-that-runs-on-the-database-you-already-trust
- Deep Agents quickstart: https://docs.langchain.com/oss/python/deepagents/quickstart
