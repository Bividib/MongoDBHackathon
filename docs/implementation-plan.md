# RunwayOps Implementation Plan

## 1. Project Summary

RunwayOps is a hackathon demo product for a small business payroll-risk incident.

The product is not a generic finance dashboard. It is a payroll-risk command centre that opens one durable case, reacts to external events, coordinates specialist workers, recalculates cash timing, prepares approval-ready actions, explains decisions, generates a founder briefing, and writes memory for future cases.

Demo brand:

```text
RunwayOps
Payroll Risk Command for SMEs
```

Demo company:

```text
Marlow & Finch Creative Ltd
12-person design agency
Currency: GBP
Timezone: Europe/London
Demo date: Monday 4 May 2026, 09:00 Europe/London
Payroll deadline: Friday 8 May 2026
```

Primary hackathon track:

```text
Prolonged Coordination
```

Secondary track:

```text
Adaptive Retrieval
```

Supporting theme:

```text
Multi-Agent Collaboration
```

## 2. Build Strategy

Use a fully functional local-first build, then add AWS as a thin visible event layer.

This is the best route for a two-person hackathon team because the demo must remain reliable even if a cloud service, AI provider, scheduler, or network call fails. The core app should work end-to-end with MongoDB Atlas, deterministic math, seeded data, cached outputs, and local Next.js API routes. AWS, Fireworks, and ElevenLabs then enhance the demo rather than becoming single points of failure.

Recommended stack:

```text
Frontend: Next.js, TypeScript, Tailwind CSS
Backend: Next.js API routes, MongoDB Node driver
Workflow: LangGraph.js if fast enough, otherwise a typed TypeScript state machine with the same worker boundaries
Database: MongoDB Atlas replica set cluster
AI: Fireworks for LLM generation/classification
Embeddings/retrieval: Fireworks embeddings or seeded/keyword fallback first; Voyage optional later
Voice: ElevenLabs with cached MP3 fallback
AWS region: eu-west-2
AWS services: API Gateway, Lambda, EventBridge Scheduler, S3, CloudWatch logs optional
```

Important security note:

```text
Do not commit MongoDB, Fireworks, ElevenLabs, or AWS secrets.
Use .env.local for local development and .env.example for placeholders.
Rotate any credentials that were pasted into chat before publishing the repo.
```

## 3. What Must Be Built

The demo must show one thing extremely well:

```text
A small business has payroll at risk because cash timing is broken.
RunwayOps opens a Payroll Risk Case.
It retrieves evidence.
It coordinates specialist workers.
It drafts approval-ready actions.
It reacts to a customer reply and a timed bank transaction.
It replans the forecast and payment plan live.
It explains the decision.
It generates a founder briefing.
It writes memory for future cases.
```

Visible scope:

```text
One case
Two active customers
One supplier lever
One ambiguous customer reply
One timed bank transaction
One live replanning cascade
One MongoDB Atlas Live State panel
One founder voice briefing
One memory card with future-case preview
```

Do not build:

```text
Real Open Banking
Real accounting sync
Real payroll API
VAT calculations
Customer C in main story
Customer voice calls
Autonomous sending or money movement
Full multi-tenant auth
```

## 4. Demo Data Requirements

Yes, we need to create all synthetic data.

The data pack is the first implementation deliverable because every later layer depends on stable identifiers, deterministic outputs, and rehearsable state transitions.

Required folder structure:

```text
data/
  fixtures/
  events/
  expected_outputs/
  cached_audio/
```

Core fixture files:

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

Event files:

```text
01_scheduler_payroll_scan.json
02_customer_a_conditional_reply.json
03_harbour_labs_retainer_posted.json
04_customer_b_no_response_tick.json
05_user_approves_northstar_confirmation.json
06_user_approves_supplier_x_conditional_hold.json
07_customer_a_dispute_backup.json
```

Expected output files:

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

## 5. Demo Entities And Numbers

Cash:

```text
Cash today: £8,400
```

Payroll:

```text
Payroll due Friday: £11,200
Non-deferrable
Human confirmation required
```

Supplier X:

```text
Name: MotionPrint
Amount due Thursday: £2,400
Terms: 5-day no-penalty grace period
Essentiality: non-critical this week
```

Customer A:

```text
Name: Northstar Studio
Invoice: INV-1042
Amount overdue: £4,800
Days overdue: 18
Behaviour: late but responsive; PO-dependent; direct finance-team wording works
```

Customer B:

```text
Name: Blue Finch Ltd
Invoice: INV-1048
Amount overdue: £2,200
Days overdue: 7
Behaviour: ignores friendly reminders; responds to formal finance-team wording with invoice attached
```

Timed bank event:

```text
Harbour Labs retainer posted
Amount: +£1,200
Event type: bank.transaction.posted
```

Manual customer reply:

```text
Northstar Studio:
"Should be able to pay Friday once the PO is re-approved."
```

Classification:

```text
conditional_promise
not guaranteed cash
confidence: 0.48
requires explicit PO/payment confirmation
```

## 6. Deterministic Forecast Rules

Cash arithmetic must be deterministic and tested. Do not ask an LLM to do arithmetic.

Baseline if Supplier X is paid and no invoices land:

```text
£8,400 cash
- £2,400 Supplier X Thursday
- £11,200 payroll Friday
= -£5,200 Friday gap
Risk: HIGH
```

Supplier X held, no customer receipt:

```text
£8,400 cash
- £11,200 payroll
= -£2,800 Friday gap
Risk: HIGH
```

Supplier X held, Customer A pays Friday:

```text
£8,400 cash
+ £4,800 Northstar receipt
- £11,200 payroll
= £2,000 after payroll
Risk: WATCH because the receipt is conditional, not guaranteed
```

After Harbour Labs retainer, Customer A slips:

```text
£9,600 cash
- £11,200 payroll
= -£1,600 Friday gap
Risk: HIGH for slip scenario
```

After Harbour Labs retainer, Customer A pays, Supplier X paid after payroll:

```text
£9,600 cash
+ £4,800 Northstar receipt
- £11,200 payroll
- £2,400 Supplier X after payroll
= £800 remaining
Risk: WATCH overall, not SAFE
```

Required state transitions:

```text
Initial case: HIGH
After ambiguous Northstar reply: still HIGH, with scenario split
After Harbour Labs +£1,200: WATCH, not SAFE
Supplier X recommendation: full delay -> conditional hold
Founder briefing generated
Memory card written
```

## 7. MongoDB Collections

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

MongoDB modelling rules:

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

Trigger strategy:

```text
Use event_inbox as the wakeup collection.
Do not trigger directly on bank_transactions_ts.
Do not trigger directly on forecasts or payment plans.
Use one Atlas Trigger if reliable.
Fallback to direct /api/orchestrate call after event insertion.
```

## 8. Environment Variables

Create `.env.example` with placeholders:

```text
MONGODB_URI=
MONGODB_DB=runwayops_demo

FIREWORKS_API_KEY=
FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1
FIREWORKS_MODEL=
FIREWORKS_EMBED_MODEL=

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

Local-only `.env.local` should contain real secrets.

## 9. Repo Structure

Target structure:

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
        fireworks.ts
        embeddings.ts
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
    implementation-plan.md
```

If building directly in the current folder, the current folder becomes the repo root rather than nesting a second `runwayops/` folder.

## 10. Worker Workflow

Use six named workers. They can be implemented with LangGraph.js or with an explicit TypeScript state machine first.

The important part is not the framework label. The important part is durable coordination through MongoDB documents.

### Event Router

Role:

```text
Classify event type, find case, prevent duplicate processing, create tasks.
```

Writes:

```text
events
tasks
agent_runs
event_inbox.status
```

### Forecast Agent

Role:

```text
Deterministically compute cash scenarios and write forecast version.
```

Writes:

```text
cashflow_forecasts
cases.current_state
events
agent_runs
```

### Customer Memory Agent

Role:

```text
Rewrite query, retrieve evidence, classify ambiguous customer reply.
```

Writes:

```text
retrieval_attempts
events
agent_runs
```

### Collections Agent

Role:

```text
Draft approval-ready customer emails.
```

Writes:

```text
collection_drafts
tasks
agent_runs
```

### Payment Run Agent

Role:

```text
Recommend supplier timing changes under human approval.
```

Writes:

```text
payment_run_plans
tasks
decision_log
agent_runs
```

### Audit / Learning Agent

Role:

```text
Explain why the plan changed, generate founder briefing text, write memory card, create artifact metadata.
```

Writes:

```text
decision_log
founder_briefings
memory_cards
artifacts
events
agent_runs
```

## 11. AI Provider Strategy

Use AI where it creates the agentic behaviour. Do not use AI for arithmetic or database invariants.

Fireworks use cases:

```text
Ambiguous reply classification
Draft customer emails
Audit summary wording
Founder briefing transcript
Memory-card wording
```

Provider fallbacks:

```text
If Fireworks fails, use cached structured outputs and deterministic templates.
If embeddings fail, use keyword/seeded retrieval and still write retrieval_attempts.
If ElevenLabs fails, use cached MP3 or transcript-only briefing.
```

Voyage decision:

```text
Voyage is useful for high-quality embeddings and reranking.
It is not required for the first functional build.
Start with Fireworks embeddings or seeded retrieval.
Add Voyage only if a key is available and the core app is already stable.
```

LangGraph decision:

```text
Use LangGraph.js if it speeds up durable state, checkpointing, and worker orchestration.
If setup slows the team down, implement a typed state machine with the same worker names and MongoDB writes.
The demo story remains valid as long as each worker writes durable state and agent_runs.
```

## 12. API Routes

Local Next.js routes first:

```text
POST /api/events/customer-reply
POST /api/events/bank-transaction
POST /api/events/start-live-feed
POST /api/orchestrate
POST /api/retrieve/customer-memory
POST /api/briefing
```

Expected behaviour:

```text
/api/events/customer-reply inserts 02_customer_a_conditional_reply into event_inbox and runs orchestration.
/api/events/start-live-feed schedules a local 30-45 second timer or calls the AWS path if configured.
/api/events/bank-transaction inserts 03_harbour_labs_retainer_posted into event_inbox and runs orchestration.
/api/orchestrate processes new event_inbox documents idempotently.
/api/briefing generates or returns cached founder briefing transcript/audio.
```

AWS routes later:

```text
API Gateway -> Lambda -> MongoDB event_inbox
EventBridge Scheduler -> Lambda -> MongoDB event_inbox
S3 stores briefing audio and fixture artifacts
```

## 13. UI Requirements

Single-page cockpit, not a marketing page and not a generic dashboard.

Required panels:

```text
Top Risk Command Bar
Event Feed
Main Case Board
Agent Workers
Drafts / Approvals / Briefing
MongoDB Atlas Live State
Audit / Why Drawer
Founder Briefing
Memory Card + Next Case Preview
```

Top command bar must show:

```text
Payroll Risk Case
Status: HIGH / WATCH
Cash today: £8,400 -> £9,600
Payroll due: £11,200 Friday
Projected gap
Time to payroll
Approvals pending
Plan version
```

Event feed must show:

```text
scheduler.payroll_scan
case.opened
forecast.v1_created
drafts.created
payment_plan.v1_created
email.received
atlas_trigger.fired or fallback_poller.detected
reply.classified
forecast.v2_created
bank.transaction.posted
forecast.v3_created
payment_plan.v3_created
briefing.generated
memory_card.written
```

MongoDB Atlas Live State must show:

```text
Collection
Latest document ID
Change
Why it matters
Timestamp
```

## 14. Build Phases And Acceptance Criteria

### Phase 1: Project Skeleton

Tasks:

```text
Create Next.js TypeScript app.
Add Tailwind.
Add package scripts.
Add .env.example.
Create data, db, scripts, infra, and docs folders.
```

Acceptance:

```text
npm install succeeds.
npm run dev starts the app.
Landing route renders a placeholder cockpit.
No secrets are committed.
```

### Phase 2: Synthetic Data Pack

Tasks:

```text
Create all fixture JSON files.
Use stable IDs from the spec.
Create event files.
Create expected output files.
```

Acceptance:

```text
All fixtures load as valid JSON.
Expected forecast numbers match the deterministic cash rules.
```

### Phase 3: MongoDB Foundation

Tasks:

```text
Implement lib/mongodb.ts.
Implement collection creation.
Implement indexes.
Implement schema validators.
Implement seed-demo.ts.
Implement reset-demo.ts.
```

Acceptance:

```text
npm run seed loads demo data into Atlas.
Seed script prints collection counts.
Unique event_key index prevents duplicate event processing.
bank_transactions_ts exists as a time-series collection.
```

### Phase 4: Forecast Engine

Tasks:

```text
Implement lib/forecast.ts.
Implement forecast versions v1, v2, v3.
Implement payment recommendation logic.
Implement scripts/check-maths.ts.
```

Acceptance:

```text
npm run check-maths passes.
No LLM calls are used for arithmetic.
```

### Phase 5: Static Cockpit

Tasks:

```text
Build cockpit layout.
Render seeded baseline case.
Render forecast scenarios.
Render draft approvals.
Render live state counts from MongoDB.
```

Acceptance:

```text
The baseline demo view shows HIGH risk, £8,400 cash, £11,200 payroll, and £5,200 gap.
The UI is stage-readable in one browser window.
```

### Phase 6: Event Ingestion

Tasks:

```text
Implement customer reply API route.
Implement bank transaction API route.
Implement start-live-feed route with local timer fallback.
```

Acceptance:

```text
Clicking Simulate Customer A Reply inserts event_inbox +1.
Clicking Start Live Bank Feed causes Harbour Labs event after 30-45 seconds.
Event keys are idempotent.
```

### Phase 7: Orchestrator

Tasks:

```text
Implement event processing.
Implement worker run records.
Update forecasts and payment plans.
Write decision logs.
Write memory card.
Write founder briefing transcript.
```

Acceptance:

```text
Customer reply creates forecast v2 and leaves risk HIGH.
Bank event creates forecast v3 and moves risk HIGH -> WATCH.
agent_runs, events, retrieval_attempts, decision_log, founder_briefings, and memory_cards are written.
```

### Phase 8: Fireworks Integration

Tasks:

```text
Add structured classification call.
Add draft generation call.
Add audit and briefing wording call.
Add cached fallback outputs.
```

Acceptance:

```text
The system works with FIREWORKS_API_KEY present.
The system still works with FIREWORKS_API_KEY absent in demo fallback mode.
```

### Phase 9: ElevenLabs Integration

Tasks:

```text
Add tts.ts.
Generate founder briefing audio.
Cache MP3 in data/cached_audio.
Optionally upload to S3.
```

Acceptance:

```text
Founder briefing panel shows transcript and playable audio or cached fallback.
The app still works transcript-only.
```

### Phase 10: AWS Visible Layer

Tasks:

```text
Create Lambda event ingestion handler.
Create API Gateway route.
Create EventBridge Scheduler for bank event.
Create S3 bucket reference for audio/artifacts.
Keep local routes as fallback.
```

Acceptance:

```text
AWS can insert events into event_inbox.
Local demo path remains available.
AWS region is eu-west-2.
```

### Phase 11: Polish And Rehearsal

Tasks:

```text
Add reset demo button or script.
Improve event transitions.
Finalize README.
Finalize demo script.
Finalize judging answers.
Run through 3-minute demo multiple times.
```

Acceptance:

```text
Demo can be reset in under 30 seconds.
The full story can be delivered in 3 minutes.
All fallback modes are rehearsed.
```

## 15. Two-Person Parallel Workflow

### Person 1: Backend, MongoDB, Agents

Owns:

```text
Data fixtures
MongoDB seed/reset
Indexes and validators
Forecast engine
Event API routes
Orchestrator
Fireworks integration
Live state query endpoint
AWS Lambda/EventBridge after local flow works
```

First deliverables:

```text
data/ fixtures and events
scripts/seed-demo.ts
lib/forecast.ts
/api/events/customer-reply
/api/events/bank-transaction
/api/orchestrate
```

### Person 2: Frontend, Demo, Voice

Owns:

```text
Cockpit UI
Event feed
Case board
Agent worker panel
Draft approval panel
MongoDB Atlas Live State panel
Audit drawer
Founder briefing panel
Memory card preview
ElevenLabs audio integration
README, pitch, demo script
```

First deliverables:

```text
app/page.tsx
components/RiskCommandBar.tsx
components/EventFeed.tsx
components/CaseBoard.tsx
components/MongoAtlasLiveState.tsx
components/DraftApprovalPanel.tsx
components/FounderBriefing.tsx
```

Integration contract:

```text
Frontend reads normalized DTOs from API routes.
Backend owns raw MongoDB schemas.
Both sides agree on stable TypeScript types in lib/types.ts.
Use seeded/cached API responses until backend routes are ready.
```

## 16. Suggested Day Plan

### 9:00-9:30

```text
Scope lock.
Create repo skeleton.
Add .env.example.
Add placeholder UI.
```

### 9:30-10:30

```text
Create fixtures and expected outputs.
Build seed script.
Build forecast engine.
```

### 10:30-11:30

```text
Seed Atlas.
Render baseline cockpit from MongoDB.
Verify forecast v1.
```

### 11:30-12:30

```text
Implement customer reply event.
Implement forecast v2.
Implement retrieval_attempts proof.
```

### 12:30-13:30

```text
Implement bank event.
Implement forecast v3.
Implement payment plan update.
Implement live state panel counts.
```

### 13:30-14:30

```text
Implement Fireworks calls or cached fallbacks.
Implement drafts, audit summary, memory card.
```

### 14:30-15:15

```text
Implement ElevenLabs/cached briefing audio.
Polish cockpit state transitions.
```

### 15:15-16:00

```text
Add AWS ingress/scheduler if the local app is stable.
Otherwise keep AWS code documented and use local timer fallback.
```

### 16:00-16:40

```text
Finalize README, architecture doc, pitch, and judging answers.
Run reset/rehearsal loop.
```

### 16:40-17:00

```text
Stop building.
Rehearse demo only.
Use the most reliable path.
```

## 17. Demo Script State Checkpoints

Initial baseline:

```text
Risk: HIGH
Cash: £8,400
Payroll: £11,200
Projected gap: £5,200
Plan: v1
```

After Northstar reply:

```text
Risk: HIGH
Classification: conditional_promise
Guaranteed cash: no
Confidence: 0.48
Forecast: v2
Action: ask for explicit PO/payment confirmation
```

After Harbour Labs bank event:

```text
Cash: £9,600
Risk: WATCH
Forecast: v3
Payment plan: v3
Supplier X: full delay -> conditional hold
Founder briefing: generated
Memory card: written
```

## 18. Reliability Rules

The demo should never depend on a single live external service.

Rules:

```text
Seeded data must be enough to render the baseline.
Expected outputs must be enough to render the full story.
MongoDB should be the main live dependency.
Fireworks must have cached fallbacks.
ElevenLabs must have cached MP3 or transcript fallback.
AWS must have local route fallback.
Reset script must restore the demo quickly.
```

## 19. Definition Of Done

The build is demo-ready when:

```text
npm run seed works.
npm run check-maths works.
npm run dev starts the cockpit.
Baseline case renders from MongoDB.
Simulate Customer A Reply updates MongoDB and UI.
Start Live Bank Feed triggers the Harbour Labs event.
Forecast v3 moves risk HIGH -> WATCH.
MongoDB Atlas Live State panel shows collection changes.
Drafts remain pending human approval.
Audit drawer explains why risk is not SAFE.
Founder briefing transcript/audio appears.
Memory card and Next Case Preview appear.
README explains MongoDB, AWS, AI, and hackathon themes.
The full demo can be rehearsed in 3 minutes.
```

