# RunwayOps End-to-End Implementation Plan

Version: 1.0
Date: 2026-05-04
Source spec: `New Spec.md`
Product: RunwayOps
Primary build objective: Cash-aware receivables operations for SMEs
Initial MVP: Cash-Aware Collections Action Queue powered by Promise-to-Pay Confidence

---

## 1. Purpose Of This Document

This document is the execution plan for turning the RunwayOps production master spec into a real product. It is written for future agents and engineers who need to build the system end to end without re-discovering the product thesis, architectural boundaries, safety constraints, and sequencing logic.

The plan is intentionally opinionated. Quality is the priority. The product handles financial state, customer communication, accounting data, bank data, and AI-generated recommendations, so the implementation must be deterministic where correctness matters, auditable where trust matters, and conservative wherever external action or user money is involved.

The core build principle is:

```text
Facts first.
Cash engine second.
Workflow third.
Memory fourth.
AI fifth.
Approvals always.
Autonomy later.
```

---

## 2. Current Context And Assumptions

The production spec defines RunwayOps as a cash-aware receivables operations platform for SMEs. The product should not start as a broad AI CFO suite, treasury tool, generic dashboard, AP platform, or autonomous collections bot.

The first customer-facing product should answer:

```text
What are the five cash actions that matter most today, and why?
```

The first technical primitive should be:

```text
A Promise-to-Pay Confidence Engine that detects, classifies, scores, monitors, and learns from customer payment promises.
```

The recommended production architecture is:

```text
Postgres as source of truth
Temporal as workflow durability layer
Deterministic cash engine for all financial calculations
Bounded AI services for ambiguity and drafting
Read-only accounting/bank/email integrations at first
Human approval before every external action
```

Important local assumption:

- This plan assumes implementation will happen under the `RunwayPilot` workspace.
- If existing code is discovered later, preserve user changes and adapt the phases to the existing structure.
- If a feature appears "missing", follow the repo instruction: diagnose layer order first. Check registration, discovery, install state, and official activation flows before debugging permissions or runtime.

---

## 3. Product Definition

### 3.1 Product Category

RunwayOps is:

```text
Cash-aware receivables operations for SMEs.
```

External phrasing:

```text
RunwayOps helps SMEs collect cash faster, trust promises-to-pay, and protect critical obligations.
```

Homepage-level description:

```text
RunwayOps tells SMEs who to chase, what to say, what cash to trust, and whether payroll, tax, rent, loans, or supplier payments are safe.
```

### 3.2 MVP User

Primary users:

- Founder
- Owner-operator
- Finance manager
- Bookkeeper
- Fractional CFO
- Operations lead
- Small finance team

Initial target company:

- UK B2B SME
- 10 to 200 employees
- Uses Xero first, QuickBooks later
- Sends recurring B2B invoices
- Has meaningful overdue AR
- Has payroll, tax, rent, supplier, loan, or contractor obligations
- Communicates with customers over email
- Has bank feeds or is willing to connect read-only open banking

### 3.3 MVP Must Do

The MVP must:

- Connect to Xero first.
- Import invoices, customers, payment history, credit notes, and bills.
- Allow manual entry of critical obligations.
- Support simulated or provider-backed bank transactions.
- Support manual email context before OAuth email sync.
- Rank customers and invoices by collectability and cash impact.
- Identify who should be contacted next.
- Draft a message for human approval.
- Classify customer replies.
- Distinguish firm, conditional, vague, partial, disputed, cannot-pay, and already-paid claims.
- Update expected cash confidence.
- Alert when obligations are at risk.
- Maintain audit history.
- Require human approval before any external communication.

### 3.4 MVP Must Not Do

Do not build early:

- Full AP automation
- Full cash application
- Autonomous payment initiation
- Autonomous supplier negotiation
- Autonomous AI voice calls
- Legal collections workflows
- Tax advice
- Invoice financing
- Broad CFO-suite dashboards
- Ledger replacement
- SAP, Oracle, NetSuite, or enterprise integrations
- Automatic aggressive escalation

---

## 4. Critical Discussion Items

These are not blockers for Phase 0, but they must be explicitly discussed before production launch.

### 4.1 Temporal Scope

Temporal is the right durability layer for long-running workflows, but it should not become the general application framework. Do not put CRUD, ranking formulas, or ordinary query handlers into Temporal workflows.

Temporal workflows should coordinate durable process:

- Daily cash action cycles
- Promise due-date waits
- Approval waits
- Case lifecycles
- Retry and timeout handling
- Event signal handling

Activities should perform:

- Database queries
- External API calls
- LLM calls
- File and object storage I/O
- Email/accounting/bank connector calls

Rationale:

- Temporal replay requires workflow definitions to remain deterministic.
- External I/O must live in activities whose results are recorded in workflow history.

### 4.2 LangGraph And LangChain

The spec mentions LangGraph/LangChain for bounded agent reasoning. Treat this as optional, not foundational.

Start with:

- Typed service functions
- Structured model outputs
- Explicit validators
- Deterministic orchestration in application code and Temporal activities

Add LangGraph only if:

- A task has real multi-step dynamic branching.
- A state graph reduces complexity.
- The graph is bounded, observable, testable, and cannot directly execute high-risk tools.

### 4.3 Email OAuth Trust Cliff

Read-only email access is powerful but sensitive. Gmail read scopes are restricted, and users may distrust inbox access.

Recommended sequence:

1. Manual thread upload or copy/paste.
2. BCC ingestion.
3. Gmail/Outlook read-only connector.
4. Draft creation.
5. Approved send.

Do not make email OAuth required for first demo or first pilot.

### 4.4 Xero Terms And Granular Scopes

Xero moved toward granular scopes in 2026 and states that API data may not be used to train AI/ML models. This matters for RunwayOps.

Implementation implications:

- Use least-privilege Xero scopes.
- Treat customer data as tenant-operational data only.
- Do not use customer accounting data for cross-tenant model training.
- Keep eval fixtures synthetic or explicitly consented.
- Build reconnect and insufficient-scope flows from day one.

### 4.5 Memory Scope

The memory system in the spec is broad. Start with structured behavioral memory and defer semantic memory until the product has enough evidence volume.

Phase 1 memory:

- Average days late
- Promise kept rate
- Conditional promise kept rate
- Dispute rate
- Payment after action rate
- Last successful channel
- Last successful tone

Defer:

- Embeddings for all email content
- Large-scale semantic memory
- Cross-customer pattern mining

### 4.6 Open Banking Consent And Reconnection

Read-only bank data is necessary for "cash that landed", but open banking consent and reconnection UX are core product design concerns, not connector details.

Design requirements:

- Explicit consent journey.
- Consent expiry tracking.
- Reconnect required state.
- Bank data stale warnings.
- Forecast confidence degradation when bank sync is stale.

### 4.7 Postgres Tenant Isolation

Use application-layer authorization and database-level tenant isolation. Postgres row-level security should be enabled for tenant tables before production.

Do not rely only on "companyId in queries" as the final security boundary.

### 4.8 Money Handling

Do not use JavaScript floating point for money.

Recommended:

- Domain `Money` value object with integer minor units.
- Store amount in `amount_minor bigint` plus `currency char(3)`.
- Use `numeric` only where decimal precision is unavoidable.
- Never use Postgres `money` type.

---

## 5. Architectural North Star

### 5.1 System Shape

```text
External Systems
  Xero / QuickBooks / Bank / Gmail / Outlook / Stripe / GoCardless

Connector Layer
  OAuth, webhooks, polling, token refresh, raw source capture

Event Ingestion
  Webhook buffer, idempotency, sync jobs, dead-letter queues

Application API
  Auth, tenant checks, command handlers, validation

Postgres Transaction
  Canonical state write + outbox event + audit event

Transactional Outbox
  Durable domain event publication

Temporal Workflows
  Daily action cycles, customer reply workflows, promise monitoring, cases

Activities
  Sync data, compute cash, retrieve evidence, call models, draft messages

Postgres Source Of Truth
  Facts, promises, forecasts, actions, approvals, memory, audit

AI Layer
  Structured classification, extraction, drafting, explanation

Human Approval Layer
  Approve, reject, edit, defer, escalate

External Action Layer
  Draft creation, approved send, payment link insertion

Outcome Monitoring
  Bank event, accounting payment, customer reply, due-date expiry

Memory Update
  Reliability, channel/tone effectiveness, promise outcome
```

### 5.2 Hard Boundaries

Deterministic:

- Cash arithmetic
- Monetary rounding
- Due-date calculations
- Risk thresholds
- Forecast scenario totals
- Action ranking formula v1
- Approval rules
- Tenant permission checks
- Source-of-truth state transitions
- Idempotency
- Forecast versioning

Agentic or AI-assisted:

- Reply classification
- Promise extraction
- Conditionality detection
- Evidence summarization
- Query rewriting
- Draft generation
- Tone/channel recommendation
- Audit explanation
- Memory-card wording

Forbidden for AI:

- Sending external messages directly
- Initiating payments
- Delaying suppliers
- Marking payroll safe
- Writing ledger entries
- Changing payment terms
- Threatening legal action
- Deleting data
- Overriding policy
- Deciding access permissions

### 5.3 Source Of Truth Rules

1. Postgres stores canonical financial state.
2. Provider payloads are stored as raw source objects for traceability.
3. Every external event has an idempotency key.
4. Every recommendation references evidence.
5. Every external action requires approval.
6. Every forecast is versioned.
7. Every model output is schema-validated.
8. Every promise-to-pay is a first-class object.
9. Every outcome updates memory.
10. No LLM output is executable until validated.

---

## 6. Target Repository Structure

Use a TypeScript monorepo:

```text
runwayops/
  README.md
  package.json
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
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
        observability/
      tests/

    workers/
      src/
        temporal/
          workflows/
          activities/
          schedules/
          signals.ts
        jobs/
        bootstrap.ts
      tests/

  packages/
    domain/
      src/
        money.ts
        company.ts
        customer.ts
        invoice.ts
        payment.ts
        bank.ts
        obligation.ts
        promise.ts
        forecast.ts
        actions.ts
        approvals.ts
        audit.ts
        events.ts
      tests/

    cash-engine/
      src/
        forecast.ts
        risk.ts
        ranking.ts
        scenarios.ts
        matching.ts
      tests/
        fixtures/
        golden/

    db/
      src/
        client.ts
        schema/
        migrations/
        seed/
      tests/

    ai/
      src/
        model-router.ts
        schemas/
        prompts/
        validators/
        evals/
      tests/

    integrations/
      src/
        common/
          source-object.ts
          sync-job.ts
          idempotency.ts
          rate-limit.ts
        xero/
        quickbooks/
        bank-data/
        gmail/
        outlook/
        stripe/
        gocardless/
      tests/

    ui/
      src/
        components/
        theme/
        charts/

  infra/
    terraform/
      aws/
      temporal/
      observability/

  docs/
    architecture.md
    product.md
    security.md
    compliance.md
    integrations.md
    runbooks.md
    roadmap.md

  scripts/
    seed-demo.ts
    replay-events.ts
    reset-local.ts
    check-cash-engine.ts
```

If an existing codebase already has a different structure, adapt this plan to local conventions instead of forcing a churn-heavy restructure.

---

## 7. Phase Overview

The product should be built in phases with quality gates. A phase is not complete because code exists. It is complete only when the exit criteria pass.

```text
Phase 0: Product, safety, and architecture lock
Phase 1: Monorepo skeleton and dev environment
Phase 2: Domain model and database source of truth
Phase 3: Deterministic cash engine
Phase 4: Event ingestion and transactional outbox
Phase 5: Temporal simulation workflows
Phase 6: Human-first product UI
Phase 7: AI classification, extraction, drafting, and evals
Phase 8: Xero read-only integration
Phase 9: Bank data prototype
Phase 10: Email context and read-only sync
Phase 11: Approved external action layer
Phase 12: Critical-obligation case mode
Phase 13: Production hardening
Phase 14: Pilot launch and learning loop
```

---

## 8. Phase 0 - Product, Safety, And Architecture Lock

Goal:

Create the decision base that prevents product sprawl and unsafe implementation.

### 8.1 Deliverables

- `docs/product.md`
- `docs/architecture.md`
- `docs/security.md`
- `docs/compliance.md`
- `docs/roadmap.md`
- Initial threat model
- Initial data map
- DPIA draft
- Product policy document
- Non-goals list

### 8.2 Product Decisions To Record

Record these as explicit decision records:

- Product category: cash-aware receivables operations for SMEs.
- MVP surface: Cash-Aware Collections Action Queue.
- Core engine: Promise-to-Pay Confidence.
- Architecture: Postgres + Temporal + deterministic cash engine + bounded AI.
- Initial integration order: Xero, bank data, manual email, Gmail/Outlook, approved send.
- Safety: human-approved external actions only.

### 8.3 Safety Policies

Create policies for:

- External messaging
- Escalation wording
- Payment-plan proposals
- Supplier timing recommendations
- Forecast confidence language
- Legal/tax/insolvency disclaimers
- Customer data handling
- Support access
- AI evidence requirements

### 8.4 Exit Criteria

- Every non-goal is documented.
- Every AI boundary is documented.
- Every external action requires approval in policy.
- The MVP can be explained in one sentence.
- No phase depends on autonomous sending or payment initiation.

---

## 9. Phase 1 - Monorepo Skeleton And Dev Environment

Goal:

Create a clean, testable foundation with shared packages and local development workflows.

### 9.1 Recommended Stack

Frontend:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui or equivalent
- TanStack Query
- Recharts or Visx
- Playwright

Backend:

- TypeScript
- Fastify preferred for explicitness and low ceremony
- Zod validation
- Drizzle preferred for transparent SQL and migrations
- OpenAPI generation

Workers:

- Temporal TypeScript SDK
- Dedicated worker process
- Dedicated activity modules

Database:

- Postgres
- pgvector later, not required in first pass

Package manager:

- pnpm workspace

### 9.2 Initial Commands

The first agent should create:

- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `tsconfig.base.json`
- app/package configs
- lint/typecheck/test scripts
- `.env.example`

Suggested scripts:

```json
{
  "dev": "turbo run dev",
  "build": "turbo run build",
  "typecheck": "turbo run typecheck",
  "lint": "turbo run lint",
  "test": "turbo run test",
  "test:e2e": "turbo run test:e2e",
  "db:migrate": "pnpm --filter @runwayops/db migrate",
  "db:seed": "pnpm --filter @runwayops/db seed",
  "worker:dev": "pnpm --filter @runwayops/workers dev"
}
```

### 9.3 Environment Variables

Start with:

```text
DATABASE_URL=
APP_BASE_URL=
API_BASE_URL=
SESSION_SECRET=

TEMPORAL_ADDRESS=
TEMPORAL_NAMESPACE=
TEMPORAL_TASK_QUEUE=

OPENAI_API_KEY=
AI_PROVIDER=
AI_CLASSIFIER_MODEL=
AI_DRAFT_MODEL=

XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
XERO_REDIRECT_URI=

BANK_PROVIDER=
BANK_CLIENT_ID=
BANK_CLIENT_SECRET=

GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REDIRECT_URI=

OUTLOOK_CLIENT_ID=
OUTLOOK_CLIENT_SECRET=
OUTLOOK_REDIRECT_URI=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
GOCARDLESS_ACCESS_TOKEN=
```

Keep unused integrations blank until their phase.

### 9.4 Exit Criteria

- `pnpm install` succeeds.
- `pnpm typecheck` succeeds.
- `pnpm test` succeeds with placeholder tests.
- `apps/web` can start locally.
- `apps/api` can start locally.
- `apps/workers` can start and connect to a local Temporal dev server or run in mocked mode.

---

## 10. Phase 2 - Domain Model And Database Source Of Truth

Goal:

Define canonical financial facts, workflow state, evidence, approvals, integration records, and audit records.

### 10.1 Domain Principles

- Domain types live in `packages/domain`.
- Database schema lives in `packages/db`.
- API modules import domain types, not the reverse.
- Cash engine imports domain types and pure inputs only.
- AI package returns model proposals, not domain mutations.

### 10.2 Money Value Object

Implement:

```ts
type CurrencyCode = "GBP" | "USD" | "EUR" | string;

type Money = {
  amountMinor: bigint;
  currency: CurrencyCode;
};
```

Required helpers:

- `money(amountMinor, currency)`
- `addMoney`
- `subtractMoney`
- `multiplyMoneyByRatio`
- `compareMoney`
- `minMoney`
- `maxMoney`
- `formatMoney`
- `assertSameCurrency`

Rules:

- Never use JS floating point for money.
- Do not add across currencies.
- Keep multi-currency conversion out of MVP unless required.

### 10.3 Core Tables

#### Identity And Tenant

```text
companies
users
memberships
roles
permissions
company_policies
```

Minimum fields:

- `id`
- `created_at`
- `updated_at`
- `deleted_at` where soft-delete is needed
- `company_id` for tenant-owned tables

Membership roles:

- `owner`
- `admin`
- `finance_manager`
- `bookkeeper`
- `approver`
- `viewer`

#### Customers And Suppliers

```text
customers
customer_contacts
suppliers
supplier_contacts
```

Customer fields:

- `company_id`
- `display_name`
- `legal_name`
- `external_refs`
- `relationship_tier`
- `default_contact_id`
- `status`
- `notes`

#### Accounting Facts

```text
invoices
invoice_line_items
payments
credit_notes
supplier_bills
bank_accounts
bank_transactions
critical_obligations
```

Invoice fields:

- `company_id`
- `customer_id`
- `source_object_id`
- `invoice_number`
- `issue_date`
- `due_date`
- `status`
- `amount_due_minor`
- `amount_paid_minor`
- `currency`
- `last_source_updated_at`

Payment fields:

- `company_id`
- `customer_id`
- `invoice_id`
- `source_object_id`
- `payment_date`
- `amount_minor`
- `currency`
- `provider_status`

Critical obligation fields:

- `company_id`
- `obligation_type`
- `counterparty_name`
- `due_date`
- `amount_minor`
- `currency`
- `criticality`
- `recurrence_rule`
- `manual_or_source`
- `status`

#### Communications And Memory

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

Only create `evidence_embeddings` when pgvector is enabled. Before that, use structured evidence refs and full-text search.

#### Workflow And Product State

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

#### Integration Tables

```text
integration_connections
integration_tokens
source_objects
sync_jobs
sync_cursors
webhook_events
idempotency_keys
outbox_events
```

### 10.4 Promise-To-Pay Record

Canonical type:

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

### 10.5 Evidence Ref

Use evidence refs everywhere AI or ranking makes a claim:

```ts
type EvidenceRef = {
  kind:
    | "invoice"
    | "payment"
    | "bank_transaction"
    | "communication_message"
    | "promise_to_pay"
    | "customer_stat"
    | "obligation"
    | "policy"
    | "forecast"
    | "source_object";
  id: string;
  summary?: string;
  sourceProvider?: string;
  sourceTimestamp?: string;
};
```

### 10.6 Row-Level Security

Before production:

- Enable RLS on all tenant-owned tables.
- Add policies based on active `company_id`.
- Ensure service/admin roles are explicit.
- Add tests proving cross-tenant reads and writes fail.

### 10.7 Exit Criteria

- Migrations create all Phase 2 tables.
- Seed data creates one demo company with customers, invoices, payments, obligations, and messages.
- Domain object schemas validate seed data.
- Tenant isolation tests pass.
- Every tenant-owned table has `company_id`.
- Every externally sourced object has traceability to `source_objects`.

---

## 11. Phase 3 - Deterministic Cash Engine

Goal:

Build a pure, tested package that computes cash forecasts and risk states without DB, network, or AI.

### 11.1 Package

Location:

```text
packages/cash-engine
```

Inputs:

- Cash balances
- Invoices
- Payments
- Promises-to-pay
- Supplier bills
- Critical obligations
- Customer payment stats
- Policy thresholds
- Scenario settings
- As-of date

Outputs:

- Actual cash
- Expected inflows
- Confidence-weighted inflows
- Expected outflows
- Critical obligation coverage
- Risk status
- Shortfall amount
- Forecast bands
- Forecast scenarios
- Action impact deltas
- Evidence refs

### 11.2 Forecast Type

```ts
type CashForecast = {
  forecastId: string;
  companyId: string;
  generatedAt: Date;
  asOfDate: Date;
  horizonDays: 7 | 14 | 30 | 90;
  triggerEventIds: string[];
  cashBalance: Money;
  expectedInflows: ForecastCashFlow[];
  confidenceWeightedInflows: ForecastCashFlow[];
  expectedOutflows: ForecastCashFlow[];
  riskStatus: "safe" | "watch" | "high" | "critical";
  scenarios: ForecastScenario[];
  confidenceBands: ConfidenceBand[];
  shortfallAmount?: Money;
  obligationRisks: ObligationRisk[];
  evidenceRefs: EvidenceRef[];
};
```

### 11.3 Risk State Rules V1

```text
SAFE:
  obligations covered by actual cash plus high-confidence expected cash.

WATCH:
  obligations likely covered, but dependent on medium-confidence or conditional cash.

HIGH:
  material shortfall unless one or more recommended actions succeed.

CRITICAL:
  unavoidable shortfall without immediate intervention.
```

Configurable thresholds:

- High-confidence promise: `>= 0.8`
- Medium-confidence promise: `>= 0.5 and < 0.8`
- Low-confidence promise: `< 0.5`
- Critical obligation window: configurable, default 7 days
- Watch obligation window: configurable, default 14 days

### 11.4 Promise Confidence Inputs

Initial confidence formula should be interpretable:

```text
base_confidence_by_type
  * customer_reliability_factor
  * evidence_confidence
  * recency_factor
  * condition_penalty
  * dispute_penalty
```

Suggested base values:

```text
firm: 0.75
conditional: 0.45
vague: 0.25
partial: 0.55
disputed: 0.15
cannot_pay: 0.05
already_paid_claim: 0.35 until matched
```

These are defaults, not truth. They must be calibrated with outcomes.

### 11.5 Next-Best-Action Ranking V1

Use an interpretable score:

```text
priority_score =
  expected_cash_impact
  * probability_of_payment
  * obligation_urgency
  * action_effectiveness
  * evidence_confidence
  - relationship_risk_penalty
  - action_effort_penalty
```

Where:

```text
expected_cash_impact = min(invoice_amount_due, near_term_cash_shortfall)
```

This prevents blindly chasing the largest invoice.

### 11.6 Golden Fixtures

Create fixtures for:

- Normal overdue invoice, no obligation risk.
- Payroll due in 5 days, conditional promise due before payroll.
- Customer claims already paid, bank event absent.
- Customer pays partial amount late.
- Customer has high historical reliability.
- Customer has broken conditional promises.
- Supplier bill creates shortfall.
- Bank event lands and closes risk.
- Duplicate payment event.
- Timezone boundary around promised date.

### 11.7 Exit Criteria

- Cash engine has no database imports.
- Cash engine has no AI/model imports.
- Golden tests pass deterministically.
- Forecast output includes evidence refs.
- Ranking formula output can be explained from input values.
- No floating-point money arithmetic exists.

---

## 12. Phase 4 - Event Ingestion And Transactional Outbox

Goal:

Create a reliable event path from provider payload or manual event to canonical state, domain event, audit trail, and workflow signal.

### 12.1 Event Types

Core domain events:

```text
invoice.created
invoice.updated
invoice.paid
payment.received
bank_transaction.posted
customer_reply.received
promise.created
promise.updated
promise.due
promise.outcome_classified
obligation.created
obligation.updated
obligation.due_soon
forecast.generated
collection_action.created
approval.requested
approval.granted
approval.rejected
approval.edited
message_draft.created
external_message.sent
integration.sync_started
integration.sync_completed
integration.sync_failed
```

### 12.2 Outbox Table

Minimum fields:

```text
id
company_id
event_type
aggregate_type
aggregate_id
payload_json
idempotency_key
sequence_number
status
attempt_count
next_attempt_at
created_at
published_at
last_error
```

### 12.3 Ingestion Flow

```text
Receive provider/manual event
  -> validate shape
  -> compute idempotency key
  -> store raw source object
  -> normalize canonical entity
  -> write canonical entity + idempotency key + outbox event + audit event in one transaction
  -> outbox publisher dispatches event
  -> Temporal client starts/signals workflow where needed
```

### 12.4 Idempotency

Idempotency key format:

```text
provider:provider_object_type:provider_object_id:source_updated_at_or_hash
```

Manual events:

```text
manual:event_type:user_id:client_generated_id
```

### 12.5 Exit Criteria

- Replaying the same event twice does not duplicate canonical data.
- Failed outbox publish retries safely.
- Outbox events preserve ordering per aggregate where required.
- Every canonical mutation has an audit event.
- Workflow start/signal is never done before the database transaction commits.

---

## 13. Phase 5 - Temporal Simulation Workflows

Goal:

Rebuild the hackathon logic with production architecture but without real integrations.

### 13.1 Workflow Design Rules

Workflow code must:

- Be deterministic.
- Use activities for DB queries.
- Use activities for API calls.
- Use activities for LLM calls.
- Use Temporal timers for waits.
- Use signals for external events.
- Avoid local `Date.now`, random UUIDs, network calls, and mutable globals.

### 13.2 Workflows

#### DailyCashActionWorkflow

Signature:

```ts
DailyCashActionWorkflow(companyId: string, asOfDate: string)
```

Steps:

```text
loadCompanyPolicy
loadCurrentFinancialFacts
computeCashForecast
rankCollectionsActions
retrieveEvidenceForTopActions
draftMessagesForTopActions
createApprovalRequests
writeAuditEvents
return cycle summary
```

#### CustomerReplyWorkflow

Signature:

```ts
CustomerReplyWorkflow(messageEventId: string)
```

Steps:

```text
loadMessage
normalizeMessage
classifyReply
extractPromiseIfPresent
retrieveCustomerMemory
validateEvidence
createOrUpdatePromise
recomputeForecastIfNeeded
rerankActions
draftFollowUpIfNeeded
createApprovalRequestIfNeeded
writeAuditEvent
```

#### PromiseMonitoringWorkflow

Signature:

```ts
PromiseMonitoringWorkflow(promiseId: string)
```

Steps:

```text
loadPromise
waitUntilPromisedDatePlusGrace
checkBankAndAccountingEvents
classifyPromiseOutcome
updateCustomerReliability
updateCashForecast
createFollowUpActionIfBroken
writeMemoryAndAudit
```

#### CriticalObligationCaseWorkflow

Signature:

```ts
CriticalObligationCaseWorkflow(caseId: string)
```

Steps:

```text
openCase
computeShortfall
identifyCollectableInvoices
retrieveCustomerMemory
identifySupplierTimingOptions
draftCustomerActions
draftSupplierActionsForApproval
createApprovalRequests
waitForSignals
replanForecast
updateCaseStatus
closeOrEscalate
writeMemoryAndAudit
```

### 13.3 Signals

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

### 13.4 Simulation Fixtures

Build a replay script:

```text
scripts/replay-events.ts
```

It should:

- Seed a demo company.
- Replay invoices.
- Replay obligations.
- Replay customer messages.
- Replay bank transactions.
- Start workflows.
- Verify final forecast and actions.

### 13.5 Exit Criteria

- Full daily loop works with fixtures.
- Customer reply creates a promise and affects forecast confidence.
- Promise due-date monitoring updates outcome.
- Approval waits work.
- Audit timeline is complete.
- Temporal workflow tests pass.
- Replay remains deterministic after worker restart.

---

## 14. Phase 6 - Human-First Product UI

Goal:

Build an operational interface that helps finance teams act, not a generic analytics dashboard.

### 14.1 UI Principles

- First screen is the product, not a landing page.
- The daily action queue is the center of gravity.
- Every recommendation must show why it exists.
- Every draft must be editable before approval.
- Every risk status must show what it depends on.
- Avoid broad dashboard sprawl.
- Keep screens dense, scannable, and work-focused.

### 14.2 Primary Screens

#### Daily Cash Actions

Purpose:

Show the top five actions for today.

Required UI:

- Priority list
- Customer name
- Invoice amount
- Expected cash impact
- Probability/confidence
- Obligation risk linkage
- Recommended channel
- Recommended tone
- Draft preview
- Evidence drawer
- Approve/edit/reject/defer controls

#### Collections Queue

Purpose:

Show broader ranked receivables backlog.

Required UI:

- Filters: overdue, due soon, promise pending, disputed, high impact
- Sorts: priority, amount, days overdue, confidence, customer
- Bulk review, but no bulk send in MVP

#### Promise Board

Purpose:

Track all promises-to-pay and their reliability.

Required UI:

- Promise type
- Promised date
- Amount
- Condition text
- Confidence
- Outcome
- Evidence
- Monitoring status

#### Cash Confidence Forecast

Purpose:

Show cash with confidence and obligation coverage.

Required UI:

- 7, 14, 30, 90 day horizons
- Actual cash
- Expected cash
- Confidence-adjusted cash
- Obligations
- Risk state
- Scenario toggles
- Forecast version history

#### Approval Inbox

Purpose:

Approve, edit, reject, or defer external actions.

Required UI:

- Draft message editor
- Evidence summary
- Policy warnings
- Tone risk warnings
- Approval history
- Final action preview

#### Customer Memory

Purpose:

Show behavioral memory and supporting evidence.

Required UI:

- Average days late
- Promise kept rate
- Conditional promise kept rate
- Dispute rate
- Best channel
- Best tone
- Recent promises
- Recent actions

#### Audit Drawer

Purpose:

Explain every recommendation and state transition.

Required UI:

- Timeline
- Actor
- Event type
- Evidence refs
- Model run refs
- Forecast version refs
- Approval refs

#### Integration Health

Purpose:

Make connector reliability visible.

Required UI:

- Connection status
- Last successful sync
- Last failed sync
- Token expiry
- Reconnect required
- Rate-limit status
- Webhook status
- Sync lag
- Unmapped objects

### 14.3 API Shape For UI

Initial endpoints:

```text
GET  /companies/:companyId/actions/today
GET  /companies/:companyId/collections
GET  /companies/:companyId/promises
GET  /companies/:companyId/forecast/latest
GET  /companies/:companyId/forecasts/:forecastId
GET  /companies/:companyId/approvals
POST /companies/:companyId/approvals/:approvalId/approve
POST /companies/:companyId/approvals/:approvalId/reject
POST /companies/:companyId/approvals/:approvalId/edit
POST /companies/:companyId/approvals/:approvalId/defer
GET  /companies/:companyId/customers/:customerId/memory
GET  /companies/:companyId/audit
GET  /companies/:companyId/integrations
```

### 14.4 Exit Criteria

- User can complete the simulated daily loop from UI.
- User can inspect evidence before approving.
- User can edit drafts.
- User can reject recommendations.
- Forecast updates are visible after simulated events.
- Audit drawer explains all state changes.
- Playwright tests cover main user flows.

---

## 15. Phase 7 - AI Classification, Extraction, Drafting, And Evals

Goal:

Add AI where it is useful: ambiguity, language, evidence summary, and drafting. Keep all operational mutation behind validation.

### 15.1 Package

Location:

```text
packages/ai
```

### 15.2 Model Router

Interface:

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

### 15.3 Structured Output Rule

All model calls must return structured JSON.

Required fields:

```text
classification enum
confidence 0 to 1
evidence_refs
recommended_action enum
requires_approval boolean
risk_reason
uncertainty_reason
```

### 15.4 Prompt Injection Defense

Trusted:

- System policy
- Company policy
- Deterministic cash engine outputs
- Validated accounting facts
- Validated bank facts

Untrusted:

- Customer emails
- Supplier emails
- Attachments
- User notes
- LLM output

Pattern:

```text
LLM proposes structured action
  -> schema validation
  -> policy validation
  -> evidence validation
  -> recommendation saved
  -> human approves
  -> scoped tool executes
  -> audit event written
```

### 15.5 Evals

Create eval fixtures for:

- Firm promise
- Conditional promise
- Vague promise
- Partial payment promise
- Dispute
- Cannot pay
- Already paid claim
- Prompt injection attempt
- Aggressive customer wording
- Customer asks for sensitive action
- Customer includes misleading instruction to ignore policy

Metrics:

- Classification accuracy
- Promise extraction accuracy
- Conditionality detection accuracy
- Evidence grounding rate
- Hallucinated evidence rate
- Draft approval rate
- Human edit distance
- Cost per recommendation

### 15.6 Cost Controls

- Use small models for classification.
- Use stronger models only for sensitive drafting or explanations.
- Put static instructions at prompt beginning for cacheability.
- Cache embeddings and summaries.
- Avoid whole-inbox ingestion.
- Summarize long threads.
- Log model cost by company and task.

### 15.7 Exit Criteria

- Model outputs are schema-validated.
- Invalid outputs fail closed.
- Prompt injection fixture does not trigger unsafe action.
- AI never directly mutates financial state.
- Evals run in CI.
- Hallucinated evidence rate target is defined and measured.

---

## 16. Phase 8 - Xero Read-Only Integration

Goal:

Sync Xero accounting facts into canonical state.

### 16.1 Layer-Order Diagnosis

When Xero data appears missing:

1. Check app registration.
2. Check OAuth consent and granted scopes.
3. Check tenant connection.
4. Check token refresh.
5. Check sync cursor.
6. Check source object capture.
7. Check normalization.
8. Check canonical query.
9. Only then debug runtime permissions or UI display.

### 16.2 Data To Sync

Initial:

- Contacts
- Invoices
- Payments
- Credit notes
- Bills
- Accounts

Later:

- Attachments
- Bank transactions if useful
- Tracking categories

### 16.3 Connector Requirements

- OAuth flow
- Granular scopes
- Tenant selection
- Token refresh
- Incremental sync
- Pagination
- Rate-limit handling
- Source object storage
- Hash raw payloads
- Canonical normalization
- Deduplication
- Sync health
- Reconnect flow
- Insufficient-scope flow

### 16.4 Xero Source Object

```ts
type SourceObject = {
  id: string;
  companyId: string;
  provider: "xero";
  providerObjectType: string;
  providerObjectId: string;
  sourceUpdatedAt: Date | null;
  rawPayload: unknown;
  rawPayloadHash: string;
  syncCursor?: string;
  importedAt: Date;
};
```

### 16.5 Exit Criteria

- Xero demo company syncs contacts, invoices, payments, and bills.
- Re-running sync does not duplicate data.
- Modified Xero object updates canonical object.
- Integration Health shows sync status.
- Rate-limit and reconnect states are visible.
- Missing scope error prompts reauthorization.
- No Xero writeback exists in MVP.

---

## 17. Phase 9 - Bank Data Prototype

Goal:

Add read-only bank data to confirm what cash actually landed.

### 17.1 Provider Strategy

Evaluate:

- TrueLayer
- Yapily
- GoCardless Bank Account Data

Start with one provider only.

Decision criteria:

- UK business account coverage
- Sandbox quality
- AIS consent UX
- Balance and transaction reliability
- Webhook/polling support
- Pricing
- Developer speed
- Reconnection flow

### 17.2 Provider Interface

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

### 17.3 Matching Rules V1

Do not assume every credit is an invoice payment.

Features:

- Amount match
- Customer name similarity
- Counterparty name
- Invoice reference
- Payment reference
- Date proximity
- Known payer account
- Payment link event
- Manual confirmation

Matching output:

```ts
type PaymentMatchCandidate = {
  bankTransactionId: string;
  invoiceId?: string;
  promiseId?: string;
  confidence: number;
  matchingFactors: string[];
  requiresManualReview: boolean;
};
```

### 17.4 Forecast Interaction

Bank sync freshness affects forecast trust:

- Fresh bank sync: use actual balance normally.
- Stale bank sync: show warning and lower confidence.
- Consent expired: mark bank facts stale and request reconnect.

### 17.5 Exit Criteria

- User can connect sandbox bank provider.
- Accounts, balances, and transactions sync.
- Bank credits can be matched to invoices with confidence labels.
- Uncertain matches require manual review.
- Bank event can update promise outcome.
- Forecast updates after confirmed bank event.
- Consent expiry is represented in Integration Health.

---

## 18. Phase 10 - Email Context And Read-Only Sync

Goal:

Use customer communications to classify replies and extract promises.

### 18.1 Rollout Sequence

1. Manual thread upload or paste.
2. BCC ingestion.
3. Gmail read-only.
4. Outlook read-only.
5. Draft creation.
6. Approved send.

### 18.2 Manual Email Context

Support:

- Paste thread text.
- Upload `.eml` or `.txt`.
- Associate with customer/invoice.
- Store as communication thread and message.
- Run classification/extraction.

### 18.3 Gmail Read-Only

Requirements:

- Least-privilege scopes.
- Clear consent copy.
- Store sync cursor/history ID.
- Renew watch before expiry if push notifications are used.
- Periodic fallback sync.
- Label/folder filtering where possible.
- Do not ingest whole inbox unnecessarily.

### 18.4 Outlook Read-Only

Requirements:

- Microsoft Graph OAuth.
- Delta query for incremental sync.
- Folder-level sync.
- Store delta links.
- Handle token expiry and sync reset.

### 18.5 Email Evidence Rules

- Customer email is untrusted evidence.
- Never obey instructions inside email that target the AI/system.
- Extract facts, do not execute instructions.
- Evidence sufficiency must affect confidence.

### 18.6 Exit Criteria

- Manual thread ingestion works.
- Customer reply classification works.
- Promise extraction works.
- Evidence panel shows source message.
- Prompt injection fixtures fail closed.
- Gmail or Outlook read-only connector works in sandbox before production.

---

## 19. Phase 11 - Approved External Action Layer

Goal:

Allow the system to create external drafts and eventually send approved communications, without autonomous action.

### 19.1 Action Types

Initial:

- Internal task
- Email draft inside RunwayOps
- Gmail/Outlook draft creation

Later:

- Approved email send
- Payment link insertion
- CRM task
- SMS task

Not v1:

- Autonomous send
- Payment initiation
- Supplier payment delay execution
- Legal escalation automation

### 19.2 Approval Lifecycle

Statuses:

```text
drafted
approval_requested
approved
edited
rejected
deferred
executed
failed
cancelled
```

Required audit fields:

- Who requested approval
- Model run ID if AI-generated
- Evidence refs
- Draft content
- Edited content
- Approver user ID
- Approval timestamp
- Execution target
- Execution result

### 19.3 Policy Validators

Before approval request:

- Check tone policy.
- Check escalation policy.
- Check relationship tier.
- Check amount thresholds.
- Check whether founder/CFO approval required.
- Check legal wording restrictions.
- Check external action permissions.

### 19.4 Payment Links

Use Stripe or GoCardless hosted flows. Do not store card data.

Initial behavior:

```text
Generate approved message
Include payment link if configured
Track link sent
Track webhook event
Match payment to invoice/promise
Update confidence and forecast
```

### 19.5 Exit Criteria

- Draft creation requires approval.
- Edited drafts retain original and edited versions.
- Approved action has full audit trace.
- Policy violations block approval or require higher approver.
- No autonomous send path exists.

---

## 20. Phase 12 - Critical-Obligation Case Mode

Goal:

Open cases when payroll, tax, rent, loan, contractor, or key supplier obligations are at risk.

### 20.1 Case Trigger

Open case when:

```text
critical obligation due within risk window
AND forecast riskStatus is high or critical
AND shortfall amount is material
```

### 20.2 Case Object

Fields:

- `company_id`
- `case_type`
- `status`
- `opened_at`
- `closed_at`
- `trigger_forecast_id`
- `critical_obligation_id`
- `shortfall_amount_minor`
- `currency`
- `risk_status`
- `owner_user_id`
- `summary`

### 20.3 Case Timeline

Events:

- Case opened
- Forecast generated
- Shortfall computed
- Collectable invoices identified
- Drafts created
- Approval requested
- Bank event posted
- Customer reply received
- Promise updated
- Forecast replanned
- Case closed
- Case escalated

### 20.4 Supplier Timing Assistant

Only recommend. Do not execute.

Inputs:

- Supplier bill due date
- Supplier terms
- Relationship risk
- Grace period
- Company policy

Outputs:

- Suggested ask
- Risk explanation
- Draft message for approval
- Evidence refs

### 20.5 Exit Criteria

- Case auto-opens from deterministic risk.
- Case identifies top collectable invoices.
- Case drafts customer and supplier actions for approval.
- Case replans when bank/customer/accounting events arrive.
- Case closure writes memory and audit.
- UI shows case timeline clearly.

---

## 21. Phase 13 - Production Hardening

Goal:

Make the system safe enough for real pilot data.

### 21.1 Security

Implement:

- Tenant isolation tests
- RLS policies
- RBAC
- Secrets manager
- Encryption in transit
- Encryption at rest
- Token encryption
- Support access controls
- Audit logs for admin access
- Webhook signature verification
- Rate limiting
- Dependency scanning
- SAST

### 21.2 Compliance

Prepare:

- DPIA
- Data processing agreement
- Privacy notice
- Subprocessor list
- Retention schedule
- Deletion workflow
- Export workflow
- Incident response runbook
- Open banking consent copy
- Email OAuth consent copy

### 21.3 Observability

Track:

- API latency
- Error rate
- Sync success rate
- Sync lag
- Webhook latency
- Outbox backlog
- Temporal workflow failure rate
- Workflow age
- Queue backlog
- Model cost per company
- Model cost per action
- Classification accuracy
- Draft approval rate
- Forecast error
- Promise kept rate
- Payment after action rate

### 21.4 Reliability

Add:

- Dead-letter queues
- Retry policies
- Backoff
- Circuit breakers for providers
- Sync replay tooling
- Event replay tooling
- Backup and restore runbook
- Migration rollback plan

### 21.5 Exit Criteria

- Staging environment mirrors production architecture.
- Security tests pass.
- Data export and deletion workflows exist.
- Monitoring dashboards exist.
- Critical alerts exist.
- Runbooks exist for failed sync, stuck workflow, expired consent, model outage, provider outage, and database restore.

---

## 22. Phase 14 - Pilot Launch And Learning Loop

Goal:

Launch with a small number of companies and prove cash-action ROI.

### 22.1 Pilot ICP

Pick one narrow segment first. Candidate segments:

- Agencies
- Recruitment firms
- Consultancies
- Wholesalers
- Construction subcontractors
- Healthcare SMEs
- B2B SaaS vendors

Selection criteria:

- Recurring B2B invoices
- High overdue AR pain
- Existing Xero usage
- Willing to provide email context
- Has real critical obligations
- Founder/finance team can approve actions

### 22.2 Pilot Success Metrics

Product:

- Overdue cash collected
- DSO reduction
- Payment after action rate
- Promise kept-rate improvement
- Time saved per week
- Actions approved
- Messages sent
- Critical obligation risks avoided

AI:

- Reply classification accuracy
- Promise extraction accuracy
- Conditional promise detection accuracy
- Draft approval rate
- Human edit distance
- Hallucinated evidence rate

Operational:

- Sync success rate
- Webhook latency
- Temporal workflow failure rate
- API latency
- Cost per recommended action
- Cost per approved action

### 22.3 Pilot Operating Cadence

Weekly:

- Review action acceptance.
- Review false positives.
- Review forecast misses.
- Review broken promises.
- Review user edits to drafts.
- Review trust blockers.

Monthly:

- Recalibrate promise confidence.
- Revisit ICP.
- Revisit pricing.
- Revisit integration priorities.

### 22.4 Exit Criteria

- At least 3 pilot companies complete onboarding.
- Product produces daily useful actions.
- Users approve a meaningful percentage of recommendations.
- Forecast confidence improves over baseline spreadsheet/manual process.
- No unsafe external action occurs.
- Support burden is understood.

---

## 23. API Module Plan

### 23.1 API Principles

- API performs auth, validation, policy checks, command handling.
- API never performs long-running sync inline.
- API starts workflows or writes commands/events.
- API returns evidence and audit refs for recommendation surfaces.

### 23.2 Modules

```text
auth
companies
customers
invoices
obligations
forecasts
actions
approvals
promises
communications
integrations
audit
admin
```

### 23.3 Command Pattern

Use command handlers for mutations:

```ts
type CommandContext = {
  companyId: string;
  userId: string;
  roles: string[];
  requestId: string;
};
```

Examples:

- `CreateCriticalObligationCommand`
- `ApproveActionCommand`
- `RejectActionCommand`
- `EditDraftCommand`
- `StartXeroConnectionCommand`
- `RunDailyCashCycleCommand`
- `IngestManualEmailThreadCommand`

### 23.4 Query Pattern

Use query services for read models:

- `getDailyActions`
- `getLatestForecast`
- `getPromiseBoard`
- `getApprovalInbox`
- `getCustomerMemory`
- `getAuditTimeline`
- `getIntegrationHealth`

### 23.5 Exit Criteria

- All routes use Zod validation.
- All routes enforce company access.
- Mutations create audit events.
- Long-running jobs go through workflow/job queues.
- OpenAPI docs generate successfully.

---

## 24. Database Schema Detail

This section is not a full migration, but it gives future agents enough structure to implement.

### 24.1 Standard Columns

For most tables:

```text
id uuid primary key
company_id uuid not null references companies(id)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
deleted_at timestamptz null
```

### 24.2 Source Objects

```text
source_objects
  id uuid primary key
  company_id uuid not null
  provider text not null
  provider_object_type text not null
  provider_object_id text not null
  source_updated_at timestamptz null
  raw_payload jsonb not null
  raw_payload_hash text not null
  imported_at timestamptz not null
  unique(company_id, provider, provider_object_type, provider_object_id)
```

### 24.3 Integration Connections

```text
integration_connections
  id uuid primary key
  company_id uuid not null
  provider text not null
  status text not null
  display_name text null
  connected_by_user_id uuid null
  granted_scopes text[] null
  token_expires_at timestamptz null
  consent_expires_at timestamptz null
  last_successful_sync_at timestamptz null
  last_failed_sync_at timestamptz null
  reconnect_required boolean not null default false
```

### 24.4 Invoices

```text
invoices
  id uuid primary key
  company_id uuid not null
  customer_id uuid not null
  source_object_id uuid null
  invoice_number text not null
  issue_date date null
  due_date date null
  status text not null
  amount_total_minor bigint not null
  amount_due_minor bigint not null
  amount_paid_minor bigint not null
  currency char(3) not null
  last_source_updated_at timestamptz null
```

### 24.5 Promise Records

```text
promise_to_pay_records
  id uuid primary key
  company_id uuid not null
  customer_id uuid not null
  invoice_id uuid null
  source_message_id uuid null
  amount_promised_minor bigint null
  currency char(3) null
  promised_date date null
  promise_type text not null
  condition_text text null
  extracted_text text not null
  confidence_at_creation numeric(5,4) not null
  evidence_refs jsonb not null
  outcome text not null
  actual_payment_date date null
  actual_amount_received_minor bigint null
  created_by text not null
  approved_by_user_id uuid null
```

### 24.6 Forecasts

```text
cash_forecasts
  id uuid primary key
  company_id uuid not null
  generated_at timestamptz not null
  as_of_date date not null
  horizon_days int not null
  trigger_event_ids uuid[] not null
  cash_balance_minor bigint not null
  currency char(3) not null
  risk_status text not null
  shortfall_amount_minor bigint null
  forecast_json jsonb not null
  evidence_refs jsonb not null
```

### 24.7 Collection Actions

```text
collection_actions
  id uuid primary key
  company_id uuid not null
  customer_id uuid not null
  invoice_id uuid null
  promise_id uuid null
  action_type text not null
  status text not null
  priority_score numeric(12,4) not null
  expected_cash_impact_minor bigint not null
  currency char(3) not null
  probability_of_payment numeric(5,4) not null
  recommended_channel text not null
  recommended_tone text not null
  rationale text not null
  evidence_refs jsonb not null
```

### 24.8 Approval Requests

```text
approval_requests
  id uuid primary key
  company_id uuid not null
  action_id uuid null
  requested_by text not null
  assigned_to_user_id uuid null
  status text not null
  approval_type text not null
  risk_level text not null
  content_snapshot jsonb not null
  policy_checks jsonb not null
  evidence_refs jsonb not null
```

### 24.9 Audit Events

```text
audit_events
  id uuid primary key
  company_id uuid not null
  actor_type text not null
  actor_id text null
  event_type text not null
  aggregate_type text not null
  aggregate_id uuid not null
  summary text not null
  payload_json jsonb not null
  evidence_refs jsonb null
  created_at timestamptz not null default now()
```

---

## 25. Testing Strategy

### 25.1 Unit Tests

Required for:

- Money operations
- Invoice due-date calculations
- Promise confidence
- Forecast risk states
- Ranking formula
- Policy validators
- Evidence validators
- AI schema validators
- Integration normalizers

### 25.2 Golden Tests

Required for:

- Cash engine forecasts
- Daily action ranking
- Promise outcomes
- Critical-obligation case scenarios

Golden tests should snapshot meaningful domain output, not implementation details.

### 25.3 Integration Tests

Required for:

- Database migrations
- Repository methods
- Outbox publisher
- Temporal activities
- Xero sandbox/demo sync
- Bank provider sandbox
- Gmail/Outlook sandbox where available

### 25.4 Workflow Tests

Required for:

- DailyCashActionWorkflow
- CustomerReplyWorkflow
- PromiseMonitoringWorkflow
- CriticalObligationCaseWorkflow
- Approval waits
- Signals
- Retries
- Timeout escalation

### 25.5 E2E Tests

Required flows:

- User views daily actions.
- User opens evidence drawer.
- User edits and approves draft.
- Customer reply creates promise.
- Bank event closes promise.
- Forecast updates.
- Critical-obligation case opens.
- Integration Health shows sync issue.

### 25.6 Security Tests

Required:

- Cross-tenant read denied.
- Cross-tenant write denied.
- Unauthorized approval denied.
- Policy-blocked message cannot be approved by low-privilege user.
- Webhook signature failure rejected.
- Prompt injection fixture fails closed.

### 25.7 CI Gate

Every PR must pass:

```text
lint
typecheck
unit tests
cash-engine golden tests
db migration check
AI schema/eval smoke tests
workflow tests
security tenant tests
```

E2E may run on main or pre-release if too slow initially, but must run before pilot.

---

## 26. Observability And Operations

### 26.1 Logs

Every log should include:

- `request_id`
- `company_id` where safe
- `user_id` where safe
- `workflow_id`
- `sync_job_id`
- `provider`
- `event_type`

Avoid logging:

- Full email body
- Access tokens
- Refresh tokens
- Bank account numbers
- Personal data not needed for debugging

### 26.2 Metrics

Product metrics:

- Actions generated
- Actions approved
- Actions rejected
- Draft edit distance
- Payment after action
- Promise kept rate
- Forecast error
- Critical risks avoided

Operational metrics:

- API latency
- Error rate
- DB query latency
- Outbox backlog
- Temporal workflow failures
- Workflow age
- Sync lag
- Webhook latency
- Provider rate-limit hits
- Model cost
- Model latency

### 26.3 Alerts

Critical:

- Outbox backlog over threshold
- Temporal workflow failure spike
- Failed sync for production tenant over threshold
- Expired bank consent for active tenant
- Model error spike
- Cross-tenant access attempt
- Webhook signature failures spike

### 26.4 Runbooks

Create runbooks for:

- Xero sync failed
- Xero reconnect required
- Bank consent expired
- Gmail watch expired
- Outlook delta token reset
- Stuck Temporal workflow
- Failed outbox event
- Model provider outage
- Incorrect forecast report
- Data deletion request
- Security incident

---

## 27. Data Protection And Compliance

### 27.1 UK GDPR Principles

Build around:

- Lawfulness, fairness, transparency
- Purpose limitation
- Data minimisation
- Accuracy
- Storage limitation
- Integrity and confidentiality
- Accountability

### 27.2 DPIA

RunwayOps likely needs a DPIA because it processes sensitive business communications, financial data, behavioral predictions, and AI-assisted recommendations.

The DPIA should cover:

- Data categories
- Processing purposes
- Lawful basis
- Data subjects
- Risks
- Mitigations
- Retention
- Third-party processors
- International transfers
- Human review and approval controls

### 27.3 Retention

Define retention for:

- Accounting facts
- Raw source payloads
- Email messages
- Attachments
- Model inputs/outputs
- Audit events
- Forecast versions
- Deleted users
- Disconnected integrations

### 27.4 Data Export And Deletion

Build:

- Company export
- User export where applicable
- Customer communication deletion workflow
- Integration disconnect workflow
- Token deletion
- Backup deletion policy or "beyond use" policy

### 27.5 AI Data Policy

Rules:

- Do not train cross-tenant models on customer data.
- Do not send unnecessary data to model providers.
- Redact where possible.
- Log model metadata and cost, not full sensitive payloads unless needed and permitted.
- Keep eval fixtures synthetic or explicitly consented.

---

## 28. Integration Constraints Summary

### 28.1 Xero

- OAuth 2.0 required.
- Granular scopes are current direction.
- New app/scopes may require explicit reauthorization.
- Rate limits require queued sync and backoff.
- API data should not be used to train AI/ML models.

### 28.2 QuickBooks

- Defer until after Xero and bank data.
- Request scopes incrementally.
- Webhooks can notify about data changes.
- Minor versions matter; pin one supported minor version once implementation starts.

### 28.3 Bank Data

- Read-only AIS only in v1.
- Explicit consent required.
- Consent expiry affects product trust.
- Matching must be confidence-based and reviewable.

### 28.4 Gmail

- Use narrowest scopes.
- `gmail.readonly` and `gmail.compose` are restricted.
- Push watch expires and must be renewed.
- Fall back to periodic sync because notifications can be delayed/dropped.

### 28.5 Outlook

- Use Microsoft Graph delta queries.
- Store delta links.
- Handle resets and token expiration.
- Sync per folder if needed.

### 28.6 Stripe And GoCardless

- Use hosted payment links.
- Do not store card data.
- Webhooks confirm payment lifecycle.
- Payment link insertion requires human-approved message.

---

## 29. Product Backlog: Explicitly Later

Do not build until after pilot signal:

- QuickBooks
- Sage
- FreeAgent
- NetSuite
- Sage Intacct
- Full AP automation
- Full cash application
- Payment initiation
- Autonomous supplier negotiation
- SMS automation
- Voice collections
- Invoice financing
- Legal collections
- Cross-tenant ML training
- Advanced semantic memory
- Accountant/bookkeeper multi-client workspace
- HubSpot/Salesforce context

---

## 30. Future Agent Execution Rules

Future agents should follow these rules:

1. Read `New Spec.md` and this file before implementing.
2. Check the current repo structure before creating new files.
3. Preserve existing user changes.
4. Prefer existing local patterns if code already exists.
5. Implement phase by phase.
6. Do not skip exit criteria.
7. Do not introduce autonomous sending or payment initiation.
8. Do not put LLM calls in deterministic cash logic.
9. Do not put external I/O in Temporal workflow code.
10. Do not store money as floating point.
11. Do not ingest whole inboxes by default.
12. Do not add broad integrations before the daily cash loop works.
13. When a feature is missing, diagnose registration/discovery/install state first.
14. Add tests proportionate to financial and safety risk.
15. Every recommendation must carry evidence refs.
16. Every external action must require approval.
17. Every state mutation must be auditable.

---

## 31. First Concrete Build Slice

The first implementation slice should be small but complete:

```text
Seed demo company
  -> invoices
  -> customers
  -> payments
  -> obligations
  -> manual email reply

Run deterministic cash engine
  -> forecast
  -> risk state

Run next-best-action ranking
  -> top 5 actions

Run AI promise classifier on manual reply
  -> structured promise
  -> confidence

Create draft
  -> approval request

Approve/edit/reject in UI
  -> audit event

Replay bank event
  -> promise outcome
  -> updated memory
  -> updated forecast
```

This slice proves the product thesis before expensive integrations.

### 31.1 First Slice Files

Likely files:

```text
packages/domain/src/money.ts
packages/domain/src/invoice.ts
packages/domain/src/promise.ts
packages/domain/src/forecast.ts
packages/domain/src/actions.ts
packages/cash-engine/src/forecast.ts
packages/cash-engine/src/ranking.ts
packages/cash-engine/tests/fixtures/demo-company.ts
packages/db/src/schema/*.ts
apps/api/src/modules/actions/*
apps/api/src/modules/approvals/*
apps/workers/src/temporal/workflows/daily-cash-action.ts
apps/web/app/actions/page.tsx
apps/web/app/approvals/page.tsx
```

### 31.2 First Slice Exit Criteria

- A seeded company has visible daily actions.
- A conditional promise lowers cash confidence.
- Payroll/rent/tax obligation risk is visible.
- A draft is generated but not sent.
- A user can edit and approve/reject.
- A bank event updates promise outcome.
- Audit timeline explains the full chain.

---

## 32. Source-Backed Constraints

These references informed constraints in this plan:

- Temporal workflows replay from event history and must be deterministic; external API calls, DB queries, LLM calls, and file I/O belong in Activities: https://docs.temporal.io/workflows and https://docs.temporal.io/workflow-definition
- AWS transactional outbox pattern addresses dual-write inconsistency between database writes and event publication: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
- Xero FAQ describes granular scopes, rate-limit considerations, and 2026 platform terms including API data training restrictions: https://developer.xero.com/faq
- Gmail recommends narrow scopes and marks broad read/compose scopes as sensitive/restricted: https://developers.google.com/workspace/gmail/api/auth/scopes
- Gmail push watches must be renewed at least every 7 days, with daily renewal recommended: https://developers.google.com/workspace/gmail/api/guides/push
- Microsoft Graph delta query supports incremental mail sync: https://learn.microsoft.com/en-us/graph/delta-query-messages
- Open Banking AIS requires explicit consent: https://standards.openbanking.org.uk/customer-experience-guidelines/account-information-services/v3-1-0/
- GoCardless Bank Account Data provides balances, transactions, and up to 90 days continuous access: https://developer.gocardless.com/bank-account-data/overview
- TrueLayer Data API exposes account, transaction, balance, and regular payment data: https://docs.truelayer.com/docs/data-api-basics
- Postgres row-level security defaults to deny when enabled without policies: https://www.postgresql.org/docs/17/ddl-rowsecurity.html
- Postgres `numeric` is appropriate when exactness matters for monetary amounts: https://www.postgresql.org/docs/15/datatype-numeric.html
- OpenAI Structured Outputs can enforce JSON schema adherence for model outputs: https://platform.openai.com/docs/guides/structured-outputs
- OpenAI prompt caching rewards stable prompt prefixes and can reduce latency/cost: https://platform.openai.com/docs/guides/prompt-caching
- ICO UK GDPR principles include lawfulness, purpose limitation, data minimisation, storage limitation, security, and accountability: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/
- ICO DPIA guidance should be used for risk assessment around high-risk processing: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/

---

## 33. Final Build Standard

The product is successful only if a finance user can trust the chain:

```text
Here are the facts.
Here is the forecast.
Here is what is uncertain.
Here is the action we recommend.
Here is the evidence.
Here is the draft.
Please approve, edit, reject, or defer.
Here is what happened after.
Here is what we learned.
```

If that chain breaks, pause feature work and fix the foundation.
