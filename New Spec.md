# RunwayOps Production Master Spec

**Version:** v1.0 production-direction master spec  
**Date:** 2026-05-04  
**Status:** Strategic and technical blueprint  
**Product:** RunwayOps  
**Working category:** Cash-aware receivables operations for SMEs  
**Long-term category:** Agentic cash operations for SMEs  
**Primary market:** UK B2B SMEs using Xero / QuickBooks, with global expansion path  
**Core thesis:** RunwayOps tells SMEs who to chase, what to say, what cash to trust, and whether critical payments are safe.

---

## 0. Executive decision

RunwayOps should not become a broad “AI CFO suite” from day one. That category is crowded, hard to define, hard to sell, and immediately competes with enterprise and platform incumbents.

The correct production direction is:

> **Cash-aware receivables operations for SMEs, powered by promise-to-pay confidence and critical-obligation awareness.**

The first customer-facing product should be:

> **A Cash-Aware Collections Action Queue that tells finance teams who to chase today, what to say, how reliable each promise-to-pay is, and whether payroll, tax, rent, loans, or key supplier payments are safe.**

The first technical primitive should be:

> **A Promise-to-Pay Confidence Engine that detects, classifies, scores, monitors, and learns from customer payment promises.**

The production architecture should be:

> **Postgres as the primary source of truth, Temporal as the durable workflow engine, LangGraph/LangChain only for bounded agent reasoning, a deterministic cash engine for all financial calculations, read-only open banking initially, and human approval before any external action.**

MongoDB should not be assumed just because the hackathon demo used it. The hackathon architecture used MongoDB Atlas effectively as a live state/context engine, but from first principles, production RunwayOps is more financial-workflow-centric than document-store-centric. MongoDB remains a viable option or future retrieval sidecar, but the recommended production foundation is Postgres + Temporal.

---

## 1. Background and evolution from hackathon to product

### 1.1 Hackathon version

The hackathon demo, RunwayOps: Payroll Risk Command for SMEs, was intentionally narrow:

- one small business;
- one payroll-risk case;
- two active customers;
- one supplier lever;
- one ambiguous customer reply;
- one timed bank transaction;
- one live replanning cascade;
- one live-state panel;
- one founder briefing;
- one memory card.

It proved the core idea:

```text
Payroll Risk Case opens
→ evidence is retrieved
→ specialist workers coordinate
→ approval-ready actions are drafted
→ a customer reply arrives
→ a bank event arrives
→ forecast and payment plan replan
→ audit trail explains why
→ memory is written for the next case
```

That demo used MongoDB Atlas heavily because the hackathon required MongoDB Atlas Sandbox + AWS to be used visibly and credibly. MongoDB stored live case state, event stream, agent traces, retrieval attempts, forecast versions, payment plans, audit logs, generated artifacts, and memory cards.

### 1.2 Production version

The production product should broaden the problem from “payroll crisis command” to daily SME cash operations.

The production product is not only for crisis moments. It should support normal finance operations:

- Which customer should we contact next?
- Which invoice is most collectable?
- Which promise-to-pay is reliable?
- What should we say?
- Should outreach be email, SMS, phone task, escalation, or payment plan?
- What cash is expected, with what confidence?
- What bank events have actually landed?
- Which obligations are at risk?
- What needs approval?
- What evidence supports the recommendation?
- What did the system learn from prior outcomes?

### 1.3 Key conceptual upgrade

The hackathon object was:

> **Payroll Risk Case**

The production object is:

> **Cash Action Loop**

The crisis case remains as a mode, but the daily action loop becomes the core product.

---

## 2. Market and competitive positioning

### 2.1 Market reality

The market is crowded but fragmented. Competitors already cover parts of:

- AR automation;
- O2C / invoice-to-cash;
- cash application;
- cash-flow forecasting;
- AP automation;
- spend management;
- treasury;
- accounting;
- payment portals;
- AI drafting;
- payment matching;
- collections sequencing;
- workflow automation;
- agentic finance claims.

RunwayOps should **not** claim that competitors only analyse while RunwayOps executes. That is no longer accurate.

Many competitors already execute bounded workflows:

- reminders;
- payment links;
- payment portals;
- direct debit / autopay;
- cash matching;
- ERP writeback;
- collections sequencing;
- inbox triage;
- promise/dispute categorisation;
- AI-drafted replies;
- approval recommendations;
- AP coding;
- payment release workflows;
- AI-agent marketing around finance operations.

### 2.2 Competitive categories

| Category | Examples | What they do | RunwayOps implication |
|---|---|---|---|
| Enterprise O2C | Sidetrade, HighRadius, Billtrust, Versapay, BlackLine, Quadient | O2C, collections, cash application, credit, disputes, AI workflows | Do not compete on breadth. |
| Treasury / liquidity | Kyriba, Agicap | Bank connectivity, forecasting, payments, cash visibility | Avoid “treasury” as SME headline. |
| SME accounting | Xero, QuickBooks | Ledger, invoices, bills, reminders, basic cash views | Integrate deeply; do not replace. |
| AR point solutions | Chaser, Upflow, Gaviti, Invoiced, Kolleno, Paidnice | Invoice chasing, reminders, portals, payments | Closest tactical competitors. |
| AP/spend platforms | Ramp, BILL, Centime | AP, cards, spend, approvals, banking | Avoid drifting too early into AP/spend. |
| Cash forecasting | Float, Agicap, Xero, QuickBooks | Forecasts, scenarios, runway views | Forecasting alone is not enough. |

### 2.3 Closest competitors

**Closest tactical SME competitors:**

- Chaser;
- Upflow;
- Paidnice;
- Gaviti;
- Kolleno.

**Closest strategic cash-ops competitors:**

- Agicap;
- Centime.

**Closest enterprise agentic proof-points:**

- Sidetrade;
- HighRadius;
- Billtrust;
- BlackLine.

### 2.4 Real market gap

The gap is not “AI collections.” The gap is:

> **A lightweight SME product that joins expected cash, collections action, promise reliability, bank events, upcoming obligations, approvals, and memory into one daily operating loop.**

Most tools optimise one part of the workflow:

- AR tools optimise chasing.
- Forecasting tools optimise visibility.
- Accounting tools optimise records.
- Spend/AP tools optimise outgoing payments.
- Treasury tools optimise enterprise liquidity.

RunwayOps should optimise the joined decision:

> **Given who owes us money, who usually pays, what they just said, what cash has actually landed, and what obligations are coming up — what should we do today?**

---

## 3. Product positioning

### 3.1 Recommended positioning

Primary:

> **Cash-aware receivables operations for SMEs.**

Alternative external phrasing:

> **RunwayOps helps SMEs collect cash faster, trust promises-to-pay, and protect critical obligations.**

Homepage sentence:

> **RunwayOps tells SMEs who to chase, what to say, what cash to trust, and whether payroll, tax, rent, loans, or supplier payments are safe.**

### 3.2 What RunwayOps is

RunwayOps is:

- a daily cash-action layer;
- a receivables-first operating system;
- a promise-to-pay confidence engine;
- a critical-obligation risk monitor;
- an approval-gated communications assistant;
- an evidence-based recommendation system;
- a memory layer for customer payment behaviour.

### 3.3 What RunwayOps is not

RunwayOps is not:

- generic AI CFO;
- AI accountant;
- ledger replacement;
- cash-flow dashboard only;
- invoice chaser only;
- debt collection agency;
- treasury management system;
- AP automation suite;
- payment processor;
- lender;
- tax advisor;
- legal collections engine;
- autonomous outbound voice collector.

### 3.4 Category discipline

Do not pitch:

> “We automate AR, AP, treasury, forecasting and accounting.”

Pitch:

> **“We use signals from AR, AP, bank, email and accounting to recommend today’s most important cash actions.”**

---

## 4. Product thesis

### 4.1 Core product thesis

RunwayOps exists because many SMEs are not failing economically; they are failing operationally when cash timing breaks.

The painful workflow is:

> “We have cash in the bank, overdue invoices, customer replies, supplier bills, payroll, tax, rent, and payment obligations scattered across systems. What should we do today to stay safe?”

### 4.2 Core insight

> **A promise is not cash.**

A customer saying:

> “We should be able to pay Friday once the PO is re-approved.”

is not guaranteed cash. It is a conditional promise that must affect expected cash confidence, not simply inflate the forecast.

### 4.3 Core loop

```text
Observe event
→ classify event
→ retrieve memory
→ compute deterministic cash impact
→ rank possible actions
→ generate recommendation
→ request human approval
→ execute approved action
→ observe outcome
→ update memory
→ improve future recommendations
```

### 4.4 Core daily question

Every day, RunwayOps should answer:

> **What are the five cash actions that matter most today, and why?**

---

## 5. MVP definition

### 5.1 Recommended MVP

The MVP should be:

> **Cash-Aware Collections Action Queue powered by Promise-to-Pay Confidence.**

### 5.2 MVP user

Primary MVP user:

- founder;
- owner-operator;
- finance manager;
- bookkeeper;
- fractional CFO;
- operations lead;
- small internal finance team.

Target company:

- UK B2B SME;
- 10–200 employees;
- uses Xero initially;
- sends recurring B2B invoices;
- has meaningful overdue AR;
- has payroll/tax/rent/supplier obligations;
- communicates with customers over email;
- has bank feeds or open banking access.

### 5.3 MVP must do

The MVP should:

- connect to Xero first;
- later connect to QuickBooks;
- connect to read-only bank data;
- connect to Gmail or Outlook read-only;
- import invoices, customers, payment history and bills;
- allow manual entry of payroll, tax, rent, loan and critical supplier obligations;
- rank customers and invoices by collectability and cash impact;
- identify which customer should be contacted next;
- draft the message;
- classify customer replies;
- distinguish firm promises from conditional promises;
- update expected cash confidence;
- alert if critical obligations are at risk;
- keep an audit trail;
- require human approval before external communication.

### 5.4 MVP should not do

Do not build early:

- full cash application;
- full AP automation;
- autonomous payment initiation;
- autonomous supplier negotiation;
- autonomous AI voice calls;
- SAP/Oracle enterprise integrations;
- broad CFO-suite features;
- invoice financing;
- complex dispute-management workflows;
- generic dashboards without action;
- tax advice;
- legal debt collection;
- automatic aggressive escalation.

---

## 6. Product modules

### 6.1 Module 1 — Daily Cash Action Queue

Purpose:

> Every morning, show the few actions that most improve near-term cash safety.

Inputs:

- invoices;
- customers;
- payment history;
- bank transactions;
- customer communications;
- promises-to-pay;
- bills;
- critical obligations;
- company policy.

Outputs:

- ranked customer/invoice actions;
- recommended channel;
- recommended tone;
- message draft;
- cash impact estimate;
- evidence panel;
- approval request.

### 6.2 Module 2 — Promise-to-Pay Confidence

Purpose:

> Convert ambiguous customer promises into confidence-weighted expected cash.

Tracks:

- who promised;
- how much;
- by what date;
- whether promise was firm, conditional, vague, partial, disputed, or cannot-pay;
- condition text;
- confidence at creation;
- whether cash actually landed;
- whether amount matched;
- whether payment was late;
- how this changes customer reliability.

### 6.3 Module 3 — Cash Confidence Forecast

Purpose:

> Show near-term cash with confidence, not just naive expected inflows.

Forecast horizons:

- 7 days;
- 14 days;
- 30 days;
- 90 days later.

Outputs:

- actual cash;
- expected cash;
- confidence-adjusted cash;
- obligations due;
- risk status;
- scenarios;
- shortfall amount;
- action-sensitive forecast delta.

### 6.4 Module 4 — Critical-Obligation Case Mode

Purpose:

> Open a case when payroll, tax, rent, loan, contractor or key supplier payment is at risk.

Workflow:

```text
obligation risk detected
→ case opened
→ top collectable invoices identified
→ customer memory retrieved
→ supplier timing options reviewed
→ drafts prepared
→ approvals routed
→ bank/accounting events monitored
→ case closed or escalated
→ memory updated
```

### 6.5 Module 5 — Supplier Timing Assistant

Later-stage module.

Purpose:

> Recommend safe supplier timing actions only when supported by terms, relationship history and human approval.

Initial scope:

- read supplier bills;
- detect due dates;
- retrieve terms;
- identify grace periods;
- assess relationship risk;
- draft message for approval.

Do not initiate supplier payments or automatically delay payments.

---

## 7. Agentic design

### 7.1 What is deterministic

The following must be deterministic:

- cash arithmetic;
- invoice due-date calculations;
- bill due-date calculations;
- obligation windows;
- risk thresholds;
- scenario totals;
- forecast versioning;
- idempotency;
- permission checks;
- approval rules;
- monetary rounding;
- source-of-truth state transitions.

### 7.2 What is agentic

The following can use AI/agent reasoning:

- event classification;
- customer reply interpretation;
- promise extraction;
- conditionality detection;
- query rewriting;
- adaptive retrieval;
- evidence sufficiency judgement;
- customer-specific drafting;
- channel/tone suggestions;
- action explanation;
- audit summary;
- memory-card wording;
- next-case preview;
- human approval routing recommendations.

### 7.3 Agentic boundary

The AI may recommend.

The AI may not directly:

- send external messages;
- initiate payments;
- delay suppliers;
- mark payroll safe;
- write ledger entries;
- change payment terms;
- threaten legal action;
- delete data;
- override policies;
- decide access permissions.

### 7.4 Recommended bounded agents/services

Use bounded services, not an unstructured swarm.

```text
Event Classifier
Customer Memory Retriever
Promise-to-Pay Classifier
Cash Engine
Next-Best-Action Ranker
Message Drafting Agent
Approval Manager
Outcome Monitor
Memory Learner
Audit Writer
```

### 7.5 Agentic example

Customer says:

> “We should be able to pay Friday once the PO is re-approved.”

The system should:

1. classify as conditional promise;
2. extract promised date: Friday;
3. extract condition: PO re-approval;
4. retrieve previous PO-dependent behaviour;
5. reduce expected-cash confidence;
6. avoid marking payroll safe;
7. draft a confirmation request;
8. ask for partial payment if cash risk is high;
9. require approval;
10. monitor bank/accounting outcomes;
11. update memory once payment does or does not land.

---

## 8. Production architecture decision

### 8.1 First-principles architecture answer

Recommended production architecture:

```text
Primary source of truth: Postgres / Aurora Postgres
Workflow durability: Temporal Cloud
AI reasoning: LangGraph/LangChain inside bounded Temporal activities
Search/vector: pgvector first; OpenSearch or specialized vector DB later if required
Event ingestion: SQS / EventBridge / transactional outbox
Object storage: S3
Frontend: Next.js + TypeScript
Backend: TypeScript service
Integrations: Xero first, QuickBooks second, UK open banking, Gmail/Outlook read-only
AI: provider-abstracted model router with structured outputs
Observability: OpenTelemetry + Sentry/Datadog/CloudWatch + Langfuse/LangSmith
```

### 8.2 Why not MongoDB as default production core?

MongoDB was excellent for the hackathon because the demo needed one visible flexible store for:

- live case state;
- event stream;
- agent traces;
- retrieval attempts;
- forecast versions;
- payment plans;
- audit logs;
- memory cards;
- Atlas Search;
- Atlas Vector Search.

But the production system’s hardest invariants are:

- financial correctness;
- relational consistency;
- auditability;
- tenant isolation;
- reporting;
- approvals;
- joins across invoices, payments, customers, promises and bank transactions;
- reproducible workflow state;
- long-running case execution.

Postgres is a better primary source of truth for these requirements.

### 8.3 When MongoDB could still be used

Use MongoDB if:

- a MongoDB partnership or credits become strategically useful;
- Atlas Search/Vector Search proves materially better for retrieval;
- the product becomes much more document-memory-heavy than financial-workflow-heavy;
- the team is materially faster in MongoDB;
- MongoDB is used as a separate memory/context sidecar rather than the financial source of truth.

### 8.4 Do not use database triggers as the workflow brain

Database triggers are useful for simple wakeups and derived updates. They are not ideal for multi-day workflows involving:

- approvals;
- retries;
- payment waiting;
- promise due dates;
- bank events;
- stale-case escalation;
- crash recovery;
- long-running case history.

Temporal is the correct layer for those.

---

## 9. Architecture diagram

```text
External Systems
Xero / QuickBooks / Bank / Gmail / Outlook / Stripe / GoCardless
        ↓
Connector Layer
OAuth, webhooks, polling, rate limits, token refresh, raw source capture
        ↓
Event Ingestion
SQS / EventBridge / webhook buffer / idempotency / dead-letter queues
        ↓
Application API
TypeScript service, validation, tenant checks, command handlers
        ↓
Transactional Outbox + Domain Events
        ↓
Temporal Workflows
Daily cash action cycles, promise monitoring, critical-obligation cases
        ↓
Activities
Sync data, compute cash, retrieve memory, classify reply, draft message, write audit
        ↓
Postgres Source of Truth
Canonical facts, promises, actions, approvals, forecasts, audit, memory
        ↓
AI Reasoning Layer
Model router, LangGraph subflows, structured outputs, evidence-bound responses
        ↓
Human Approval Layer
Approve, reject, edit, escalate, send, defer
        ↓
External Action Layer
Create draft, send approved email, create task, include payment link, update CRM/accounting if permitted
        ↓
Outcome Monitoring
Bank event, accounting payment, customer reply, promise due-date expiry
        ↓
Memory Update
Customer reliability, tone/channel effectiveness, promise outcome, next-case learning
```

---

## 10. Recommended tech stack

### 10.1 Frontend

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
Recharts or Visx
Playwright for E2E tests
```

Primary screens:

- Daily Cash Actions;
- Collections Queue;
- Promise Board;
- Cash Confidence Forecast;
- Critical Obligation Cases;
- Customer Memory;
- Approval Inbox;
- Audit Drawer;
- Integration Health;
- Admin / Policy Controls.

### 10.2 Backend

```text
TypeScript
Fastify or NestJS
Zod for schema validation
Drizzle or Prisma for database access
Temporal TypeScript SDK
OpenAPI generation
```

Preferred backend direction:

- **Fastify + Drizzle** for explicitness and performance;
- **NestJS + Prisma** if the team prefers opinionated structure;
- avoid overusing Next.js API routes for long-running integration and workflow logic.

### 10.3 Database

```text
Aurora Postgres or RDS Postgres for production
Neon or Supabase Postgres for development if useful
pgvector for embeddings
JSONB for provider payloads and flexible evidence
Postgres full-text search initially
```

### 10.4 Workflow engine

```text
Temporal Cloud
```

Use for:

- daily scheduled runs;
- critical-obligation cases;
- promise due-date monitoring;
- approval waits;
- retries;
- stale workflows;
- event signals;
- long-running state.

### 10.5 Event infrastructure

```text
SQS
EventBridge
Transactional outbox pattern
Dead-letter queues
```

### 10.6 Object storage

```text
S3
```

Store:

- raw email attachments;
- PDFs;
- exports;
- generated reports;
- raw provider payload snapshots if large;
- audio artifacts only if voice briefing is later reintroduced.

### 10.7 AI stack

```text
Model router abstraction
OpenAI / Anthropic / Fireworks or similar providers
Structured outputs only
LangGraph for bounded reasoning subflows
Langfuse or LangSmith for traces/evals
pgvector for embeddings initially
```

Do not hardcode one model provider.

### 10.8 Observability

```text
OpenTelemetry
Sentry
Datadog or CloudWatch
Temporal UI
Langfuse or LangSmith
```

Track:

- sync latency;
- webhook failures;
- queue depth;
- Temporal workflow failures;
- model cost;
- classification accuracy;
- approval rates;
- promise outcomes;
- forecast error;
- customer action effectiveness.

### 10.9 Authentication and authorization

```text
WorkOS or Clerk
```

For SME/self-serve, Clerk is quick. For B2B and future enterprise, WorkOS gives stronger SSO and directory-sync posture.

Authorization:

- tenant isolation at application layer;
- optional Postgres row-level security;
- role-based access;
- least privilege;
- approval permissions;
- audit logs for admin access.

### 10.10 Secrets

```text
AWS Secrets Manager or Doppler
```

Store:

- OAuth client secrets;
- integration refresh tokens;
- model API keys;
- webhook signing secrets;
- open banking credentials;
- database credentials.

---

## 11. Data architecture

### 11.1 Core data principles

1. Store canonical financial facts relationally.
2. Store raw provider payloads for traceability.
3. Every external event gets an idempotency key.
4. Every recommendation references evidence.
5. Every external action requires approval at first.
6. Every forecast is versioned.
7. Every model output is schema-validated.
8. Every promise-to-pay is a first-class object.
9. Every outcome updates memory.
10. No LLM output is executable until validated.

### 11.2 Core financial tables

```text
companies
users
memberships
roles
permissions

customers
customer_contacts
suppliers
supplier_contacts

invoices
invoice_line_items
payments
credit_notes
supplier_bills
bank_accounts
bank_transactions
critical_obligations
```

### 11.3 Communication and memory tables

```text
communication_threads
communication_messages
message_participants
promise_to_pay_records
customer_payment_stats
customer_memory_cards
evidence_chunks
evidence_embeddings
```

### 11.4 Workflow tables

```text
cash_action_cases
case_events
collection_actions
message_drafts
approval_requests
approval_decisions
cash_forecasts
forecast_scenarios
recommendations
agent_runs
retrieval_attempts
audit_events
```

### 11.5 Integration tables

```text
integration_connections
integration_tokens
source_objects
sync_jobs
sync_cursors
webhook_events
idempotency_keys
```

### 11.6 Promise-to-pay object

```ts
type PromiseToPay = {
  id: string;
  companyId: string;
  customerId: string;
  invoiceId?: string;
  sourceMessageId?: string;

  amountPromised?: Money;
  promisedDate?: Date;

  promiseType:
    | "firm"
    | "conditional"
    | "vague"
    | "partial"
    | "disputed"
    | "cannot_pay"
    | "already_paid_claim";

  conditionText?: string;
  extractedText: string;

  confidenceAtCreation: number;
  evidenceRefs: EvidenceRef[];

  outcome:
    | "pending"
    | "kept"
    | "partially_kept"
    | "late"
    | "broken"
    | "superseded"
    | "disputed";

  actualPaymentDate?: Date;
  actualAmountReceived?: Money;

  createdBy: "ai" | "human";
  approvedByUserId?: string;
};
```

---

## 12. Cash engine

### 12.1 Principle

The cash engine must be deterministic. It should be a standalone package.

```text
/packages/cash-engine
```

The LLM may explain a forecast. It must not calculate the forecast.

### 12.2 Responsibilities

The cash engine calculates:

- actual cash;
- expected inflows;
- confidence-weighted expected inflows;
- bill outflows;
- critical obligations;
- scenario forecasts;
- shortfalls;
- risk states;
- action impact;
- forecast deltas;
- obligation risk.

### 12.3 Money handling

Use decimal-safe arithmetic. Do not use JavaScript floating point for money.

Recommended:

```text
decimal.js
Dinero.js
custom Money value object with integer minor units
```

### 12.4 Forecast output

```ts
type CashForecast = {
  forecastId: string;
  companyId: string;
  generatedAt: Date;
  triggerEventIds: string[];

  cashBalance: Money;
  riskStatus: "safe" | "watch" | "high" | "critical";

  scenarios: ForecastScenario[];
  confidenceBands: ConfidenceBand[];

  shortfallAmount?: Money;
  obligationRisks: ObligationRisk[];

  evidenceRefs: EvidenceRef[];
};
```

### 12.5 Risk statuses

```text
SAFE     = obligations covered by actual + high-confidence expected cash
WATCH    = obligations likely covered but dependent on conditional/medium-confidence cash
HIGH     = material shortfall unless one or more actions succeed
CRITICAL = unavoidable shortfall without immediate intervention
```

---

## 13. Next-best-action ranking

### 13.1 Ranking formula v1

Use interpretable scoring first.

```text
priority_score =
  expected_cash_impact
  × probability_of_payment
  × obligation_urgency
  × action_effectiveness
  × evidence_confidence
  - relationship_risk_penalty
  - action_effort_penalty
```

Where:

```text
expected_cash_impact = min(invoice_amount, near_term_cash_shortfall)
```

This prevents the system from blindly chasing the largest invoice.

### 13.2 Input features

- invoice amount;
- days overdue;
- customer payment history;
- prior promise reliability;
- reply status;
- open disputes;
- customer relationship tier;
- best channel;
- best contact;
- last action date;
- bank/payment history;
- upcoming obligation risk;
- evidence sufficiency;
- action effort;
- relationship risk.

### 13.3 Later ML layer

Once enough data exists, train calibrated models for:

- probability of payment after action;
- probability of promise kept;
- probability of dispute;
- expected days to cash;
- channel effectiveness;
- tone effectiveness.

Start with logistic regression / gradient-boosted trees before deep learning. Interpretability matters.

---

## 14. Memory system

### 14.1 Why memory matters

RunwayOps becomes defensible only if it learns from outcomes.

The system should not merely say:

> “Invoice is overdue; send reminder.”

It should say:

> “Northstar usually pays after direct finance-team wording, but PO-dependent promises are only 42% reliable, so classify this as conditional, request explicit confirmation, and do not mark payroll safe.”

### 14.2 Memory type 1 — structured behavioural memory

Stored as queryable facts:

```text
average_days_late
median_days_late
promise_count
promises_kept
promises_broken
conditional_promise_kept_rate
partial_payment_rate
dispute_rate
response_time_by_channel
payment_after_email_rate
payment_after_sms_rate
payment_after_call_task_rate
founder_escalation_success_rate
```

### 14.3 Memory type 2 — semantic evidence memory

Stored as text chunks + embeddings:

```text
Customer only pays after PO approval.
Finance contact prefers invoice PDF attached.
Formal tone worked better than friendly reminder.
Customer often says “should be able to” before delaying.
Supplier has 5-day grace period.
```

Use pgvector initially. Move to OpenSearch / Qdrant / Pinecone / MongoDB Atlas Vector Search only if needed.

### 14.4 Memory type 3 — policy memory

Company-specific policies:

```text
never SMS strategic customers
founder approval required for customers over £20k
never mention legal escalation without CFO approval
supplier X may be delayed 5 days
customer Y should be contacted through account manager
```

### 14.5 Outcome learning

After every action, record:

- did the customer reply?
- did payment land?
- did amount match?
- was it on time?
- was promise firm or conditional?
- did tone/channel work?
- did escalation help?
- did action reduce risk?
- was forecast confidence too high or too low?

---

## 15. Integration architecture

### 15.1 Connector principles

Every connector should follow a common lifecycle:

```text
connect
authenticate
sync initial data
store raw source object
normalize into canonical model
deduplicate
emit domain events
monitor sync health
refresh tokens
handle rate limits
reconcile changes
```

### 15.2 Source object pattern

```ts
type SourceObject = {
  id: string;
  companyId: string;
  provider: "xero" | "quickbooks" | "truelayer" | "yapily" | "gocardless" | "gmail" | "outlook";
  providerObjectType: string;
  providerObjectId: string;
  sourceUpdatedAt: Date | null;
  rawPayload: unknown;
  rawPayloadHash: string;
  syncCursor?: string;
  importedAt: Date;
};
```

Normalize into canonical entities:

- customer;
- invoice;
- payment;
- bill;
- bank transaction;
- message;
- promise;
- obligation.

### 15.3 Integration health

Every connector should expose:

- last successful sync;
- last failed sync;
- rate-limit status;
- token expiry;
- webhook status;
- unmapped object count;
- duplicate candidate count;
- sync lag;
- reconnect required flag.

---

## 16. Accounting integration roadmap

### 16.1 Phase 1 — Xero direct

Start with Xero for UK-first SMEs.

Sync:

- contacts;
- invoices;
- payments;
- credit notes;
- bills;
- accounts;
- attachments if needed;
- bank transactions if available and useful.

Implementation requirements:

- OAuth;
- incremental sync;
- rate-limit-aware jobs;
- idempotency;
- source ID mapping;
- pagination;
- reconnect flow;
- sync health.

### 16.2 Phase 2 — QuickBooks direct

Add QuickBooks for global/US expansion.

Sync:

- customers;
- invoices;
- bills;
- payments;
- vendors;
- accounts;
- reports where needed.

### 16.3 Phase 3 — Sage / FreeAgent

For UK accountant/bookkeeper channel.

### 16.4 Phase 4 — NetSuite / Sage Intacct

For larger mid-market customers.

### 16.5 Unified accounting API option

Evaluate Codat / Apideck / Rutter / Merge when breadth becomes more important than deep control.

Do not start with unified APIs unless integration breadth is the immediate sales blocker.

---

## 17. Open banking strategy

### 17.1 First principle

For v1:

> **Read-only bank data only. No payment initiation.**

RunwayOps needs:

- balances;
- transactions;
- posted/pending status;
- counterparty;
- reference;
- amount;
- currency;
- transaction date;
- account identity;
- recurring payments if available.

RunwayOps does not initially need:

- payment initiation;
- supplier payment execution;
- sweeping;
- variable recurring payments;
- lending;
- regulated advice.

### 17.2 UK-first provider shortlist

Evaluate:

- TrueLayer;
- Yapily;
- GoCardless Bank Account Data.

Use Plaid for US/global expansion evaluation.

### 17.3 Provider abstraction

```ts
interface BankDataProvider {
  createConnection(companyId: string): Promise<AuthUrl>;
  refreshConnection(connectionId: string): Promise<void>;
  listAccounts(connectionId: string): Promise<BankAccount[]>;
  listBalances(accountId: string): Promise<Balance[]>;
  listTransactions(accountId: string, cursor: Cursor): Promise<TransactionPage>;
  disconnect(connectionId: string): Promise<void>;
}
```

### 17.4 Bank-event matching

Do not assume every credit equals invoice payment.

Use matching features:

- amount match;
- customer/counterparty name;
- invoice reference;
- payment reference;
- date proximity;
- known payer account;
- payment link event;
- manual confirmation if uncertain.

---

## 18. Email integration strategy

### 18.1 Phase 1 — read-only

Start with read-only email access.

Use it for:

- thread retrieval;
- customer reply classification;
- promise extraction;
- evidence retrieval;
- drafting inside RunwayOps.

### 18.2 Gmail

Use Gmail API with narrow scopes.

Initial preference:

- read-only access;
- later draft creation;
- later approved send.

### 18.3 Outlook / Microsoft 365

Use Microsoft Graph.

Support:

- change notifications;
- delta sync;
- read-only thread retrieval;
- draft creation later.

### 18.4 Email rollout

```text
Phase 1: read-only thread retrieval + draft suggestions inside RunwayOps
Phase 2: create draft in Gmail/Outlook; human sends
Phase 3: approved send from RunwayOps with strict audit trail
```

Do not start with autonomous sending.

---

## 19. Payment links and collection rails

### 19.1 Principle

Use existing rails. Do not become a payment processor.

### 19.2 Stripe

Use for:

- payment links;
- card payment links;
- checkout sessions;
- webhook confirmation;
- invoice payment tracking if customer uses Stripe.

### 19.3 GoCardless

Use for:

- direct debit;
- bank debit;
- recurring collection;
- payment lifecycle events;
- UK SME relevance.

### 19.4 Initial product behaviour

```text
Generate approved message
Include payment link if available
Track link sent
Track payment event
Match to invoice/promise
Update expected cash confidence
```

No supplier payment initiation in v1.

---

## 20. Temporal workflow design

### 20.1 Temporal role

Temporal owns process durability.

It should handle:

- daily cash-action cycles;
- critical-obligation cases;
- promise due-date waits;
- approval waits;
- bank event waits;
- retries;
- timeout escalation;
- integration failures;
- stale cases;
- workflow state.

### 20.2 DailyCashActionWorkflow

```text
DailyCashActionWorkflow(companyId, date)
  syncAccountingData
  syncBankTransactions
  syncEmailThreads
  computeCashForecast
  rankCollectionsActions
  retrieveMemoryForTopActions
  draftMessages
  createApprovalRequests
  writeAuditEvents
```

### 20.3 CustomerReplyWorkflow

```text
CustomerReplyWorkflow(messageEventId)
  normalizeMessage
  classifyReply
  extractPromise
  retrieveCustomerMemory
  updateExpectedCashConfidence
  recomputeForecastIfNeeded
  rerankActions
  draftFollowUpIfNeeded
  createApprovalRequest
  writeAuditEvent
```

### 20.4 PromiseMonitoringWorkflow

```text
PromiseMonitoringWorkflow(promiseId)
  waitUntilPromisedDate
  checkBankAndAccountingEvents
  classifyOutcome
  updateCustomerReliability
  updateCashForecast
  createFollowUpActionIfBroken
  writeMemoryAndAudit
```

### 20.5 CriticalObligationCaseWorkflow

```text
CriticalObligationCaseWorkflow(caseId)
  openCase
  computeShortfall
  identifyCollectableInvoices
  retrieveCustomerMemory
  identifySupplierTimingOptions
  draftCustomerActions
  draftSupplierActions
  createApprovalRequests
  waitForSignals: approval, bank_event, customer_reply, due_date
  replanForecast
  updateCaseStatus
  closeOrEscalate
  writeMemoryAndAudit
```

### 20.6 Temporal signals

```text
customer_reply_received
bank_transaction_posted
invoice_updated
payment_received
approval_granted
approval_rejected
approval_edited
promise_due_date_elapsed
obligation_due_soon
integration_sync_failed
```

---

## 21. AI/model strategy

### 21.1 Model router

Do not hardcode one provider.

```ts
interface ModelRouter {
  classifyReply(input: ReplyClassificationInput): Promise<ReplyClassification>;
  extractPromise(input: PromiseExtractionInput): Promise<PromiseExtraction>;
  summarizeEvidence(input: EvidenceSummaryInput): Promise<EvidenceSummary>;
  draftMessage(input: DraftMessageInput): Promise<MessageDraft>;
  generateAuditExplanation(input: AuditInput): Promise<AuditExplanation>;
  recommendAction(input: ActionRecommendationInput): Promise<ActionRecommendation>;
}
```

### 21.2 Model routing by task

| Task | Model type |
|---|---|
| Reply classification | cheap fast structured-output model |
| Promise extraction | cheap/medium structured-output model |
| Evidence summary | medium model |
| Message drafting | medium/strong model |
| Sensitive explanation | stronger model |
| Cash maths | no LLM |
| Payment matching | deterministic first, ML later |

### 21.3 Required model output rules

All operational model calls must return structured JSON:

```text
classification enum
confidence 0–1
evidence_refs required
recommended_action enum
requires_approval boolean
risk_reason string
uncertainty_reason string
```

No free-form LLM output should directly mutate operational state.

### 21.4 LLM cost controls

- use small models for classification;
- embed only relevant threads;
- cache embeddings;
- store structured memory;
- summarize long threads;
- avoid whole-inbox ingestion;
- prompt-cache where possible;
- escalate to stronger models only for high-risk actions.

---

## 22. Retrieval and evidence

### 22.1 Retrieval principle

The system should not merely retrieve “similar text.” It should retrieve evidence relevant to the decision.

For a customer reply, retrieve:

- current invoice;
- customer record;
- prior promises;
- payment history;
- prior email thread;
- customer memory card;
- company policy;
- relevant obligations.

### 22.2 Retrieval attempt record

Every retrieval attempt should be stored:

```ts
type RetrievalAttempt = {
  id: string;
  companyId: string;
  intent: string;
  originalQuery: string;
  rewrittenQuery?: string;
  filters: Record<string, unknown>;
  structuredLookups: EvidenceRef[];
  semanticResults: EvidenceResult[];
  keywordResults: EvidenceResult[];
  rerankedResults: EvidenceResult[];
  selectedEvidence: EvidenceRef[];
  evidenceSufficient: boolean;
  insufficiencyReason?: string;
  createdAt: Date;
};
```

### 22.3 Evidence sufficiency

If evidence is weak, the system should:

- lower confidence;
- avoid strong claims;
- ask for human review;
- use neutral draft language;
- not mark cash as safe.

---

## 23. Security, compliance and safety

### 23.1 Product safety boundary

RunwayOps provides operational cash workflow recommendations.

RunwayOps does not:

- provide regulated financial advice;
- provide legal advice;
- provide tax advice;
- provide insolvency advice;
- recommend loans or investments;
- move money;
- initiate payments in v1;
- send external communications without approval;
- autonomously threaten customers;
- guarantee payment.

### 23.2 Approval rules

Human approval required for:

- any external customer message;
- supplier timing recommendation;
- payment-plan proposal;
- escalation wording;
- legal/firm tone;
- writeback to accounting/CRM;
- any future payment initiation.

### 23.3 Prompt injection defence

Treat customer emails and attachments as untrusted.

Trust boundaries:

```text
Trusted:
  system policy
  company policy
  deterministic cash engine outputs
  validated accounting/bank facts

Untrusted:
  customer emails
  supplier emails
  invoice attachments
  arbitrary notes
  LLM outputs
```

The LLM should never directly invoke high-risk tools.

Pattern:

```text
LLM proposes structured action
→ validator checks policy
→ recommendation saved
→ human approves
→ workflow executes scoped tool
→ audit event written
```

### 23.4 Data protection

Build assuming UK GDPR applies.

Controls:

- data processing agreement;
- controller/processor analysis;
- data minimisation;
- retention controls;
- deletion/export workflows;
- encryption at rest and in transit;
- least privilege;
- tenant isolation;
- access logs;
- vendor subprocessors list;
- regional hosting strategy;
- support access controls;
- redaction for support/debugging.

### 23.5 Open banking compliance

Use regulated providers for account information services. Do not perform payment initiation early.

### 23.6 PCI/payment data

Do not store card data. Use Stripe/GoCardless hosted flows and webhooks.

---

## 24. Infrastructure blueprint

### 24.1 Cloud

Use AWS as the main production cloud.

### 24.2 Compute

Options:

```text
Frontend: Vercel or AWS CloudFront/App Runner
API: ECS Fargate or App Runner
Workers: ECS Fargate
Temporal: Temporal Cloud
```

### 24.3 Database

```text
Aurora Postgres Multi-AZ for production
RDS Postgres acceptable early
Neon/Supabase optional for development
```

### 24.4 Eventing

```text
SQS for webhook buffering
EventBridge for scheduled events
Transactional outbox in Postgres
DLQs for failed events
```

### 24.5 Storage

```text
S3
KMS encryption
lifecycle policies
optional Object Lock for critical audit exports later
```

### 24.6 Networking and security

```text
VPC
private subnets for API/workers/db
public edge only for frontend/API gateway
WAF later
KMS
Secrets Manager
CloudTrail
IAM least privilege
```

### 24.7 Environments

```text
dev
staging
production
sandbox-integrations
```

### 24.8 CI/CD

```text
GitHub Actions
lint
typecheck
unit tests
integration tests
migration checks
security scanning
container build
deploy to staging
manual promotion to production
```

---

## 25. Repository structure

```text
runwayops/
  README.md
  package.json
  pnpm-workspace.yaml
  .env.example

  apps/
    web/
      app/
      components/
      lib/
      tests/

    api/
      src/
        routes/
        modules/
        connectors/
        auth/
        policies/
        validators/
      tests/

    workers/
      src/
        temporal/
        activities/
        workflows/
        connectors/
        jobs/
      tests/

  packages/
    cash-engine/
      src/
      tests/

    domain/
      src/
        money.ts
        invoice.ts
        promise.ts
        forecast.ts
        actions.ts

    db/
      schema/
      migrations/
      seed/

    ai/
      src/
        model-router.ts
        prompts/
        schemas/
        evals/

    integrations/
      xero/
      quickbooks/
      bank-data/
      gmail/
      outlook/
      stripe/
      gocardless/

    ui/
      components/
      theme/

  infra/
    terraform/
      aws/
      temporal/
      observability/

  docs/
    architecture.md
    product.md
    integrations.md
    security.md
    compliance.md
    roadmap.md
    runbooks.md

  scripts/
    seed-demo.ts
    reset-local.ts
    replay-events.ts
    check-cash-engine.ts
```

---

## 26. Build roadmap

### Phase 0 — Production-grade simulation

Goal:

> Rebuild the hackathon logic with production architecture, without real integrations.

Build:

- Postgres schema;
- Temporal workflows;
- deterministic cash engine;
- manual fixture events;
- promise-to-pay records;
- action queue;
- approval queue;
- audit events;
- memory cards;
- basic UI.

### Phase 1 — Xero + bank + manual email context

Build:

- Xero direct sync;
- read-only bank provider prototype;
- manual email thread upload / BCC ingestion;
- deterministic cash forecast;
- promise extraction;
- next-best-action queue;
- human-approved drafts.

### Phase 2 — Gmail/Outlook read-only

Build:

- Gmail or Outlook connector;
- relevant thread retrieval;
- reply classification;
- promise extraction;
- evidence panel;
- memory updates.

### Phase 3 — Approved sending / draft creation

Build:

- create draft in Gmail/Outlook;
- approval workflow;
- send approved message;
- audit trail;
- payment link insertion;
- outcome tracking.

### Phase 4 — QuickBooks

Build:

- QuickBooks direct integration;
- normalized accounting model;
- integration health dashboard.

### Phase 5 — Critical-obligation cases

Build:

- payroll/tax/rent/loan/supplier obligation tracking;
- auto-open case;
- case timeline;
- supplier timing recommendations;
- founder/finance briefing;
- case closure and memory.

### Phase 6 — Expansion

Add:

- Sage / FreeAgent;
- Stripe/GoCardless deeper collection flows;
- HubSpot/Salesforce context;
- SMS tasking;
- accountant/bookkeeper multi-client workspace;
- NetSuite / Sage Intacct for larger customers.

---

## 27. MVP success metrics

### Product metrics

- overdue cash collected;
- reduction in DSO;
- promise kept-rate improvement;
- number of actions approved;
- number of messages sent;
- payment after action rate;
- forecast error reduction;
- time saved per week;
- number of critical-obligation risks avoided.

### AI quality metrics

- reply classification accuracy;
- promise extraction accuracy;
- conditional promise detection accuracy;
- draft approval rate;
- human edit distance;
- hallucinated evidence rate;
- recommendation acceptance rate;
- outcome-calibrated confidence score.

### Operational metrics

- sync success rate;
- webhook latency;
- Temporal workflow failure rate;
- queue backlog;
- API latency;
- model cost per company;
- cost per recommended action;
- cost per approved action.

---

## 28. Pricing hypothesis

### 28.1 Initial pricing bands

Possible pricing:

```text
Starter: £49–£99/month
  basic cash action queue, Xero sync, manual obligations

Collections: £149–£299/month
  AI drafts, promise confidence, approval workflows, email integration

Operations: £399–£799/month
  critical-obligation cases, multi-user, supplier timing recommendations, advanced integrations

Accountant/bookkeeper plan:
  multi-client dashboard, per-client pricing or tiered bundle
```

### 28.2 Pricing principle

RunwayOps must be priced clearly below enterprise AR tools but high enough to signal measurable cash ROI.

Sell against:

- time saved;
- overdue cash collected;
- reduced DSO;
- avoided payroll/tax/supplier stress;
- fewer manual spreadsheets;
- better customer-specific follow-up.

---

## 29. What to copy, avoid and reinterpret

### 29.1 Copy

From Chaser:

- SME simplicity;
- clear pricing psychology;
- Xero/QBO-first thinking;
- practical AR workflow.

From Upflow:

- clean AR workspace;
- payment portal thinking;
- autopay/direct debit design;
- team collaboration.

From Agicap / Centime:

- cash-first framing;
- AR/AP/cash context;
- treasury concepts simplified for smaller teams.

From Billtrust / Sidetrade / HighRadius:

- adaptive collections procedures;
- next-best-action logic;
- inbox intelligence;
- evidence and workflow maturity.

From BlackLine / Kyriba:

- auditability;
- controls;
- governance;
- role-based access;
- trusted AI framing.

### 29.2 Avoid

- enterprise suite sprawl;
- vague AI CFO claims;
- autonomous voice collections;
- uncontrolled external communication;
- payment movement;
- full AP ownership;
- full cash application;
- broad ERP integrations too early;
- generic dashboards;
- overclaiming agentic autonomy.

### 29.3 Reinterpret

- Reinterpret enterprise O2C as SME cash action.
- Reinterpret collections as cash-risk reduction.
- Reinterpret forecasting as confidence in obligations.
- Reinterpret agentic AI as audited, human-approved workflow.
- Reinterpret memory as payment behaviour intelligence.

---

## 30. Key risks

### 30.1 Product risk

- SME data quality may be poor.
- Bank transaction matching may be messy.
- Email permissions may create trust friction.
- Users may not approve AI-drafted customer messages.
- The product may become too broad too quickly.

### 30.2 Competitive risk

- Xero/QuickBooks may add enough native AI.
- Chaser/Upflow/Paidnice may add promise confidence.
- Agicap/Centime may move downmarket/upmarket aggressively.
- Enterprise vendors may package lighter SME offerings.

### 30.3 Regulatory/trust risk

- Automated collections can damage relationships.
- Payment initiation changes regulatory exposure.
- AI-generated wording could be too aggressive.
- Email ingestion creates privacy risk.
- Financial recommendations may be misunderstood as advice.

### 30.4 Technical risk

- Integrations fail more often than models.
- Accounting APIs have edge cases.
- Open banking consent renewal hurts UX.
- LLM classifications may be unreliable without evals.
- Temporal workflows require engineering discipline.

---

## 31. Open questions to validate

1. Which initial ICP has the strongest pain: agencies, recruitment firms, consultancies, wholesalers, healthcare SMEs, construction subcontractors, SaaS vendors?
2. Do SMEs trust read-only email connection?
3. Do SMEs trust open banking connection?
4. Is the buyer the founder, finance manager, accountant, or fractional CFO?
5. What is the minimum invoice volume for strong ROI?
6. Do users prefer email drafts or task recommendations first?
7. Is promise-to-pay confidence understood as valuable by buyers?
8. Which channel works best: email, SMS, phone task, payment link, founder escalation?
9. How often do critical-obligation risks occur?
10. Can the product prove DSO/cash collection improvement within 30–60 days?

---

## 32. Immediate next steps

### Step 1 — Create production repo skeleton

Set up monorepo with frontend, API, workers, cash engine, integrations, AI package and infra.

### Step 2 — Build domain model and schema

Define core entities:

- company;
- customer;
- invoice;
- payment;
- bank transaction;
- obligation;
- promise-to-pay;
- action;
- approval;
- forecast;
- audit event.

### Step 3 — Build deterministic cash engine

Use fixtures and golden tests.

### Step 4 — Build Temporal prototype

Implement:

- DailyCashActionWorkflow;
- CustomerReplyWorkflow;
- PromiseMonitoringWorkflow;
- CriticalObligationCaseWorkflow skeleton.

### Step 5 — Build simulated connector ingestion

Replay fixture events through production-style event pipeline.

### Step 6 — Build UI shell

Screens:

- Daily Cash Actions;
- Promise Board;
- Cash Forecast;
- Approval Inbox;
- Audit Drawer.

### Step 7 — Add AI classification and drafting

Use model router + structured outputs + eval fixtures.

### Step 8 — Add Xero direct sync

Start with contacts, invoices, payments and bills.

### Step 9 — Add read-only bank data provider prototype

Test TrueLayer/Yapily/GoCardless Bank Account Data.

### Step 10 — Add email read-only connector

Start with Gmail or Outlook depending on first customer segment.

---

## 33. Decision log

### Decision 1 — Product category

Chosen:

> Cash-aware receivables operations for SMEs.

Rejected as primary:

- AI CFO suite;
- cash-flow forecasting tool;
- generic AR automation;
- treasury product;
- AP/payment timing tool;
- payroll-crisis-only product.

### Decision 2 — MVP surface

Chosen:

> Cash-Aware Collections Action Queue.

Underlying engine:

> Promise-to-Pay Confidence Engine.

### Decision 3 — Architecture

Chosen:

> Postgres + Temporal + deterministic cash engine + bounded AI reasoning.

Rejected as default:

> MongoDB as primary production backend.

MongoDB remains optional if retrieval/context strategy justifies it.

### Decision 4 — Integrations

Chosen order:

1. Xero;
2. read-only UK open banking;
3. Gmail/Outlook read-only;
4. QuickBooks;
5. Stripe/GoCardless payment links;
6. Sage/FreeAgent;
7. NetSuite/Sage Intacct.

### Decision 5 — Safety

Chosen:

> Human-approved external actions only.

Rejected early:

- autonomous payment initiation;
- autonomous supplier negotiation;
- autonomous AI voice calls;
- autonomous legal escalation.

---

## 34. Final product statement

> **RunwayOps is a cash-aware receivables operations platform for SMEs. It connects to accounting, bank data, email, invoices, bills and critical obligations, then recommends the next best cash action each day. Its core intelligence is a promise-to-pay confidence engine that learns customer behaviour over time, distinguishes real cash from uncertain promises, updates forecasts when bank events occur, and keeps every external action human-approved and auditable.**

---

## 35. Final architecture statement

> **RunwayOps is not an LLM agent sitting on top of finance data. It is a deterministic financial workflow system with an adaptive AI layer around it. Postgres stores financial truth, Temporal coordinates durable work, the cash engine performs deterministic calculations, AI interprets ambiguous communications and drafts recommendations, and humans approve external actions.**

---

## 36. Final build mantra

```text
Facts first.
Cash engine second.
Workflow third.
Memory fourth.
AI fifth.
Approvals always.
Autonomy later.
```

