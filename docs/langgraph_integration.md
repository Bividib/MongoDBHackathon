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
