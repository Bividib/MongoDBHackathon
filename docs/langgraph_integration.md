# LangGraph Integration Notes

RunwayOps should use LangGraph as an orchestration wrapper around durable MongoDB state, not as the system of record.

The spike lives in:

```text
experiments/langgraph/runwayops-graph.ts
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

## Worker Responsibilities

`eventRouter` classifies events, prevents duplicate work, and creates durable tasks.

`customerMemoryAgent` rewrites retrieval queries, retrieves customer evidence, and classifies ambiguous replies.

`forecastAgent` computes deterministic cash scenarios and risk transitions. It must never use an LLM for arithmetic.

`collectionsAgent` drafts approval-ready customer follow-up actions. It should not send messages.

`paymentRunAgent` recommends supplier payment timing under human approval.

`auditLearningAgent` writes decision logs, founder briefing text, artifact metadata, and future-case memory.

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

The spike uses `MemorySaver` only to demonstrate the API. Production should be able to resume from MongoDB documents:

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
