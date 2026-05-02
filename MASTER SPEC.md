# RunwayOps: Payroll Risk Command for SMEs — Final Master Project Brief

**Version:** Final hackathon build brief  
**Date:** 2026-05-02  
**Primary build window:** 9 AM–5 PM hackathon day  
**Demo product:** RunwayOps  
**Subtitle:** Payroll Risk Command for SMEs  
**Core concept:** Event-driven agentic cash-timing incident command for small businesses  
**Hard constraint:** MongoDB Atlas Sandbox + AWS must be used visibly and credibly  
**Public repo required:** Yes  
**Stage demo target:** 3 minutes  

---

## 0. Final decision

Build:

```text
RunwayOps
Payroll Risk Command for SMEs
```

Do **not** demo under CashPilot branding.

CashPilot can remain a future parent product family in private notes or README roadmap, but on stage and in the UI the product is only:

```text
RunwayOps
Payroll Risk Command for SMEs
```

The final demo should show one thing extremely well:

> A small business has payroll at risk because cash timing is broken. RunwayOps opens a Payroll Risk Case, retrieves evidence, coordinates specialist workers, drafts approval-ready actions, reacts to a customer reply and a timed bank transaction, replans the forecast/payment plan live, explains the decision, generates a founder briefing, and writes memory for future cases.

The final version is intentionally narrow:

```text
One case.
Two active customers.
One supplier lever.
One ambiguous customer reply.
One timed bank transaction.
One live replanning cascade.
One MongoDB Atlas Live State panel.
One founder voice briefing.
One memory card with future-case preview.
```

---

## 1. Final surgical changes from the latest critique

### Accepted fully

| Area | Final decision |
|---|---|
| Branding | Use **RunwayOps only**. Drop CashPilot from demo UI and stage pitch. |
| Demo scope | Use Customer A, Customer B, and Supplier X only. Hide Customer C in “other overdue invoices” or omit from UI. |
| VAT/tax | Remove from the visible 3-minute demo. Keep only as future roadmap or hidden fixture if needed. |
| Event flow | Use one manual customer-reply event and one timed bank event. |
| Tracks | Present Prolonged Coordination as primary, Adaptive Retrieval as strong secondary, Multi-Agent as supporting. |
| Agent count | Use six named specialist workers, not an 11-agent swarm. |
| Voice | Use ElevenLabs for founder briefing only. No customer calls. |
| Open Banking | Do not build real Open Banking. Use synthetic Open-Banking-style fixtures. |
| Atlas panel | Rename **Atlas Brain** to **MongoDB Atlas Live State**. |
| Memory learning | Add “Next Case Preview” to show how memory affects future behaviour. |
| Failure/resume | Add visible durable state/checkpoint proof; do not make live failure-resume core unless rehearsed. |

### Accepted conditionally

| Area | Conditional decision |
|---|---|
| LangSmith | Add if quick; fall back to internal `agent_runs` trace panel. |
| Failure/resume button | Use in Q&A only if reliable. |
| Adversarial customer reply | Keep as optional backup fixture, not main demo. |
| SES email sending | Optional only to verified demo address. Not core. |
| CloudWatch side panel | Skip unless the whole app is already stable. |

### Rejected

| Idea | Reason |
|---|---|
| Real Open Banking OAuth | Too much integration risk for one day; not the differentiator. |
| Real accounting integrations | Too broad and fragile. |
| VAT/tax calculations | Adds legal/regulatory questions and no stage payoff. |
| Customer C in main story | Clutter unless it matters. |
| Vapi/customer calls | Wrong tone and risk profile. |
| LiveKit | No genuine need. |
| NVIDIA/NemoClaw | No genuine need. |
| More than six agents | Looks fake and creates build complexity. |
| Full second case run | Eats demo time. Use Next Case Preview instead. |

---

## 2. Product thesis

### What is RunwayOps?

RunwayOps is an **agentic payroll-risk command centre** for small businesses.

It does not behave like a conventional finance dashboard. It behaves like an operational incident desk:

```text
Payroll Risk Case opens
→ evidence is retrieved
→ work is assigned
→ drafts are prepared
→ approvals are queued
→ external events arrive
→ forecast changes
→ payment plan changes
→ audit trail explains why
→ founder receives a briefing
→ memory is written for future cases
```

### Who is the user?

Primary user:

```text
Founder, owner-operator, or finance/ops lead at a 5–100 person SME.
```

Demo user:

```text
Emma Marlow
Founder / Managing Director
Marlow & Finch Creative Ltd
12-person design agency
```

Secondary user:

```text
Jules Finch
Finance / Operations Lead
Marlow & Finch Creative Ltd
```

### What painful workflow does it solve?

The painful workflow is not “forecast my cashflow.”

The painful workflow is:

> “Payroll is due Friday. We have cash, overdue invoices, supplier bills, and customer replies scattered across systems. I need to know what to chase, what to hold, what to approve, and what still puts payroll at risk.”

Small businesses often struggle because cash timing breaks before the business model breaks. RunwayOps turns scattered cash-timing signals into a coordinated operational case.

### Why now?

Because modern agentic systems can coordinate event-driven workflows instead of answering static questions. MongoDB Atlas gives the durable context layer for state, evidence, retrieval memory, events, tasks, decisions, forecasts, and audit. AWS gives visible event infrastructure. Fireworks, Voyage, and ElevenLabs provide specific AI capabilities without making the product a thin LLM wrapper.

### Why it is not generic

RunwayOps is not:

```text
AI accountant
accounting dashboard
banking app
cashflow chatbot
invoice chaser
financial advice bot
loan recommender
payment automation tool
```

RunwayOps is:

```text
Payroll Risk Command for SMEs.
```

Its core object is a **case**, not a dashboard and not a chat thread.

---

## 3. Final demo case

### Company

```text
Marlow & Finch Creative Ltd
12-person design agency
Currency: GBP
Timezone: Europe/London
```

### Demo date

```text
Monday 4 May 2026, 09:00 Europe/London
```

### Payroll deadline

```text
Friday 8 May 2026
```

### Visible demo entities

#### Cash

```text
Cash today: £8,400
```

#### Payroll

```text
Payroll due Friday: £11,200
Non-deferrable
Human confirmation required
```

#### Supplier X

```text
Supplier X / MotionPrint
Amount due Thursday: £2,400
Terms: 5-day no-penalty grace period
Essentiality: non-critical this week
```

#### Customer A

```text
Northstar Studio
Invoice: INV-1042
Amount overdue: £4,800
Days overdue: 18
Behaviour: late but responsive; PO-dependent; direct finance-team wording works
```

#### Customer B

```text
Blue Finch Ltd
Invoice: INV-1048
Amount overdue: £2,200
Days overdue: 7
Behaviour: ignores friendly reminders; responds to formal finance-team wording with invoice attached
```

### Hidden or optional entities

Customer C may exist in backend fixtures but should not be discussed during the core stage demo.

```text
Ember & Co
£6,500 overdue
31 days overdue
Slow payer
Hidden under “other overdue invoices”
```

VAT/tax should not be visible in the 3-minute UI. It can exist as backend fixture or future roadmap only.

---

## 4. Deterministic cash maths

The arithmetic must be deterministic and transparent. Do not ask an LLM to do the arithmetic.

### Baseline if Supplier X is paid and no invoices land

```text
£8,400 cash
- £2,400 Supplier X Thursday
- £11,200 payroll Friday
= -£5,200 Friday gap
```

### Supplier X held, no customer receipt

```text
£8,400 cash
- £11,200 payroll
= -£2,800 Friday gap
```

### Supplier X held, Customer A pays Friday

```text
£8,400 cash
+ £4,800 Northstar receipt
- £11,200 payroll
= £2,000 after payroll
```

### After Harbour Labs retainer, Customer A slips

```text
£9,600 cash
- £11,200 payroll
= -£1,600 Friday gap
```

### After Harbour Labs retainer, Customer A pays, Supplier X paid after payroll

```text
£9,600 cash
+ £4,800 Northstar receipt
- £11,200 payroll
- £2,400 Supplier X after payroll
= £800 remaining
```

### Required state transitions

```text
Initial case: HIGH
After ambiguous Northstar reply: still HIGH, with scenario split
After Harbour Labs +£1,200: WATCH, not SAFE
Supplier X recommendation: full delay → conditional hold
Founder briefing generated
Memory card written
```

---

## 5. Critical event design

### Manual event: Customer A ambiguous reply

Triggered by a demo button:

```text
Simulate Customer A Reply
```

Inserted into MongoDB `event_inbox`:

```text
Customer A / Northstar Studio:
“Should be able to pay Friday once the PO is re-approved.”
```

The system must classify this as:

```text
conditional_promise
not guaranteed cash
confidence about 0.48
requires explicit PO/payment confirmation
```

The system must **not** mark payroll safe.

### Timed event: Harbour Labs bank transaction

Triggered automatically 30–45 seconds after “Start live bank feed,” either by AWS EventBridge Scheduler → Lambda or a local timer that calls the AWS ingestion endpoint.

Event:

```text
bank.transaction.posted
+£1,200 Harbour Labs retainer
```

Effect:

```text
Forecast v3 → v4
Risk HIGH → WATCH
Supplier X recommendation full delay → conditional hold
Founder briefing generated
Decision log written
Memory card written
```

This timed second event reduces the demo’s scripted feel.

---

## 6. Hackathon track fit

### Primary: Prolonged Coordination

This is the strongest track.

Why:

```text
The Payroll Risk Case persists across:
- scheduled scan
- customer reply
- bank transaction
- forecast versions
- payment-plan versions
- approval queue
- founder briefing
- memory write
- optional resume/checkpoint state
```

MongoDB stores:

```text
case state
events
tasks
agent runs
forecasts
payment plans
decision logs
briefings
memory
checkpoints
```

Pitch line:

> “This is a long-running payroll-risk case. It can pause, resume, replan, and preserve its history because MongoDB stores the current state, event history, tasks, forecasts, decisions, and checkpoints.”

### Strong secondary: Adaptive Retrieval

Why:

```text
Customer A’s reply is ambiguous.
The system rewrites the query.
It retrieves exact invoice data, email thread context, payment memory, and supplier terms.
It stores the retrieval attempt and judgement.
```

The retrieval is adaptive because it changes strategy by situation:

| Situation | Retrieval behaviour |
|---|---|
| Baseline payroll risk | Structured invoice query + customer memory retrieval |
| Customer A reply | Hybrid search over invoice + thread + memory + payment history |
| Supplier X hold | Supplier terms retrieval + structured bill data |
| Bank transaction | Structured forecast recomputation + plan impact lookup |

Pitch line:

> “This is not basic RAG. The system records what it searched for, how it rewrote the query, which evidence it used, whether the results were sufficient, and what decision came from them.”

### Supporting: Multi-Agent Collaboration

Use credible language:

```text
Six specialist workers coordinate through MongoDB state.
```

Do not oversell as an autonomous swarm.

Specialists:

```text
Event Router
Forecast Agent
Customer Memory Agent
Collections Agent
Payment Run Agent
Audit / Learning Agent
```

Pitch line:

> “The agents do not pass long prompts around. They coordinate through MongoDB documents: tasks, events, retrieval attempts, plans, decisions, and memory.”

---

## 7. Why this is agentic, not just deterministic

### Deterministic

```text
Cash arithmetic
Due-date comparison
Supplier grace-day rule
Scenario totals
Forecast versioning
Idempotency keys
```

### Agentic

```text
Event classification
Ambiguous reply interpretation
Query rewriting
Adaptive retrieval strategy
Evidence sufficiency judgement
Customer-specific drafting
Payment plan replanning
Audit explanation
Founder briefing generation
Memory-card writing
Next-case preview
Human approval routing
```

Use this exact explanation:

> “The maths is deterministic on purpose because payroll risk must be explainable. The agentic layer is everything around the maths: deciding which event matters, retrieving the right evidence, interpreting uncertainty, drafting actions, replanning under new information, explaining the change, generating a briefing, and writing memory for the next case.”

---

## 8. Why MongoDB Atlas is indispensable

RunwayOps should not say:

```text
“We used MongoDB because it stores JSON.”
```

Say:

> “MongoDB Atlas is the durable context engine. It stores the compact live case, event stream, agent coordination, retrieval attempts, memory chunks, forecast versions, payment plan versions, audit trail, generated artifacts, and checkpoints. Atlas Search and Vector Search retrieve evidence. Aggregations compute risk and deltas. Triggers or a poller wake the workflow from `event_inbox`. Without Atlas, this becomes a static dashboard or an in-memory LLM demo with no durable state, audit, or learning.”

### MongoDB-native modelling principles

Use these rules throughout:

```text
Model around workload, not relational tables.
Embed bounded hot-path state.
Reference unbounded logs, events, tool calls, retrievals, chunks, and artifacts.
Use extended references for hot UI display and audit snapshots.
Do not store everything in one giant document.
Keep current live state compact.
Keep full event history queryable.
Use schema validation for core workflow documents.
Store large files/audio in S3; store metadata and references in MongoDB.
```

These rules come directly from the project’s MongoDB study notes and are central to the judge-facing explanation.

---

## 9. MongoDB Atlas Live State panel

Rename the panel from “Atlas Brain” to:

```text
MongoDB Atlas Live State
```

This sounds more credible and less gimmicky.

### Panel should show

```text
event_inbox
events
tasks
agent_runs
retrieval_attempts
memory_chunks
artifacts
cashflow_forecasts
payment_run_plans
decision_log
founder_briefings
memory_cards
```

### During demo, show increments

After Customer A reply:

```text
event_inbox +1
events +1
retrieval_attempts +1
agent_runs +4
cashflow_forecasts v1 → v2
collection_drafts +1
decision_log +1
```

After Harbour Labs bank event:

```text
event_inbox +1
events +1
agent_runs +6
cashflow_forecasts v2 → v3
payment_run_plans v2 → v3
decision_log +1
founder_briefings +1
memory_cards +1
artifacts +1
```

### Live State row format

Each row should show:

```text
Collection
Latest document ID
Change
Why it matters
Timestamp
```

Example:

```text
cashflow_forecasts | forecast_case_0508_v3 | v2 → v3 | Risk HIGH → WATCH | 10:22:12
```

---

## 10. Final UI/UX design

The UI must be a command cockpit, not a dashboard.

### Single-page layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP RISK COMMAND BAR                                                        │
│ Payroll Risk Case | HIGH/WATCH | Cash £8,400/£9,600 | Payroll £11,200 Fri   │
│ Gap £5,200 / £1,600 | Time to Payroll | Approvals | Plan v3                 │
├──────────────┬──────────────────────────────────────────────┬────────────────┤
│ EVENT FEED   │ MAIN CASE BOARD                              │ MONGODB ATLAS  │
│              │                                              │ LIVE STATE     │
│ scheduler    │ Cash runway timeline                         │ event_inbox    │
│ case opened  │ Scenario split                               │ events         │
│ email event  │ Invoice priority                             │ tasks          │
│ trigger fired│ Payment run recommendation                   │ agent_runs     │
│ forecast diff│ Approval queue                               │ retrievals     │
│ bank event   │                                              │ forecasts      │
│ plan revised │                                              │ plans          │
│ briefing     │                                              │ memory         │
├──────────────┴──────────────────────┬───────────────────────┴────────────────┤
│ AGENT WORKERS                       │ DRAFTS / APPROVALS / BRIEFING           │
│ Event Router                         │ Northstar confirmation email            │
│ Forecast Agent                       │ Blue Finch formal reminder              │
│ Customer Memory Agent                │ Supplier X conditional hold             │
│ Collections Agent                    │ Founder briefing transcript/audio       │
│ Payment Run Agent                    │ Memory card + next-case preview         │
│ Audit/Learning Agent                 │                                        │
└──────────────────────────────────────┴────────────────────────────────────────┘
```

### Top command bar

Must show:

```text
Payroll Risk Case
Status: HIGH / WATCH
Cash today: £8,400 → £9,600
Payroll due: £11,200 Friday
Projected gap
Time to payroll
Approvals pending
Plan version
```

### Event feed

Must show:

```text
scheduler.payroll_scan
case.opened
forecast.v1_created
drafts.created
payment_plan.v1_created
email.received
atlas_trigger.fired / fallback_poller.detected
reply.classified
forecast.v2_created
bank.transaction.posted
forecast.v3_created
payment_plan.v3_created
briefing.generated
memory_card.written
```

### Main case board

Must show:

```text
Cash runway timeline
Scenario split:
  - Northstar pays
  - Northstar slips
Invoice priority:
  - Northstar
  - Blue Finch
Payment run recommendation:
  - Supplier X full delay → conditional hold
Approval queue
```

### Draft panel

Must show:

```text
Northstar confirmation email
Blue Finch formal reminder
Supplier X conditional hold
```

All must be pending human approval.

### Audit / Why drawer

Must answer:

```text
What changed?
Why did risk move HIGH → WATCH?
Why is it not SAFE?
Why did Supplier X change from full delay to conditional hold?
Which evidence was used?
What needs approval?
```

### Founder briefing panel

Must show:

```text
Transcript
Audio play button
Generated from forecast v3 and payment plan v3
S3 key or cached local path
```

### Memory card + Next Case Preview

Memory card:

```text
Northstar promises are conditional unless PO confirmation is explicit.
Use direct finance-team wording with PO reference.
Do not treat “should be able to pay” as guaranteed cash.
```

Next Case Preview:

```text
If Northstar appears in a future Payroll Risk Case:
- treat “should be able to pay” as conditional
- require PO confirmation
- use direct finance-team wording
```

---

## 11. Final 3-minute demo script

### 0:00–0:20 — Case opens

Show top command bar.

Narration:

> “This is Marlow & Finch Creative, a 12-person design agency. They are not failing as a business. Their cash timing is broken. They have £8,400 today, payroll of £11,200 due Friday, and Supplier X due Thursday. RunwayOps has opened a Payroll Risk Case.”

Visible:

```text
Payroll Risk Case
Status: HIGH
Projected gap: £5,200
Time to payroll: 4 days
```

### 0:20–0:45 — Root cause

Show forecast scenarios.

Narration:

> “The Forecast Agent does deterministic cash timing. If Supplier X is paid and no invoices land, Friday is short by £5,200. If Supplier X is held, the gap drops to £2,800, but payroll still does not clear.”

Visible:

```text
Pay Supplier X + no collections: -£5,200
Hold Supplier X + no collections: -£2,800
Hold Supplier X + Northstar pays: +£2,000
```

### 0:45–1:15 — Adaptive retrieval

Open Northstar evidence.

Narration:

> “The Customer Memory Agent identifies the highest-leverage invoices. Northstar is the main dependency, but previous payment memory says their promises are conditional when PO approval is not explicit.”

Visible retrieval trace:

```text
Query: Northstar INV-1042 Friday PO re-approved
Strategy: hybrid search
Results:
- INV-1042 exact match
- Northstar email thread
- payment history
- memory card: PO-dependent promises
```

### 1:15–1:40 — Drafts and approval queue

Show draft panel.

Narration:

> “RunwayOps does not send messages or move money. It prepares approval-ready actions.”

Visible:

```text
Northstar confirmation email
Blue Finch formal reminder
Supplier X hold approval
```

### 1:40–2:10 — Customer A reply

Click:

```text
Simulate Customer A Reply
```

Narration:

> “Now Northstar replies: ‘Should be able to pay Friday once the PO is re-approved.’ RunwayOps does not count that as cash. It classifies it as a conditional promise, lowers confidence, and asks for explicit confirmation.”

Visible:

```text
Classification: conditional_promise
Guaranteed cash: no
Confidence: 0.48
Action: ask for PO/payment confirmation
Risk: still HIGH
```

### 2:10–2:30 — Timed bank event

Timed event arrives while explaining.

Visible event feed:

```text
bank.transaction.posted
+£1,200 Harbour Labs retainer
```

Narration:

> “A live bank-feed event arrives: Harbour Labs has paid a £1,200 retainer. MongoDB receives the event, the workflow wakes, and the forecast changes.”

Visible:

```text
Forecast v2 → v3
Risk HIGH → WATCH
Supplier X: full delay → conditional hold
```

### 2:30–2:45 — MongoDB Atlas Live State

Open right panel.

Narration:

> “MongoDB is not storing chat history. It is the live state layer: events, tasks, retrieval attempts, agent runs, forecasts, payment plans, audit logs, artifacts, and memory.”

Visible:

```text
event_inbox +2
retrieval_attempts +1
agent_runs +6
cashflow_forecasts v2→v3
payment_run_plans v2→v3
decision_log +2
founder_briefings +1
memory_cards +1
```

### 2:45–3:00 — Founder briefing and memory

Play or show briefing.

Narration:

> “The founder gets a short action briefing, and the system writes memory for the next case.”

Briefing transcript:

```text
Payroll risk is now watch, not cleared. Harbour Labs paid £1,200.
Northstar says they should be able to pay Friday, but payment depends on PO re-approval.
Approve the Northstar confirmation email, hold Supplier X until Friday morning,
and keep chasing Blue Finch. If Northstar slips, payroll remains short by £1,600.
```

Memory card:

```text
Northstar promises are conditional unless PO confirmation is explicit.
Use direct finance-team wording with PO reference.
```

---

## 12. Synthetic data plan

### Required folder tree

```text
data/
  fixtures/
  events/
  expected_outputs/
  cached_audio/
```

### Core fixture files

```text
company.json
users.json
customers.json
invoices.json
customer_payment_history.json
supplier_bills.json
supplier_terms.json
payroll_obligations.json
recurring_payments.json
bank_transactions_open_banking_style.json
email_threads.json
source_files.json
evidence_chunks_seed.json
memory_cards_seed.json
past_cash_squeeze_cases.json
baseline_payroll_case.json
baseline_case_events.json
baseline_collection_drafts.json
baseline_payment_run_plan.json
```

### Event files

```text
01_scheduler_payroll_scan.json
02_customer_a_conditional_reply.json
03_harbour_labs_retainer_posted.json
04_customer_b_no_response_tick.json
05_user_approves_northstar_confirmation.json
06_user_approves_supplier_x_conditional_hold.json
07_customer_a_dispute_backup.json
```

### Expected output files

```text
forecast_v1_baseline.json
forecast_v2_after_customer_a_reply.json
forecast_v3_after_harbour_labs_retainer.json
payment_plan_v1_baseline.json
payment_plan_v2_after_customer_reply.json
payment_plan_v3_after_bank_transaction.json
decision_log_expected.json
founder_briefing_expected.json
memory_card_expected.json
retrieval_attempts_expected.json
agent_runs_expected.json
```

### Data simplification from earlier version

Main demo should show only:

```text
Customer A / Northstar
Customer B / Blue Finch
Supplier X / MotionPrint
Harbour Labs bank receipt
Payroll obligation
```

Customer C can remain hidden or be removed.

VAT should be removed from visible fixtures.

---

## 13. MongoDB schema

### Collection naming strategy

Use generic agentic collections plus domain collections.

Generic agentic collections:

```text
cases
events
tasks
agent_runs
retrieval_attempts
memory_chunks
artifacts
checkpoints
```

Domain-specific collections:

```text
companies
users
customers
invoices
supplier_bills
payroll_obligations
bank_transactions_ts
email_threads
cashflow_forecasts
payment_run_plans
collection_drafts
decision_log
founder_briefings
memory_cards
source_files
agent_scratch
retrieval_cache
event_inbox
```

### Why this naming works

It maps cleanly to the agentic MongoDB model:

```text
cases = current durable state
events = append-only timeline
tasks = coordination
agent_runs = worker execution trace
retrieval_attempts = adaptive retrieval proof
memory_chunks = vector retrieval substrate
artifacts = generated outputs
checkpoints = resume proof
```

Then the finance domain collections hold the business facts.

---

## 14. Key MongoDB documents

### `cases`

Compact live state only.

```json
{
  "_id": "case_payroll_2026_05_08",
  "case_ref": "PR-2026-0508",
  "company_id": "cmp_marlow_finch",
  "case_type": "payroll_risk",
  "status": "active",
  "risk_status": "high",
  "opened_at": "2026-05-04T09:01:00+01:00",
  "payroll": {
    "due_date": "2026-05-08",
    "amount": 11200,
    "currency": "GBP"
  },
  "current_state": {
    "cash_today": 8400,
    "projected_gap_baseline": 5200,
    "approvals_pending": 3,
    "active_plan_version": 1,
    "latest_forecast_version": 1,
    "latest_checkpoint_id": "chk_case_0508_v1"
  },
  "top_invoice_refs": [
    {
      "invoice_id": "inv_1042",
      "invoice_no": "INV-1042",
      "customer_id": "cust_northstar",
      "customer_name": "Northstar Studio",
      "amount_due": 4800,
      "days_overdue": 18,
      "display_reason": "highest near-term leverage but conditional payer"
    },
    {
      "invoice_id": "inv_1048",
      "invoice_no": "INV-1048",
      "customer_id": "cust_bluefinch",
      "customer_name": "Blue Finch Ltd",
      "amount_due": 2200,
      "days_overdue": 7,
      "display_reason": "backup collection target; responds to formal finance wording"
    }
  ],
  "active_agent_refs": [
    {
      "agent_id": "forecast_agent",
      "name": "Forecast Agent",
      "status": "complete",
      "last_run_id": "run_forecast_001"
    }
  ],
  "bounded_recent_events": [
    {
      "event_id": "evt_case_opened_001",
      "event_type": "case.opened",
      "label": "Payroll Risk Case opened",
      "ts": "2026-05-04T09:01:00+01:00"
    }
  ],
  "updated_at": "2026-05-04T09:02:00+01:00",
  "version": 1
}
```

Important:

```text
Do not embed all events, all forecasts, all emails, all agent runs, or all retrievals.
```

### `event_inbox`

Trigger source.

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
  "related_entities": {
    "customer_id": "cust_northstar",
    "invoice_id": "inv_1042",
    "thread_id": "thread_northstar_inv1042"
  },
  "payload": {
    "from": "finance@northstar.example",
    "customer_name": "Northstar Studio",
    "invoice_no": "INV-1042",
    "subject": "Re: INV-1042 / PO-7781",
    "body": "Should be able to pay Friday once the PO is re-approved."
  },
  "processing": {
    "attempts": 0,
    "locked_by": null,
    "locked_until": null
  }
}
```

### `events`

Append-only case timeline.

```json
{
  "_id": "event_case_0508_012",
  "company_id": "cmp_marlow_finch",
  "case_id": "case_payroll_2026_05_08",
  "event_type": "forecast.updated",
  "label": "Forecast v2 → v3 after Harbour Labs retainer",
  "payload": {
    "from_version": 2,
    "to_version": 3,
    "risk_from": "high",
    "risk_to": "watch"
  },
  "ts": "2026-05-06T10:22:13+01:00"
}
```

### `tasks`

Coordination and approval.

```json
{
  "_id": "task_approve_supplier_x_hold",
  "company_id": "cmp_marlow_finch",
  "case_id": "case_payroll_2026_05_08",
  "task_type": "approval",
  "status": "pending_human_approval",
  "assigned_to": {
    "user_id": "user_founder_emma",
    "name": "Emma Marlow",
    "role": "Founder"
  },
  "assigned_agent_snapshot": {
    "agent_id": "payment_run_agent",
    "name": "Payment Run Agent",
    "version": "v1"
  },
  "input": {
    "payment_plan_id": "plan_case_0508_v3",
    "action": "conditional_hold_supplier_x"
  },
  "created_at": "2026-05-06T10:22:15+01:00",
  "updated_at": "2026-05-06T10:22:15+01:00"
}
```

### `retrieval_attempts`

Adaptive retrieval proof.

```json
{
  "_id": "ret_customer_a_reply_001",
  "company_id": "cmp_marlow_finch",
  "case_id": "case_payroll_2026_05_08",
  "task_id": "task_classify_northstar_reply",
  "agent_id": "customer_memory_agent",
  "intent": "classify_conditional_payment_promise",
  "query_original": "Should be able to pay Friday once the PO is re-approved.",
  "query_rewritten": "Northstar Studio INV-1042 Friday payment promise PO re-approved prior reliability",
  "strategy": "hybrid_search_then_voyage_rerank",
  "filters": {
    "customer_id": "cust_northstar",
    "invoice_id": "inv_1042",
    "source_types": ["invoice", "email_thread", "memory_card", "payment_history"]
  },
  "top_results": [
    {
      "chunk_id": "chunk_northstar_current_reply",
      "source_type": "email_thread",
      "score": 0.93
    },
    {
      "chunk_id": "chunk_northstar_po_memory",
      "source_type": "memory_card",
      "score": 0.89
    }
  ],
  "agent_judgement": {
    "sufficient": true,
    "classification": "conditional_promise",
    "is_guaranteed_payment": false,
    "confidence": 0.48,
    "reason": "Payment depends on PO re-approval."
  },
  "created_at": "2026-05-06T10:15:10+01:00"
}
```

### `memory_chunks`

Vector retrieval substrate.

```json
{
  "_id": "chunk_northstar_po_memory",
  "company_id": "cmp_marlow_finch",
  "source_id": "mem_northstar_payment_behaviour_seed",
  "source_type": "memory_card",
  "chunk_index": 0,
  "text": "Northstar often pays late but responds to direct finance-team wording. Payment promises are less reliable when they depend on PO approval. Include PO references and ask for explicit payment confirmation.",
  "embedding": [],
  "embedding_model": "voyage-4-lite",
  "embedding_dim": 1024,
  "metadata": {
    "customer_id": "cust_northstar",
    "invoice_no": "INV-1042",
    "tags": ["po_dependent", "conditional_promise", "payment_behaviour"]
  },
  "created_at": "2026-05-04T09:00:00+01:00"
}
```

### `cashflow_forecasts`

```json
{
  "_id": "forecast_case_0508_v3",
  "company_id": "cmp_marlow_finch",
  "case_id": "case_payroll_2026_05_08",
  "version": 3,
  "generated_at": "2026-05-06T10:22:12+01:00",
  "trigger_event_ids": [
    "evt_customer_a_reply_001",
    "evt_bank_harbour_001"
  ],
  "cash_today": 9600,
  "risk_status": "watch",
  "scenarios": [
    {
      "scenario_id": "northstar_pays_supplier_held",
      "label": "Northstar pays Friday; Supplier X held until after payroll",
      "friday_position_after_payroll": 3200,
      "balance_after_supplier_paid": 800,
      "risk": "watch",
      "confidence": 0.48
    },
    {
      "scenario_id": "northstar_slips_supplier_held",
      "label": "Northstar slips; Supplier X held",
      "friday_position_after_payroll": -1600,
      "risk": "high"
    }
  ],
  "recommended_action_summary": "Risk improves to watch, not cleared. Keep Supplier X on conditional hold until Northstar payment clears."
}
```

### `payment_run_plans`

```json
{
  "_id": "plan_case_0508_v3",
  "company_id": "cmp_marlow_finch",
  "case_id": "case_payroll_2026_05_08",
  "version": 3,
  "status": "pending_approval",
  "previous_recommendation": "delay_supplier_x_full_5_day_grace",
  "new_recommendation": "conditional_hold_until_northstar_payment_clears",
  "risk_status": "watch",
  "rationale": [
    "Harbour Labs £1,200 retainer reduces payroll gap.",
    "Northstar payment remains conditional on PO re-approval.",
    "If Northstar pays, payroll clears and Supplier X can be paid after payroll with £800 remaining.",
    "If Northstar slips, payroll remains short by £1,600 even with Supplier X held."
  ],
  "requires_human_approval": true
}
```

### `founder_briefings`

```json
{
  "_id": "briefing_case_0508_v3",
  "company_id": "cmp_marlow_finch",
  "case_id": "case_payroll_2026_05_08",
  "plan_id": "plan_case_0508_v3",
  "forecast_id": "forecast_case_0508_v3",
  "status": "generated",
  "transcript": "Payroll risk is now watch, not cleared. Harbour Labs paid £1,200. Northstar says they should be able to pay Friday, but payment depends on PO re-approval. Approve the Northstar confirmation email, hold Supplier X until Friday morning, and keep chasing Blue Finch. If Northstar slips, payroll remains short by £1,600.",
  "audio": {
    "provider": "elevenlabs",
    "storage_provider": "aws_s3",
    "bucket": "runwayops-demo-artifacts",
    "key": "briefings/case_0508_v3.mp3",
    "fallback_local_path": "data/cached_audio/briefing_case_0508_v3.mp3"
  },
  "created_at": "2026-05-06T10:25:00+01:00"
}
```

### `memory_cards`

```json
{
  "_id": "mem_northstar_po_conditional_promises",
  "company_id": "cmp_marlow_finch",
  "entity_type": "customer",
  "entity_id": "cust_northstar",
  "memory_type": "payment_promise_behaviour",
  "text": "Northstar promises are conditional unless PO confirmation is explicit. Use direct finance-team wording with PO reference. Do not treat 'should be able to pay' as guaranteed cash.",
  "facts": {
    "conditional_phrase_seen": "Should be able to pay Friday once the PO is re-approved.",
    "condition": "PO re-approval",
    "treat_as_guaranteed_cash": false,
    "recommended_follow_up": "ask_for_explicit_payment_confirmation",
    "best_tone": "direct_finance_team_wording",
    "include_po_reference": true
  },
  "confidence": 0.74,
  "evidence_refs": [
    {
      "collection": "email_threads",
      "id": "thread_northstar_inv1042"
    },
    {
      "collection": "retrieval_attempts",
      "id": "ret_customer_a_reply_001"
    },
    {
      "collection": "decision_log",
      "id": "decision_plan_change_after_harbour"
    }
  ],
  "embedding_required": true,
  "created_by_agent": "audit_learning_agent",
  "created_at": "2026-05-06T10:26:00+01:00"
}
```

---

## 15. Indexes

### Core indexes

```javascript
// event inbox idempotency and queue
db.event_inbox.createIndex({ company_id: 1, event_key: 1 }, { unique: true })
db.event_inbox.createIndex({ status: 1, received_at: 1 })
db.event_inbox.createIndex({ company_id: 1, case_id: 1, received_at: -1 })

// case dashboard
db.cases.createIndex({ company_id: 1, status: 1, updated_at: -1 })
db.cases.createIndex({ company_id: 1, case_ref: 1 }, { unique: true })

// event timeline
db.events.createIndex({ company_id: 1, case_id: 1, ts: 1 })
db.events.createIndex({ event_type: 1, ts: -1 })

// task queue
db.tasks.createIndex({ company_id: 1, case_id: 1, status: 1, updated_at: -1 })
db.tasks.createIndex({ "assigned_agent_snapshot.agent_id": 1, status: 1 })

// agent run trace
db.agent_runs.createIndex({ company_id: 1, case_id: 1, started_at: -1 })
db.agent_runs.createIndex({ agent_id: 1, status: 1, started_at: -1 })

// retrieval trace
db.retrieval_attempts.createIndex({ company_id: 1, case_id: 1, created_at: -1 })
db.retrieval_attempts.createIndex({ task_id: 1, created_at: -1 })

// memory chunks
db.memory_chunks.createIndex({ company_id: 1, source_id: 1, chunk_index: 1 })
db.memory_chunks.createIndex({ company_id: 1, "metadata.customer_id": 1, "metadata.source_type": 1 })

// invoices and customers
db.invoices.createIndex({ company_id: 1, status: 1, due_date: 1 })
db.invoices.createIndex({ company_id: 1, customer_id: 1, status: 1 })
db.invoices.createIndex({ company_id: 1, invoice_no: 1 }, { unique: true })

// forecasts and plans
db.cashflow_forecasts.createIndex({ company_id: 1, case_id: 1, version: -1 })
db.payment_run_plans.createIndex({ company_id: 1, case_id: 1, version: -1 })

// artifacts and briefings
db.artifacts.createIndex({ company_id: 1, case_id: 1, artifact_type: 1, created_at: -1 })
db.founder_briefings.createIndex({ company_id: 1, case_id: 1, created_at: -1 })

// decisions and memory
db.decision_log.createIndex({ company_id: 1, case_id: 1, created_at: -1 })
db.memory_cards.createIndex({ company_id: 1, entity_type: 1, entity_id: 1, memory_type: 1 })
```

### Time-series collection

Use for normalized bank transactions:

```javascript
db.createCollection("bank_transactions_ts", {
  timeseries: {
    timeField: "posted_at",
    metaField: "account_meta",
    granularity: "hours"
  }
})

db.bank_transactions_ts.createIndex({
  "account_meta.company_id": 1,
  "posted_at": 1
})
```

Important:

```text
Do not trigger directly on time-series collection.
Trigger/poll event_inbox instead.
```

### TTL indexes

Use for scratch/cache only.

```javascript
db.agent_scratch.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
db.retrieval_cache.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
```

---

## 16. Atlas Search and Vector Search

### Vector index

Collection:

```text
memory_chunks
```

Index:

```json
{
  "name": "memory_vector_index",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      {
        "type": "vector",
        "path": "embedding",
        "numDimensions": 1024,
        "similarity": "cosine"
      },
      {
        "type": "filter",
        "path": "company_id"
      },
      {
        "type": "filter",
        "path": "metadata.customer_id"
      },
      {
        "type": "filter",
        "path": "metadata.invoice_id"
      },
      {
        "type": "filter",
        "path": "metadata.source_type"
      },
      {
        "type": "filter",
        "path": "metadata.tags"
      }
    ]
  }
}
```

Use `voyage-4-lite` or current Voyage model with 1024 dimensions unless the team explicitly chooses another dimension.

### Atlas Search index

Collection:

```text
memory_chunks
```

Index:

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "company_id": { "type": "string" },
      "text": { "type": "string", "analyzer": "lucene.standard" },
      "metadata.customer_name": [
        { "type": "string" },
        { "type": "autocomplete" }
      ],
      "metadata.invoice_no": { "type": "string" },
      "metadata.po_number": { "type": "string" },
      "metadata.source_type": { "type": "stringFacet" },
      "metadata.tags": { "type": "stringFacet" },
      "metadata.event_date": { "type": "date" }
    }
  }
}
```

### Hybrid retrieval strategy

For Customer A:

```text
Structured lookup:
- invoice INV-1042
- customer cust_northstar

Atlas Search:
- exact invoice number
- PO-7781
- “Friday”
- “PO re-approved”

Vector Search:
- conditional promise behaviour
- PO-dependent payments
- prior promise reliability

Voyage rerank:
- top 20 → top 5 evidence chunks
```

Store the whole attempt in `retrieval_attempts`.

---

## 17. Schema validation

Use validation lightly but visibly.

### Strict + error

```text
cases
event_inbox
tasks
cashflow_forecasts
payment_run_plans
collection_drafts
approvals
```

### Moderate or warn

```text
source_files
raw fixture ingestion
memory_chunks during early ingestion
```

### Example validator for `event_inbox`

```javascript
db.createCollection("event_inbox", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["company_id", "event_key", "event_type", "status", "received_at", "payload"],
      properties: {
        company_id: { bsonType: "string" },
        event_key: { bsonType: "string" },
        event_type: {
          enum: [
            "scheduler.payroll_scan",
            "email.received",
            "bank.transaction.posted",
            "approval.updated",
            "customer.dispute.received"
          ]
        },
        status: {
          enum: ["new", "processing", "processed", "failed", "ignored_duplicate"]
        },
        received_at: { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
})
```

---

## 18. AWS architecture

### Final architecture

```text
UI / Demo Timer
      ↓
API Gateway
      ↓
Lambda: ingest_event
      ↓
MongoDB Atlas: event_inbox
      ↓
Atlas Trigger OR fallback poller
      ↓
RunwayOps orchestrator
      ↓
MongoDB Atlas writes:
  events
  tasks
  retrieval_attempts
  agent_runs
  forecasts
  payment plans
  drafts
  decision logs
  founder briefings
  memory cards
      ↓
S3:
  fixture files
  cached/generated founder briefing MP3
```

### AWS services

| Service | Use |
|---|---|
| API Gateway | Demo-safe external event ingress. |
| Lambda | Insert customer reply and bank transaction events into MongoDB. |
| EventBridge Scheduler | Timed bank event or scheduled payroll scan. |
| S3 | Store fixture PDFs/CSVs/audio artifacts. |
| CloudWatch | Optional logs only; not a core panel. |

### What starts workflows

```text
1. Scheduled payroll-risk scan opens the case.
2. Manual customer reply event triggers ambiguous-promise handling.
3. Timed bank transaction event triggers recalculation.
4. Human approval events can update tasks/drafts.
```

### Automatic vs simulated vs manual

Automatic:

```text
event routing
agent workflow
forecast recalculation
payment-plan revision
audit summary
briefing transcript generation
memory-card writing
case state update
```

Simulated:

```text
email arrival
bank transaction feed
payroll scan
fixture uploads
```

Manual:

```text
start live bank feed
simulate customer reply
approve/reject drafts
play founder briefing
optional pause/resume demo
```

---

## 19. Trigger strategy and fallback

### Preferred

```text
Single Atlas Trigger on event_inbox inserts
```

Do not create multiple triggers.

Do not trigger on:

```text
bank_transactions_ts
cashflow_forecasts
payment_run_plans
```

Reason:

```text
event_inbox is regular, small, idempotent, and purpose-built for wakeups.
```

### Fallback

If Atlas Trigger setup is unreliable:

```text
UI inserts event → calls /api/orchestrate directly
```

or:

```text
EventBridge scheduled poller checks event_inbox where status = "new"
```

This is acceptable if the UI still shows:

```text
event_inbox insert
worker picked up event
agent_runs written
forecast/plan/memory updated
```

### Due diligence note

Atlas Triggers use change streams and cannot be defined on time-series collections. Flex/change-stream limitations also matter, so the `event_inbox` pattern is safer than triggering on domain collections.

---

## 20. Agent workflow

### Six-worker MVP

```text
Event Router
Forecast Agent
Customer Memory Agent
Collections Agent
Payment Run Agent
Audit / Learning Agent
```

### Event Router

Role:

```text
Classify event type, find case, prevent duplicate processing, create tasks.
```

Inputs:

```text
event_inbox document
case state
```

Outputs:

```text
events
tasks
agent_runs
event_inbox.status update
```

Failure mode:

```text
unknown event → task_needs_review
duplicate event_key → ignored_duplicate
```

### Forecast Agent

Role:

```text
Deterministically compute cash scenarios and write forecast version.
```

Inputs:

```text
cash today
payroll obligation
supplier bill
invoice assumptions
bank transactions
```

Outputs:

```text
cashflow_forecasts
cases.current_state
events
agent_runs
```

Failure mode:

```text
missing amount/date → forecast status incomplete and task_needs_data
```

### Customer Memory Agent

Role:

```text
Rewrite query, retrieve evidence, classify ambiguous customer reply.
```

Inputs:

```text
customer reply
invoice/customer IDs
memory_chunks
email_threads
payment_history
```

Outputs:

```text
retrieval_attempts
classification
agent_runs
events
```

Failure mode:

```text
low evidence score → ask for human confirmation and use neutral draft
```

### Collections Agent

Role:

```text
Draft approval-ready customer emails.
```

Inputs:

```text
invoice
customer memory
classification
company policy
```

Outputs:

```text
collection_drafts
tasks
agent_runs
```

Failure mode:

```text
LLM failure → deterministic template
```

### Payment Run Agent

Role:

```text
Recommend supplier timing changes under human approval.
```

Inputs:

```text
latest forecast
supplier terms
payment policy
```

Outputs:

```text
payment_run_plans
approval tasks
decision_log
agent_runs
```

Failure mode:

```text
uncertain supplier terms → no recommendation; human review required
```

### Audit / Learning Agent

Role:

```text
Explain why the plan changed, generate founder briefing text, write memory card, create artifact metadata.
```

Inputs:

```text
forecast diff
payment plan diff
retrieval attempts
agent outputs
```

Outputs:

```text
decision_log
founder_briefings
memory_cards
artifacts
events
agent_runs
```

Failure mode:

```text
missing evidence refs → write draft memory pending review
```

---

## 21. Fireworks, Voyage, LangGraph, LangSmith, ElevenLabs

### Fireworks AI

Use for:

```text
ambiguous reply classification
draft email generation
audit summary
memory-card wording
founder briefing transcript
```

Use structured JSON outputs where possible.

Do **not** use Fireworks for:

```text
cash arithmetic
due-date maths
idempotency
database writes without validation
```

### Voyage AI

Use for:

```text
embedding memory chunks
embedding email thread chunks
embedding supplier terms
embedding prior case summaries
optional reranking
```

Recommended:

```text
voyage-4-lite
1024 dimensions
```

### LangGraph

Use if it accelerates the workflow.

Good fit:

```text
stateful graph
checkpointing
human-in-the-loop
pause/resume
```

Fallback:

```text
explicit TypeScript/Python state machine
```

Do not let LangGraph block the core demo.

### LangSmith

Use if fast.

Store in `agent_runs`:

```json
{
  "trace_url": "https://smith.langchain.com/...",
  "fallback_trace": "internal_agent_run_view"
}
```

If it fails, internal `agent_runs` panel is sufficient.

### ElevenLabs

Use only for:

```text
Founder Briefing
```

Do not use for:

```text
customer calls
debt collection calls
real-time voice interface
```

Always cache MP3.

---

## 22. Email decision

### Core

```text
Draft + approval only.
```

### Optional

```text
SES send to verified demo address only.
```

### Not core

```text
Gmail OAuth
Outlook OAuth
real email automation
customer auto-send
```

### UI wording

Every draft should say:

```text
Pending approval. RunwayOps will not send this without human approval.
```

---

## 23. Voice decision

### Keep

```text
ElevenLabs founder briefing
```

### Skip

```text
Vapi
LiveKit
customer calls
outbound collections voice
```

### Founder briefing transcript

```text
Payroll risk is now watch, not cleared. Harbour Labs paid £1,200.
Northstar says they should be able to pay Friday, but payment depends on PO re-approval.
Approve the Northstar confirmation email, hold Supplier X until Friday morning,
and keep chasing Blue Finch. If Northstar slips, payroll remains short by £1,600.
```

---

## 24. Open Banking decision

### Final decision

Do not build real Open Banking.

Use:

```text
synthetic Open-Banking-style transaction fixtures
```

### Future integrations only

Mention only in roadmap:

```text
TrueLayer
Plaid
Xero
QuickBooks
FreeAgent
Gmail / Outlook
Payroll providers
```

### Why

Real Open Banking introduces:

```text
OAuth setup
redirect URIs
consent screens
bank sandbox credentials
token exchange
account selection
error states
```

That is not the demo differentiator.

---

## 25. Prior MongoDB hackathon repo lessons

### Due diligence status

The repo lessons should be treated as **scaffold inspiration**, not hard dependencies. If the team uses code from any public repo, verify the repo, license, and current API compatibility directly during build. Do not make the final demo depend on cloning external finalist repos.

### Confirmed public recap-level lesson

A public recap of the MongoDB.local San Francisco 2026 agentic hackathon reports themes including Prolonged Coordination, Multi-Agent Collaboration, Adaptive Retrieval, and a Coinbase track, and lists Just Price as first place, Moongrade/Mongrate as second, and SOA as third. It also describes Voyage AI and Fireworks AI as part of the finalist technology mix.

### Pattern to copy from Just Price / Fairward

Do not copy healthcare. Copy the product shape:

```text
messy high-pain domain
→ retrieve/search evidence
→ operational action
→ human approval
→ external-world workflow
→ memory/learning loop
```

RunwayOps equivalent:

```text
payroll risk detected
→ retrieve invoice/customer/supplier evidence
→ draft approvals
→ react to customer/bank events
→ replan payment timing
→ founder briefing
→ memory card
```

Potential scaffold patterns:

```text
MongoDB connection singleton
Voyage embedding helper
vector-search utility
API route validation
human-in-loop outreach/draft pattern
```

### Pattern to copy from Watch and Learn

Copy retrieval discipline:

```text
query rewrite
vector/keyword retrieval
rerank
store retrieval_attempt
use top evidence only
```

Do not copy:

```text
browser automation
Playwright/VNC/Docker browser loop
```

### Pattern to copy from Mongrate

Copy workflow/progress structure:

```text
plan
→ review/approve
→ execute
→ track progress
→ artifact
```

RunwayOps equivalent:

```text
payroll risk plan
→ founder approval
→ draft actions
→ event-driven replan
→ founder briefing/payment plan artifact
```

### Pattern to copy from EvacuTrace

Copy demo craft:

```text
live event log
visible step-by-step progression
animated state changes
fallback reliability
```

Do not copy deceptive success behaviour. Cached fallback must be clear internally and not misrepresented if challenged.

### Pattern to copy from SOA/SOGA

Copy demo theatre:

```text
visible agent action
simple story
clear wow moment
```

Do not copy hardware/smart-glasses stack.

### Final scaffold approach

```text
Next.js app
├── lib/mongodb.ts
├── lib/voyage.ts
├── lib/evidence-db.ts
├── scripts/seed-demo.ts
├── app/api/events/...
├── app/api/retrieve/...
├── components/CaseBoard
├── components/MongoAtlasLiveState
├── components/FounderBriefing
└── components/MemoryCardPreview
```

---

## 26. Technical stack

### Frontend

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui optional
Recharts or custom SVG timeline
```

### Backend

Choose one path:

#### Preferred if team is JS/TS-heavy

```text
Next.js API routes
MongoDB Node driver
TypeScript state machine
```

#### Alternative if team is Python-heavy

```text
FastAPI
PyMongo
LangGraph Python
```

### Database

```text
MongoDB Atlas Sandbox
Atlas Search
Atlas Vector Search
time-series bank_transactions_ts
TTL indexes
schema validation
```

### AWS

```text
API Gateway
Lambda
EventBridge Scheduler
S3
CloudWatch logs optional
```

### AI providers

```text
Fireworks AI
Voyage AI
ElevenLabs
LangGraph/LangSmith optional
```

---

## 27. Repo structure

```text
runwayops/
  README.md
  .env.example
  package.json

  apps/
    web/
      app/
        page.tsx
        api/
          events/
            customer-reply/route.ts
            bank-transaction/route.ts
            start-live-feed/route.ts
            orchestrate/route.ts
          retrieve/
            customer-memory/route.ts
          briefing/
            route.ts
      components/
        RiskCommandBar.tsx
        EventFeed.tsx
        CaseBoard.tsx
        AgentWorkers.tsx
        DraftApprovalPanel.tsx
        MongoAtlasLiveState.tsx
        AuditWhyDrawer.tsx
        FounderBriefing.tsx
        MemoryCardPreview.tsx
      lib/
        mongodb.ts
        voyage.ts
        fireworks.ts
        evidence-db.ts
        forecast.ts
        orchestrator.ts
        tts.ts
        types.ts

  db/
    create_collections.js
    create_indexes.js
    validators.js
    atlas_search_index.json
    vector_search_index.json

  data/
    fixtures/
    events/
    expected_outputs/
    cached_audio/

  scripts/
    seed-demo.ts
    reset-demo.ts
    embed-fixtures.ts
    simulate-event.ts
    check-maths.ts

  infra/
    aws-sam/
      template.yaml

  docs/
    architecture.md
    demo_script.md
    pitch.md
    judging_answers.md
```

---

## 28. Environment variables

```text
MONGODB_URI=
MONGODB_DB=runwayops_demo

VOYAGE_API_KEY=
VOYAGE_EMBED_MODEL=voyage-4-lite
VOYAGE_EMBED_DIM=1024

FIREWORKS_API_KEY=
FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1
FIREWORKS_MODEL=

ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_MODEL_ID=eleven_v3

AWS_REGION=eu-west-2
AWS_EVENT_BUS_NAME=runwayops-demo
AWS_S3_BUCKET=runwayops-demo-artifacts
API_GATEWAY_BASE_URL=

LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=runwayops-hackathon

DEMO_MODE=true
DEMO_COMPANY_ID=cmp_marlow_finch
DEMO_CASE_ID=case_payroll_2026_05_08
```

---

## 29. Build order

### Build spine

```text
data → MongoDB → forecast → cockpit → event replanning → briefing/memory
```

Do not start with voice, Open Banking, LangGraph, or UI polish.

### Step 1: data pack

Generate:

```text
fixtures
events
expected outputs
cached fallback audio
```

### Step 2: repo skeleton

Create folder structure and `.env.example`.

### Step 3: MongoDB seed

Build `scripts/seed-demo.ts`.

It should:

```text
clear demo collections
insert fixtures
create indexes
create validators
create time-series collection
print collection counts
```

### Step 4: forecast engine

Build deterministic `lib/forecast.ts`.

Must output:

```text
forecast_v1_baseline
forecast_v2_after_customer_a_reply
forecast_v3_after_harbour_labs_retainer
```

### Step 5: static cockpit UI

Render from MongoDB seeded data.

### Step 6: event ingestion

Build API routes/Lambda to insert:

```text
Customer A reply
Harbour Labs bank transaction
```

### Step 7: orchestrator

Build state machine:

```text
route event
run forecast
run retrieval
draft actions
update payment plan
write audit
generate briefing
write memory
```

### Step 8: MongoDB Atlas Live State panel

Show real collection changes.

### Step 9: ElevenLabs

Generate/cached founder briefing.

### Step 10: polish and rehearse

Reset button, fallback outputs, pitch.

---

## 30. Hour-by-hour hackathon plan

### 9:00–9:20 — Scope lock

```text
Confirm final scenario
Create public repo
Confirm Atlas connection
Confirm AWS credentials
Confirm provider API keys
Assign roles
```

### 9:20–10:00 — Data and MongoDB

```text
Load fixture data
Create indexes
Create validators
Create time-series collection
Check counts
```

### 10:00–10:45 — Forecast engine

```text
Implement deterministic scenarios
Validate maths
Write forecast documents
Update case state
```

### 10:45–11:30 — Cockpit shell

```text
Risk command bar
Event feed
Main case board
Draft panel
Atlas Live State placeholder
```

### 11:30–12:30 — Retrieval

```text
Embed memory chunks
Create vector/search index
Implement customer-memory retrieval
Write retrieval_attempts
```

### 12:30–13:30 — Orchestrator

```text
Event Router
Forecast Agent
Customer Memory Agent
Collections Agent
Payment Run Agent
Audit/Learning Agent
```

### 13:30–14:15 — AWS ingestion

```text
API Gateway/Lambda or Next API route fallback
EventBridge Scheduler/timer bank event
S3 bucket for MP3/artifacts
```

### 14:15–15:00 — Live replanning

```text
Customer reply event
Bank event
Forecast v2→v3
Plan v2→v3
Decision log
UI refresh
```

### 15:00–15:40 — Founder briefing

```text
Generate transcript
Call ElevenLabs
Store MP3 in S3 or cached path
Render audio panel
```

### 15:40–16:20 — MongoDB proof and failure proof

```text
Atlas Live State polish
Audit drawer
Memory card
Next Case Preview
Durable Workflow State panel
Optional pause/resume button
```

### 16:20–16:45 — Reliability

```text
Reset demo button
Cached LLM outputs
Cached MP3
Fallback orchestrator route
Rehearse without internet surprises
```

### 16:45–17:00 — Final rehearsal

```text
30-second pitch
3-minute demo
judge Q&A answers
```

---

## 31. Team roles

### Person 1 — MongoDB / backend

Owns:

```text
schema
indexes
validators
seed script
aggregation queries
Atlas Live State endpoints
```

### Person 2 — Agents / retrieval

Owns:

```text
forecast engine
state machine / LangGraph
Voyage embeddings
Fireworks prompts
retrieval_attempts
agent_runs
```

### Person 3 — Frontend

Owns:

```text
command cockpit
event feed
case board
approval panel
Atlas Live State
audit drawer
memory preview
```

### Person 4 — AWS / voice / pitch

Owns:

```text
API Gateway/Lambda
EventBridge Scheduler/timed event
S3 artifacts
ElevenLabs
demo reset
pitch script
```

---

## 32. MVP definition

### Must have

```text
Seeded MongoDB Atlas dataset
Command cockpit UI
Payroll Risk Case high-risk baseline
Deterministic forecast scenarios
Customer A ambiguous reply event
Timed Harbour Labs bank event
Forecast v1/v2/v3
Payment plan v1/v2/v3
Retrieval attempt visible
Agent run trace visible
Decision log visible
Founder briefing transcript/audio
Memory card + next-case preview
```

### Nice to have

```text
LangSmith trace URL
Pause/resume proof
SES verified demo send
Animated event transitions
Cached fallback toggle
```

### Do not build

```text
Real Open Banking
Real accounting sync
Real payroll API
VAT calculations
Customer C main story
Real email sending as core
Customer voice calls
LiveKit
NVIDIA/NemoClaw
Full multi-tenant auth
```

---

## 33. Fallback plan

### If Atlas Trigger fails

Use:

```text
event_inbox insert + direct orchestrator call
```

Still show `event_inbox` and `agent_runs`.

### If EventBridge Scheduler fails

Use:

```text
local timer calls AWS/Next ingestion endpoint
```

Still call it “simulated live bank feed.”

### If Fireworks fails

Use:

```text
cached structured outputs
template drafts
deterministic classification fallback
```

### If Voyage/vector index fails

Use:

```text
precomputed retrieval_attempts
Atlas Search / keyword fallback
```

### If ElevenLabs fails

Use:

```text
cached MP3
transcript-only fallback
```

### If UI breaks

Use:

```text
MongoDB Atlas collections + local JSON output as proof
```

---

## 34. Legal and ethical boundaries

RunwayOps must include this safety boundary:

```text
RunwayOps does not provide regulated financial advice.
It does not recommend loans, investments, tax positions, or financial products.
It does not move money.
It does not send customer communications without human approval.
It organizes evidence, forecasts operational cash timing, drafts actions, and records decisions.
```

### Safe language

Use:

```text
operational cash timing
payment run recommendation
approval required
cash scenario
supplier hold within written grace terms
draft customer email
```

Avoid:

```text
financial advice
investment advice
loan advice
tax advice
guaranteed payment
autonomous collection
debt collection call
```

---

## 35. Judge challenge answers

### “Is this just an accounting dashboard?”

Answer:

> “No. Accounting dashboards show data. RunwayOps opens a Payroll Risk Case, coordinates work, retrieves evidence, drafts approvals, reacts to events, replans the forecast and payment run, writes an audit log, generates a founder briefing, and stores memory for future cases.”

### “Is this just AI email chasing?”

Answer:

> “No. The email drafts are only one output. The core is event-driven cash-timing coordination: forecast scenarios, supplier timing, approvals, audit, and memory.”

### “Where is MongoDB indispensable?”

Answer:

> “MongoDB is the durable context engine: current case state, event stream, task coordination, retrieval attempts, memory chunks, forecast versions, payment plans, decision logs, artifacts, and checkpoints. Atlas Search and Vector Search retrieve evidence; aggregations compute risk; `event_inbox` wakes the workflow.”

### “Why not Open Banking?”

Answer:

> “The product architecture supports bank feeds, but the hackathon differentiator is event-driven agentic coordination, not OAuth plumbing. We use Open-Banking-style synthetic fixtures and production would connect TrueLayer/Plaid/Xero/QuickBooks later.”

### “Is this financial advice?”

Answer:

> “No. It does not recommend financial products, loans, investments, or tax positions. It does operational cash timing and approval-ready workflow coordination. Humans approve any customer communication or payment timing change.”

### “What is agentic here?”

Answer:

> “The maths is deterministic. The agentic layer interprets events, rewrites retrieval queries, evaluates evidence, classifies ambiguity, drafts actions, replans under uncertainty, writes audit summaries, generates a briefing, and stores memory.”

### “Can it survive failure?”

Answer:

> “Yes. The current case, events, tasks, forecasts, plans, agent runs, retrieval attempts, checkpoints, and decisions are stored in MongoDB. The worker can resume from the latest durable state rather than process memory.”

---

## 36. Final pitch

### 30-second pitch

> “Small businesses do not only fail because they are unprofitable; they fail when cash timing breaks. RunwayOps is Payroll Risk Command for SMEs. Our demo agency has £8,400 in cash and payroll of £11,200 due Friday. A customer reply and a bank transaction land during the demo; MongoDB Atlas wakes the workflow, agents retrieve evidence, the forecast and payment plan replan live, and the founder gets an action briefing with an audit trail. It is not an accounting dashboard. It is an agentic cash-timing command centre.”

### 3-minute narrative

> “This is Marlow & Finch Creative, a 12-person agency. They are not failing. Their cash timing is broken. They have £8,400 today, payroll of £11,200 due Friday, and Supplier X due Thursday.
>
> RunwayOps opens a Payroll Risk Case. The Forecast Agent calculates the gap. The Customer Memory Agent identifies Northstar and Blue Finch as the highest-leverage invoices. Northstar owes £4,800, but their payment behaviour is PO-dependent. Supplier X has a five-day no-penalty grace period.
>
> RunwayOps drafts approval-ready actions: a Northstar confirmation email, a Blue Finch formal reminder, and a Supplier X hold. Nothing is sent and no money moves without human approval.
>
> Now Northstar replies: ‘Should be able to pay Friday once the PO is re-approved.’ That event lands in MongoDB. The workflow wakes, classifies it as a conditional promise, retrieves evidence, and updates the scenarios. It does not mark payroll safe.
>
> A timed bank-feed event lands: Harbour Labs pays a £1,200 retainer. The forecast changes from high risk to watch. Supplier X changes from full delay to conditional hold. The audit drawer explains why.
>
> Finally, RunwayOps generates a founder briefing and writes a memory card: Northstar promises are conditional unless PO confirmation is explicit. MongoDB Atlas is the live state layer: events, tasks, retrieval attempts, agent runs, forecast versions, payment plans, decisions, artifacts, and memory.”

---

## 37. What to say in README

### Project summary

```text
RunwayOps is Payroll Risk Command for SMEs. It coordinates the next 72 hours when cash timing breaks: collections, payment timing, approvals, forecast changes, audit trail, and founder briefing.
```

### Hackathon themes

```text
Primary: Prolonged Coordination
Secondary: Adaptive Retrieval
Supporting: Multi-Agent Collaboration
```

### MongoDB use

```text
MongoDB Atlas stores live case state, event history, tasks, agent runs, retrieval attempts, memory chunks, forecasts, payment plans, audit logs, artifacts, and checkpoints. Atlas Search and Vector Search power hybrid retrieval. Aggregation pipelines compute risk and forecast deltas. event_inbox drives event-based replanning.
```

### AWS use

```text
AWS API Gateway and Lambda ingest simulated external events. EventBridge Scheduler creates the timed bank transaction. S3 stores fixture files and founder briefing audio.
```

### AI use

```text
Fireworks AI performs classification, drafting, audit summary, and memory wording.
Voyage AI creates embeddings and optionally reranks retrieved evidence.
ElevenLabs generates the founder briefing audio.
LangGraph/LangSmith are optional orchestration/trace accelerators.
```

---

## 38. Immediate next steps

### Step 1

Generate the synthetic data pack.

### Step 2

Create repo skeleton and `.env.example`.

### Step 3

Write MongoDB seed script.

### Step 4

Load data into Atlas and verify counts.

### Step 5

Build deterministic forecast engine.

### Step 6

Build static cockpit UI.

### Step 7

Add event ingestion and replanning.

### Step 8

Add retrieval, agent traces, decision log, memory card.

### Step 9

Add founder briefing.

### Step 10

Polish and rehearse.

---

## 39. Final build mantra

```text
Data first.
MongoDB second.
Forecast third.
Cockpit fourth.
Events fifth.
Replanning sixth.
Briefing and memory last.
```

Do not start with voice, Open Banking, or fancy agent frameworks.

---

## 40. References and implementation notes

### User-provided MongoDB study notes

The project’s MongoDB study notes emphasize:

```text
workload-first schema design
bounded embedding
separate collections for unbounded events/tasks/tool calls/chunks
extended references for hot display and audit
schema validation for core workflow state
retrieval_attempts as adaptive retrieval proof
S3 for large artifacts with MongoDB metadata references
```

### External documentation checked during planning

- MongoDB Atlas Database Triggers: https://www.mongodb.com/docs/atlas/atlas-ui/triggers/database-triggers/
- MongoDB Atlas Trigger limitations: https://www.mongodb.com/docs/atlas/atlas-ui/triggers/limitations/
- AWS EventBridge Scheduler with Lambda: https://docs.aws.amazon.com/lambda/latest/dg/with-eventbridge-scheduler.html
- Amazon EventBridge Scheduler: https://docs.aws.amazon.com/eventbridge/latest/userguide/using-eventbridge-scheduler.html
- ElevenLabs quickstart: https://elevenlabs.io/docs/quickstart/
- Voyage AI embeddings: https://docs.voyageai.com/docs/embeddings
- Voyage AI rerankers: https://docs.voyageai.com/docs/reranker
- Fireworks AI structured outputs: https://docs.fireworks.ai/structured-responses/structured-response-formatting
- LangGraph persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- LangSmith observability: https://docs.langchain.com/langsmith/observability-concepts
- TLDRecap MongoDB.local San Francisco finalist recap: https://tldrecap.tech/posts/2026/mongodb-local-sf/agentic-orchestration-hackathon/

---

## 41. Final verdict

Build this version:

```text
RunwayOps: Payroll Risk Command for SMEs

One case.
Two active customers.
One supplier lever.
One ambiguous reply.
One timed bank event.
One live replanning cascade.
One MongoDB Atlas Live State panel.
One founder voice briefing.
One memory card with future-case preview.
```

This is the strongest one-day version because it is:

```text
specific enough to build,
dramatic enough to demo,
safe enough legally,
MongoDB-native enough for judges,
agentic without fake autonomy,
and commercially understandable.
```
