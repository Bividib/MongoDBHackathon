# RunwayOps — Judge Q&A

Answers to the questions we expect from judges. Each answer is short enough
to deliver on stage and grounded in something visible in the cockpit.

---

## Product framing

### "Is this just an accounting dashboard?"

> "No. Accounting dashboards show data. RunwayOps opens a Payroll Risk Case,
> coordinates work across six specialist agents, retrieves evidence, drafts
> approvals, reacts to events, replans the forecast and payment run, writes
> an audit log, generates a founder briefing, and stores memory for future
> cases. The core object is a case, not a dashboard."

### "Is this just AI email chasing?"

> "No. The email drafts are one output. The core is event-driven cash-timing
> coordination: forecast scenarios, supplier timing, approvals, audit, and
> memory. The same case would still produce value if no email was ever sent."

### "Why payroll specifically?"

> "Payroll is non-deferrable, deterministic, and emotional. Founders feel
> payroll risk before they feel any other liquidity issue. It is the
> sharpest entry point for cash-timing intelligence in the SME segment."

### "Who is the user?"

> "Founders, owner-operators, and finance/operations leads at 5–100 person
> SMEs. The demo persona is Emma Marlow, founder of a 12-person design
> agency. The system also supports a finance/ops lead like Jules Finch."

---

## MongoDB

### "Where is MongoDB indispensable?"

> "MongoDB Atlas is the durable context engine. It stores the compact live
> case, event stream, task coordination, retrieval attempts, memory chunks,
> forecast versions, payment plan versions, decision logs, artifacts, and
> checkpoints. Atlas Search and Vector Search retrieve evidence;
> aggregations compute risk and deltas; `event_inbox` wakes the workflow.
> Without Atlas, this is a static dashboard or an in-memory LLM demo with no
> durable state, audit, or learning."

### "Why MongoDB and not Postgres?"

> "Three reasons. First, the workload is document-shaped: events, tasks,
> retrieval attempts, forecasts, plans, drafts, briefings, memory cards —
> none of which are relationally normalised. Second, Atlas combines
> operational storage, full-text search, vector search, time-series, and
> change streams in one cluster, so we did not have to glue three systems
> together for a one-day build. Third, schema validation gave us strong
> invariants on `event_inbox`, `cases`, and `payment_run_plans` while
> keeping unbounded logs flexible."

### "Walk us through your MongoDB modelling."

> "We separate generic agentic collections — `cases`, `events`, `tasks`,
> `agent_runs`, `retrieval_attempts`, `memory_chunks`, `artifacts`,
> `checkpoints` — from domain collections like `invoices`,
> `cashflow_forecasts`, and `payment_run_plans`. The `cases` document holds
> compact live state and recent events as extended references; everything
> unbounded lives in its own collection. We use schema validation on core
> workflow documents, TTL indexes for `agent_scratch` and `retrieval_cache`,
> and a time-series collection for `bank_transactions_ts`."

### "Why `event_inbox` instead of triggering on domain collections?"

> "Triggers on time-series collections are not supported, and triggers on
> forecasts or payment plans would couple wakeups to internal writes.
> `event_inbox` is small, idempotent via a unique `(company_id, event_key)`
> index, and purpose-built for wakeups. One Atlas Trigger watches
> `event_inbox` inserts. If the trigger is unreliable, the UI calls
> `/api/orchestrate` directly after the insert — same data path."

### "How does your retrieval work?"

> "It is hybrid by situation. For Northstar's reply, we run a structured
> lookup on the invoice and customer, an Atlas Search keyword pass for
> 'Friday', 'PO re-approved', and the PO number, and a Vector Search pass
> for conditional-promise behaviour and PO-dependence on `memory_chunks`.
> An optional rerank narrows top-20 to top-5. We store the entire attempt —
> rewritten query, strategy, filters, top results, and the agent's
> sufficiency judgement — in `retrieval_attempts`."

---

## Agentic / AI

### "What is agentic here?"

> "The maths is deterministic on purpose because payroll risk must be
> explainable. The agentic layer is everything around the maths: deciding
> which event matters, rewriting retrieval queries, evaluating evidence
> sufficiency, classifying ambiguity, drafting actions, replanning under
> uncertainty, writing audit summaries, generating a founder briefing, and
> storing memory."

### "Why six agents and not eleven?"

> "Two reasons. First, six is the natural decomposition of the work: route,
> forecast, retrieve, draft, plan, audit. Adding more agents creates fake
> autonomy. Second, every agent must write durable state to MongoDB. Six
> agents leave a clean, readable agent_runs trace; eleven would be noise."

### "Is the LLM doing the cash maths?"

> "No. Cash arithmetic, due-date comparison, supplier grace-day rules,
> scenario totals, forecast versioning, and idempotency keys are
> deterministic TypeScript. LLMs only handle classification, drafting,
> audit wording, briefing transcript, and memory wording. We have a
> `npm run check-maths` script that validates the deterministic outputs."

### "How do you handle ambiguity?"

> "We classify with structured JSON output and a confidence score. If
> confidence is low or evidence is insufficient, the system does not move
> the risk state. Northstar's reply scores 0.48 confidence, classified as
> a conditional promise — risk stays HIGH and we draft a request for
> explicit PO/payment confirmation."

### "Why this AI provider mix?"

> "Fireworks for low-latency structured outputs (classification, drafting,
> audit, briefing wording). Voyage embeddings as an optional upgrade.
> ElevenLabs for the founder briefing voice only — no customer voice calls.
> All three have cached fallbacks because demo reliability beats fidelity."

---

## AWS

### "How is AWS used?"

> "AWS is the visible event layer. API Gateway and Lambda ingest the
> simulated customer reply. EventBridge Scheduler fires the timed Harbour
> Labs bank transaction. S3 stores the founder briefing MP3 and fixture
> artifacts. The local Next.js routes are a one-line fallback if any AWS
> service is flaky on the day."

### "Why not Open Banking?"

> "The product architecture supports bank feeds, but the hackathon
> differentiator is event-driven agentic coordination, not OAuth plumbing.
> Real Open Banking adds OAuth setup, redirect URIs, consent screens,
> sandbox credentials, token exchange, account selection, and error states
> — none of which is the wow moment. Production would connect TrueLayer or
> Plaid, plus Xero or QuickBooks, plus Gmail or Outlook for email."

### "What about CloudWatch / observability?"

> "We use `agent_runs` and the Atlas Live State panel as the primary
> observability surface for the demo because they are domain-meaningful.
> CloudWatch logs are configured but optional and out of frame on stage."

---

## Reliability

### "Can it survive failure?"

> "Yes. The current case, events, tasks, forecasts, plans, agent runs,
> retrieval attempts, checkpoints, and decisions are stored in MongoDB. If
> the worker dies mid-run, it can resume from the latest durable state
> rather than process memory. The seed and reset scripts let us restore the
> demo in under thirty seconds."

### "What if Fireworks goes down during the demo?"

> "We fall back to cached structured outputs from `data/expected_outputs/`
> and deterministic templates for drafts. The Atlas Live State panel still
> shows the same `agent_runs`, `retrieval_attempts`, and forecast version
> changes — the story does not break."

### "What if the Atlas Trigger does not fire?"

> "The UI inserts the event into `event_inbox` and calls `/api/orchestrate`
> directly. The end-state is identical — same documents, same writes, same
> narration."

### "What if ElevenLabs is unavailable?"

> "Cached MP3 in `data/cached_audio/` plays instead. If the cache is missing
> we read the briefing transcript on stage and the panel shows the text
> output."

---

## Safety, scope, ethics

### "Is this financial advice?"

> "No. RunwayOps does not recommend financial products, loans, investments,
> or tax positions. It does operational cash timing and approval-ready
> workflow coordination. Humans approve every customer communication and
> every payment timing change."

### "Does it move money or send messages?"

> "No. Every draft is labelled 'Pending approval. RunwayOps will not send
> this without human approval.' We do not integrate any payments rail in
> this build, and email send via SES is optional and only to a verified
> demo address."

### "What about regulated jurisdictions?"

> "RunwayOps is positioned as operational tooling, not regulated financial
> advice. It does not handle tax positions, lending, investment, or
> consumer-facing financial products. The product surface stays inside
> 'cash-timing operations' on purpose."

---

## Hackathon track positioning

### "Which track are you in?"

> "Primary: Prolonged Coordination — one Payroll Risk Case persists across
> scheduler, customer reply, bank transaction, forecast versions, payment
> plan versions, approvals, briefings, and memory writes.
>
> Strong secondary: Adaptive Retrieval — the system rewrites queries,
> chooses retrieval strategy by situation, stores every attempt, and judges
> evidence sufficiency.
>
> Supporting: Multi-Agent Collaboration — six specialist workers coordinate
> through MongoDB documents, not by passing long prompts."

### "What is the wow moment?"

> "The replan. The customer reply does not move the risk. The bank event
> moves it from HIGH to WATCH — not SAFE — because Northstar's promise is
> still conditional. You can read every reason in the audit drawer, every
> document in the Atlas Live State, and the founder gets the briefing in
> one paragraph. That whole cascade fires in seconds and is reproducible."

### "What would you build next?"

> "Real Open Banking via TrueLayer or Plaid for live transactions. Xero
> and QuickBooks integration for invoice and bill ingestion. Gmail and
> Outlook for real customer email threads. A second case template
> (supplier-shock, VAT crunch). And the broader CashPilot product family
> built around the same case and memory model."
