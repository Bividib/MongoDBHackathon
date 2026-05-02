# RunwayOps — Architecture

This document explains how RunwayOps is built, why each component exists,
and what happens when something fails. It is the one-stop reference for
judges, contributors, and the team during rehearsal.

The product brief is in `MASTER SPEC.md`. The build plan is in
`docs/implementation-plan.md`. The demo script is in `docs/demo_script.md`.

---

## 1. Architecture in one diagram

```text
                        ┌──────────────────────────────┐
                        │     Cockpit UI (Next.js)     │
                        │  RiskCommandBar / EventFeed  │
                        │  CaseBoard / Drafts / Audit  │
                        │  AtlasLiveState / Briefing   │
                        └──────────────┬───────────────┘
                                       │ fetch
                                       ▼
                        ┌──────────────────────────────┐
                        │   Next.js API routes         │
                        │   /api/events/customer-reply │
                        │   /api/events/bank-trans     │
                        │   /api/events/start-live-feed│
                        │   /api/orchestrate           │
                        │   /api/retrieve/customer-mem │
                        │   /api/briefing              │
                        └────────┬─────────────┬───────┘
                                 │             │
       AWS path (visible layer)  │             │  Local path (always works)
                                 ▼             ▼
        ┌──────────────────────────────┐   ┌──────────────────────────────┐
        │  API Gateway                 │   │  Direct insert into          │
        │   ↓                          │   │  event_inbox + call          │
        │  Lambda  (insert event)      │   │  orchestrator()              │
        │   ↓                          │   └──────────────────────────────┘
        │  EventBridge Scheduler       │                 │
        │   (timed bank event)         │                 │
        └────────┬─────────────────────┘                 │
                 ▼                                       ▼
                ┌──────────────────────────────────────────┐
                │        MongoDB Atlas (replica set)       │
                │                                          │
                │  event_inbox  ─►  Atlas Trigger          │
                │     │             (or fallback poller)   │
                │     ▼                                    │
                │  Orchestrator                            │
                │  ├─ Event Router                         │
                │  ├─ Forecast Agent (deterministic)       │
                │  ├─ Customer Memory Agent (retrieval)    │
                │  ├─ Collections Agent (drafting)         │
                │  ├─ Payment Run Agent (planning)         │
                │  └─ Audit / Learning Agent (briefing+mem)│
                │                                          │
                │  events / tasks / agent_runs             │
                │  retrieval_attempts / memory_chunks      │
                │  cashflow_forecasts / payment_run_plans  │
                │  collection_drafts / decision_log        │
                │  founder_briefings / memory_cards        │
                │  artifacts / checkpoints                 │
                │  bank_transactions_ts (time-series)      │
                └──────────────┬─────────┬─────────────────┘
                               │         │
                               ▼         ▼
              ┌──────────────────────┐ ┌──────────────────────┐
              │ Fireworks AI         │ │ AWS S3               │
              │ classify / draft /   │ │ founder briefing MP3 │
              │ audit / briefing /   │ │ fixture artifacts    │
              │ memory wording       │ └──────────────────────┘
              └──────────────────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │ ElevenLabs           │
              │ founder briefing TTS │
              └──────────────────────┘
```

---

## 2. Design principles

```text
Case-shaped, not chat-shaped.
Deterministic where it must be explainable, agentic where it must be flexible.
MongoDB as durable context, not chat log.
Approval-required by design.
Every external service has a cached fallback.
```

The demo must remain reliable even if a cloud service, AI provider,
scheduler, or network call fails. The core app works end-to-end with
MongoDB, deterministic maths, seeded data, cached outputs, and local
Next.js routes; AWS, Fireworks, Voyage, and ElevenLabs enhance the demo
rather than become single points of failure.

---

## 3. MongoDB Atlas — the durable context engine

### 3.1 Why MongoDB

The workload is document-shaped (events, tasks, retrieval attempts,
forecasts, plans, drafts, briefings, memory cards). Atlas combines
operational storage, full-text search, vector search, time-series, schema
validation, and change streams in one cluster — so we did not have to glue
three systems together for a one-day build. Aggregations compute risk
deltas; `event_inbox` wakes the workflow.

### 3.2 Modelling rules

```text
Model around workload, not relational tables.
Embed bounded hot-path state.
Reference unbounded logs, events, tool calls, retrievals, chunks, artifacts.
Use extended references for hot UI display and audit snapshots.
Keep current live state compact; keep full history queryable.
Schema-validate core workflow documents.
Store large files/audio in S3; store metadata in MongoDB.
```

### 3.3 Collections

Generic agentic collections:

```text
cases                  Compact live case state (current snapshot only).
events                 Append-only timeline of what happened.
tasks                  Coordination + human approval queue.
agent_runs             Per-worker execution trace.
retrieval_attempts     Adaptive-retrieval proof.
memory_chunks          Vector-retrieval substrate.
artifacts              Pointers to S3 audio/PDF outputs.
checkpoints            Resume points for the orchestrator.
```

Domain collections:

```text
companies, users, customers, invoices, supplier_bills, supplier_terms,
payroll_obligations, recurring_payments, email_threads, source_files,
cashflow_forecasts, payment_run_plans, collection_drafts, decision_log,
founder_briefings, memory_cards, agent_scratch, retrieval_cache,
event_inbox, bank_transactions_ts (time-series).
```

`cases` holds compact live state plus extended references to recent events
and active agents. We deliberately do **not** embed all events, all
forecasts, or all retrievals into the case document.

### 3.4 Indexes (highlights)

```javascript
db.event_inbox.createIndex({ company_id: 1, event_key: 1 }, { unique: true })
db.event_inbox.createIndex({ status: 1, received_at: 1 })

db.cases.createIndex({ company_id: 1, status: 1, updated_at: -1 })
db.cases.createIndex({ company_id: 1, case_ref: 1 }, { unique: true })

db.events.createIndex({ company_id: 1, case_id: 1, ts: 1 })
db.tasks.createIndex({ company_id: 1, case_id: 1, status: 1, updated_at: -1 })
db.agent_runs.createIndex({ company_id: 1, case_id: 1, started_at: -1 })
db.retrieval_attempts.createIndex({ company_id: 1, case_id: 1, created_at: -1 })

db.memory_chunks.createIndex({
  company_id: 1, "metadata.customer_id": 1, "metadata.source_type": 1
})

db.cashflow_forecasts.createIndex({ company_id: 1, case_id: 1, version: -1 })
db.payment_run_plans.createIndex({ company_id: 1, case_id: 1, version: -1 })

db.agent_scratch.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
db.retrieval_cache.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
```

`bank_transactions_ts` is a time-series collection (`timeField: posted_at`,
`metaField: account_meta`, `granularity: hours`). We **do not** trigger on
it. Wakeups always go through `event_inbox`.

### 3.5 Atlas Search and Vector Search

Vector index on `memory_chunks` (1024-dim cosine similarity, with filters
on `company_id`, `metadata.customer_id`, `metadata.invoice_id`,
`metadata.source_type`, `metadata.tags`).

Atlas Search index on `memory_chunks` (text + autocomplete on customer
name, invoice number, PO number, source type, tags).

Hybrid retrieval:

```text
Structured lookup     Invoice/customer IDs from the event payload.
Atlas Search          Exact terms: invoice number, PO number, "Friday".
Vector Search         Behavioural memory: PO-dependence, conditional promises.
Optional rerank       Top-20 -> top-5 evidence chunks.
```

Every attempt is stored in `retrieval_attempts` with the original query,
the rewritten query, the strategy, the filters, the top results, and the
agent's sufficiency judgement.

### 3.6 Schema validation

Strict + error on `cases`, `event_inbox`, `tasks`, `cashflow_forecasts`,
`payment_run_plans`, `collection_drafts`, `approvals`. Moderate or warn on
`source_files`, raw fixture ingestion, and `memory_chunks` during early
ingestion.

---

## 4. `event_inbox` — the single wakeup contract

`event_inbox` is the only collection that wakes the workflow. Every
external trigger (manual, scheduled, AWS, local timer) inserts a document
here, then optionally calls the orchestrator directly as a guarantee.

Document shape (excerpt):

```json
{
  "_id": "evt_customer_a_reply_001",
  "company_id": "cmp_marlow_finch",
  "case_id": "case_payroll_2026_05_08",
  "event_key": "demo/email/northstar/inv1042/reply-001",
  "event_type": "email.received",
  "source": "api_gateway_lambda_demo",
  "status": "new",
  "received_at": "2026-05-06T10:15:00+01:00",
  "related_entities": { ... },
  "payload": { ... },
  "processing": { "attempts": 0, "locked_by": null, "locked_until": null }
}
```

Why `event_inbox` and not direct triggers on domain collections?

```text
Triggers on time-series collections are not supported.
Triggers on forecasts/plans couple wakeups to internal writes.
event_inbox is small, regular, idempotent (unique event_key), and
purpose-built for wakeups.
```

Idempotency is enforced by `unique({ company_id, event_key })`. The same
external event can be replayed safely; the second insert is rejected and
logged as `ignored_duplicate`.

Status transitions:

```text
new -> processing -> processed
                  \-> failed
                  \-> ignored_duplicate
```

---

## 5. Six specialist agents

Six agents coordinate through MongoDB documents — tasks, events,
retrievals, plans, decisions, memory. They do not pass long prompts to
each other.

### 5.1 Event Router

Classifies the event type, finds the case, prevents duplicate processing,
and creates downstream tasks.

```text
Reads:   event_inbox document, case state.
Writes:  events, tasks, agent_runs, event_inbox.status.
Failure: unknown event -> task_needs_review.
         duplicate event_key -> ignored_duplicate.
```

### 5.2 Forecast Agent

Deterministic. Computes cash scenarios from cash today, payroll, supplier
bills, invoice assumptions, and bank transactions. Writes a new forecast
version. **Never calls an LLM for arithmetic.**

```text
Reads:   cash_today, payroll_obligation, supplier_bill, invoices,
         bank_transactions_ts.
Writes:  cashflow_forecasts (new version), cases.current_state, events,
         agent_runs.
Failure: missing amount/date -> forecast incomplete + task_needs_data.
```

Forecast versions and the deterministic transitions:

```text
v1  Initial baseline                                Risk HIGH
v2  After Customer A conditional reply              Risk HIGH (scenario split)
v3  After Harbour Labs +£1,200 retainer             Risk WATCH (not SAFE)
```

### 5.3 Customer Memory Agent

Rewrites the query, runs hybrid retrieval, classifies the customer reply
with structured JSON output. Asks for human confirmation if confidence is
low.

```text
Reads:   customer reply, invoice/customer IDs, memory_chunks,
         email_threads, customer_payment_history.
Writes:  retrieval_attempts, classification (in agent_runs), events.
Failure: low evidence score -> ask for human confirmation, neutral draft.
```

### 5.4 Collections Agent

Drafts approval-ready customer emails. LLM-generated by default, with a
deterministic template fallback.

```text
Reads:   invoice, customer memory, classification, company policy.
Writes:  collection_drafts, tasks (approval), agent_runs.
Failure: LLM failure -> deterministic template.
```

### 5.5 Payment Run Agent

Recommends supplier timing changes under explicit human approval. Uses
written supplier terms — never invents grace periods.

```text
Reads:   latest forecast, supplier_terms, supplier_bills, payment policy.
Writes:  payment_run_plans (new version), tasks (approval), decision_log,
         agent_runs.
Failure: uncertain terms -> no recommendation; human review required.
```

### 5.6 Audit / Learning Agent

Explains why the plan changed, generates the founder briefing transcript,
writes a memory card, and records artifact metadata.

```text
Reads:   forecast diff, payment plan diff, retrieval_attempts,
         agent outputs.
Writes:  decision_log, founder_briefings, memory_cards, artifacts, events,
         agent_runs.
Failure: missing evidence refs -> draft memory pending review.
```

---

## 6. Orchestrator state machine

The orchestrator is implemented as either a typed TypeScript state machine
or LangGraph.js, depending on which is faster on the day. The framework
label is not the point — the durable coordination through MongoDB is.

State machine for a single event:

```text
new event_inbox doc
        │
        ▼
Event Router            (classify, lock event_inbox row, create tasks)
        │
        ├──► Forecast Agent             (always, on any event affecting cash)
        │
        ├──► Customer Memory Agent      (if event is a customer reply)
        │
        ├──► Collections Agent          (if reply needs a draft)
        │
        ├──► Payment Run Agent          (if forecast changes the plan)
        │
        └──► Audit / Learning Agent     (always, last)
                │
                ▼
        update cases.current_state
        write checkpoint
        mark event_inbox.status = processed
```

Idempotency:

```text
event_inbox.event_key is unique per company.
agent_runs include event_id + agent_id + step so replays are safe.
forecast and payment_run_plan versions are append-only.
```

Resume:

```text
On worker restart, scan event_inbox where status in (new, processing).
For each, replay from the latest checkpoint for the case.
Idempotent writes guarantee no double effects.
```

---

## 7. AWS — the visible event layer

AWS is intentionally narrow. Region: `eu-west-2`.

```text
API Gateway          External event ingress (demo-safe).
Lambda               Inserts customer reply / bank transaction into event_inbox.
EventBridge Scheduler Fires the timed Harbour Labs retainer event.
S3                   Stores fixture files and the founder briefing MP3.
CloudWatch           Optional logs only; not a core panel.
```

Two paths to the same end state:

```text
AWS path:    UI -> API Gateway -> Lambda -> event_inbox -> orchestrator
Local path:  UI -> Next.js route -> event_inbox -> orchestrator (direct call)
```

The two paths produce identical MongoDB writes. The local path always
works; the AWS path adds an externally-visible event flow for the demo.

---

## 8. AI providers and prompts

### 8.1 Fireworks

Fireworks runs the LLM-shaped work that benefits from low-latency
structured outputs.

```text
Ambiguous reply classification     structured JSON {classification, confidence, reason}
Draft customer emails              templated tone control
Audit summary wording              short paragraph + bullet list
Founder briefing transcript        ~80-word voice script
Memory-card wording                tight statements + facts JSON
```

Where Fireworks is **not** used:

```text
Cash arithmetic, due-date maths, idempotency, database writes without
validation.
```

### 8.2 Voyage (optional)

Voyage embeddings (`voyage-4-lite`, 1024 dim) and optional rerank are the
preferred path when a key is available. The first build uses Fireworks
embeddings or seeded retrieval to keep dependencies thin.

### 8.3 ElevenLabs

ElevenLabs is used **only** for the founder briefing voice. Never for
customer calls or real-time voice. The MP3 is cached locally and uploaded
to S3 with a metadata reference in `artifacts`.

### 8.4 LangSmith (optional)

If LangSmith tracing is enabled, trace URLs are stored in `agent_runs` as
`{ trace_url, fallback_trace }`. The internal `agent_runs` view is
sufficient if LangSmith is unavailable.

---

## 9. Reliability and fallbacks

The most important property of the demo is that no single external service
can break it. Every external call has a cached fallback.

| Component | Live | Fallback |
|---|---|---|
| Atlas Trigger on `event_inbox` | Trigger fires orchestrator. | UI inserts event, then calls `/api/orchestrate` directly. |
| EventBridge Scheduler | Fires timed bank event. | Local Next.js timer hits the same `/api/events/bank-transaction` route. |
| Fireworks classification | Live structured JSON. | Cached `retrieval_attempts_expected.json` and `agent_runs_expected.json`. |
| Fireworks drafting | Live draft text. | Deterministic templates from `data/fixtures/baseline_collection_drafts.json`. |
| Fireworks/Voyage embeddings | Live vector retrieval. | Pre-embedded `data/fixtures/evidence_chunks_seed.json` + Atlas Search keyword fallback. |
| ElevenLabs voice | Live MP3 generation. | Cached MP3 in `data/cached_audio/` or transcript-only briefing. |
| AWS API Gateway / Lambda | Live ingress. | Next.js API routes (always available). |
| UI panel error | Live cockpit. | MongoDB Compass / Atlas UI on the same data. |

Reset and rehearsal:

```bash
npm run reset && npm run seed
npm run check:data
npm run check:db
```

The reset script restores the demo state in under thirty seconds.

---

## 10. Security and ethics boundaries

```text
RunwayOps does not provide regulated financial advice.
It does not recommend loans, investments, tax positions, or financial products.
It does not move money.
It does not send customer communications without human approval.
It organises evidence, forecasts operational cash timing, drafts actions,
and records decisions.
```

Every customer-facing draft is labelled:

```text
Pending approval. RunwayOps will not send this without human approval.
```

Secrets:

```text
.env.local is never committed.
MongoDB, Fireworks, ElevenLabs, AWS keys are environment-only.
A secret pasted into chat or git history must be rotated before publishing.
```

---

## 11. What is intentionally not in this build

```text
Real Open Banking (TrueLayer / Plaid)
Real accounting integrations (Xero / QuickBooks / FreeAgent)
Real payroll API integrations
VAT / tax calculations
Customer C in the main demo story
Real email auto-send (SES is optional and limited to a verified address)
Customer voice calls
LiveKit, NVIDIA, NemoClaw
Full multi-tenant authentication
```

These belong to the roadmap, not the hackathon demo.

---

## 12. References

```text
MASTER SPEC.md                              Product brief (source of truth)
docs/implementation-plan.md                 Day-of build plan
docs/demo_script.md                         3-minute stage script
docs/pitch.md                               30-second + 3-minute pitch
docs/judging_answers.md                     Judge Q&A
```

External documentation consulted during planning:

```text
MongoDB Atlas Database Triggers
MongoDB Atlas Trigger limitations
AWS EventBridge Scheduler with Lambda
ElevenLabs quickstart
Voyage AI embeddings and rerankers
Fireworks AI structured outputs
LangGraph persistence + LangSmith observability
```
