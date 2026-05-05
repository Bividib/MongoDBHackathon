# RunwayOps LangGraph Spike

This folder is an isolated prototype for the six-worker RunwayOps workflow.

It does not write to MongoDB and does not call Fireworks, ElevenLabs, Twilio, or AWS. It uses mocked event documents and returns a `writePlan` array describing the MongoDB writes the production orchestrator should perform.

## Workers

The graph contains the six specialist workers from the implementation plan:

```text
eventRouter
customerMemoryAgent
forecastAgent
collectionsAgent
paymentRunAgent
auditLearningAgent
```

The nodes are intentionally workflow workers, not chatbot personas. Each worker appends an `agent_runs` write-plan item so the production app can preserve a durable execution trace.

## Runs Demonstrated

1. Northstar ambiguous reply:

```text
"Should be able to pay Friday once the PO is re-approved."
-> conditional_promise
-> confidence 0.48
-> risk remains HIGH
-> forecast v2
```

2. Harbour Labs bank event:

```text
+GBP 1,200 retainer posted
-> cash moves GBP 8,400 to GBP 9,600
-> risk moves HIGH to WATCH
-> forecast v3
-> payment plan v3
```

## Install And Run

The root `package.json` in this checkout does not currently include `@langchain/langgraph`, so this spike keeps its dependency manifest local to the owned experiment folder.

```bash
npm install --prefix experiments/langgraph
npm --prefix experiments/langgraph run demo
npm --prefix experiments/langgraph run test
npm --prefix experiments/langgraph run typecheck
npm run check:data
```

If Person 1 later adds `@langchain/langgraph` and `tsx` to the root app, the command can become:

```bash
npm install
npx tsx experiments/langgraph/runwayops-graph.ts
```

The repo-root command above currently relies on `npx` auto-installing `tsx` because the production app has not yet adopted root LangGraph dependencies. The local experiment package is the pinned, reproducible setup.

## Adapting Into `apps/web/lib/orchestrator.ts`

Keep the production integration boring and durable:

1. Read one pending document from `event_inbox`.
2. Use `case_id` as LangGraph `thread_id`.
3. Hydrate graph state from MongoDB:

```text
case snapshot
latest forecast
latest payment plan
event payload
relevant evidence summaries
```

4. Run the graph.
5. Apply `writePlan` items in a transaction or idempotent ordered batch.
6. Mark `event_inbox.status` as processed only after the writes succeed.
7. Store any LangSmith URL on the matching `agent_runs` document.

The production write plan should map to these collections:

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

Human approvals should stay outside this spike. Later, the graph can pause before sending customer messages or changing supplier payment timing with LangGraph `interrupt()`, but the first production version can simply write approval-required tasks.

## Design Notes

- Arithmetic stays deterministic in `forecastAgent`.
- Retrieval and classification are mocked but structured the way Fireworks/vector retrieval would fill them in.
- The graph uses `MemorySaver` to show checkpoint shape only. LangGraph's JavaScript docs recommend database-backed checkpointers for production, so RunwayOps should resume from MongoDB case/event/task documents rather than process memory.
- No provider keys are read in this experiment.
- Deep Agents and Deep Agents UI are intentionally not used here. They are useful for open-ended research/planning agents, but RunwayOps needs a narrow, deterministic, event-routed workflow with explicit MongoDB write plans.
