# RunwayOps — 3-minute Demo Script

This is the stage script for the live demo. It runs in exactly three minutes
and assumes the cockpit is already loaded, MongoDB Atlas is seeded, and all
fallback modes are verified.

Demo company: **Marlow & Finch Creative Ltd** (12-person design agency).
Demo date: **Monday 4 May 2026**. Payroll deadline: **Friday 8 May 2026**.

> Spoken narration is in `>` blocks. UI cues and visible state are in code
> blocks. Every visible number is deterministic and pre-validated by
> `npm run check-maths` and `npm run check:data`.

---

## Pre-flight (off stage)

```text
1. npm run reset && npm run seed
2. npm run check:db
3. npm run check:data
4. Open the cockpit at http://localhost:3000.
5. Verify the baseline view: HIGH, £8,400, £11,200 payroll, £5,200 gap, plan v1.
6. Open the Atlas Live State panel.
7. Have the cached founder briefing MP3 in data/cached_audio ready.
8. Toggle: "Start live bank feed" should arm a 30-45 second timer.
```

---

## 0:00 – 0:20 — Case opens

Show the top Risk Command Bar.

> "This is Marlow & Finch Creative, a 12-person design agency. They are not
> failing as a business. Their cash timing is broken. They have £8,400 today,
> payroll of £11,200 due Friday, and Supplier X due Thursday. RunwayOps has
> opened a Payroll Risk Case."

Visible:

```text
Payroll Risk Case
Status:           HIGH
Cash today:       £8,400
Payroll due:      £11,200 (Fri 8 May)
Projected gap:    £5,200
Time to payroll:  4 days
Plan:             v1
```

---

## 0:20 – 0:45 — Root cause (deterministic forecast)

Open the Main Case Board scenario card.

> "The Forecast Agent does deterministic cash timing. If Supplier X is paid
> and no invoices land, Friday is short by £5,200. If Supplier X is held, the
> gap drops to £2,800, but payroll still does not clear. Northstar paying
> Friday would close the gap, but their reply will tell us whether that is
> guaranteed."

Visible:

```text
Pay Supplier X + no collections:        -£5,200   (HIGH)
Hold Supplier X + no collections:       -£2,800   (HIGH)
Hold Supplier X + Northstar pays Friday: +£2,000  (WATCH, conditional)
```

---

## 0:45 – 1:15 — Adaptive retrieval

Open the Northstar evidence panel.

> "The Customer Memory Agent identifies the highest-leverage invoices.
> Northstar is the main dependency, but previous payment memory says their
> promises are conditional when PO approval is not explicit. Notice the
> retrieval: it rewrites the query, runs hybrid search across the invoice,
> the email thread, payment history, and a memory card, then reranks. Every
> attempt is stored in MongoDB."

Visible retrieval trace:

```text
Query (rewritten): Northstar Studio INV-1042 Friday payment promise
                   PO re-approved prior reliability
Strategy:          hybrid_search_then_rerank
Results:
  - INV-1042 exact match
  - Northstar email thread
  - payment history
  - memory card: PO-dependent promises
Sufficiency:       sufficient
```

---

## 1:15 – 1:40 — Drafts and approval queue

Open the Drafts panel.

> "RunwayOps does not send messages or move money. It prepares
> approval-ready actions. A Northstar confirmation email asking for explicit
> PO and payment confirmation. A Blue Finch formal reminder. A Supplier X
> hold inside their five-day grace window. Every draft is pending human
> approval."

Visible:

```text
[ pending approval ]  Northstar confirmation email
[ pending approval ]  Blue Finch formal reminder
[ pending approval ]  Supplier X hold within 5-day grace window
```

---

## 1:40 – 2:10 — Customer A reply (manual event)

Click `Simulate Customer A Reply`.

> "Now Northstar replies: 'Should be able to pay Friday once the PO is
> re-approved.' RunwayOps does not count that as cash. It classifies it as a
> conditional promise, lowers confidence, and asks for explicit confirmation."

Visible:

```text
event_inbox        +1   email.received
events             +1   reply.classified
retrieval_attempts +1
agent_runs         +4

Classification:   conditional_promise
Guaranteed cash:  no
Confidence:       0.48
Action:           ask for PO/payment confirmation
Forecast:         v1 -> v2
Risk:             HIGH (unchanged)
```

---

## 2:10 – 2:30 — Timed bank event

The timed event arrives while the narration continues.

> "A live bank-feed event arrives: Harbour Labs has paid a £1,200 retainer.
> MongoDB receives the event, the workflow wakes, and the forecast changes."

Event feed shows:

```text
bank.transaction.posted   +£1,200 Harbour Labs retainer
forecast.v3_created
payment_plan.v3_created
```

Visible:

```text
Cash:           £8,400  ->  £9,600
Forecast:       v2 -> v3
Risk:           HIGH -> WATCH  (not SAFE)
Supplier X:     full delay -> conditional hold
```

State transitions explained in the Audit / Why drawer:

```text
Why WATCH and not SAFE?
- Northstar payment is still conditional on PO re-approval.
- If Northstar slips, payroll is short by £1,600 even with Supplier X held.
Why conditional hold for Supplier X?
- Risk improved but not cleared. Hold within written 5-day grace,
  release after Northstar payment confirms.
```

---

## 2:30 – 2:45 — MongoDB Atlas Live State

Open the right-hand Atlas Live State panel.

> "MongoDB is not storing chat history. It is the live state layer: events,
> tasks, retrieval attempts, agent runs, forecasts, payment plans, audit
> logs, artifacts, and memory."

Visible (latest documents):

```text
event_inbox          +2   evt_bank_harbour_001
retrieval_attempts   +1   ret_customer_a_reply_001
agent_runs           +6
cashflow_forecasts   v2 -> v3   forecast_case_0508_v3
payment_run_plans    v2 -> v3   plan_case_0508_v3
decision_log         +2   decision_plan_change_after_harbour
founder_briefings    +1   briefing_case_0508_v3
memory_cards         +1   mem_northstar_po_conditional_promises
artifacts            +1   audio: briefings/case_0508_v3.mp3
```

---

## 2:45 – 3:00 — Founder briefing and memory

Play (or display) the founder briefing.

> "The founder gets a short action briefing, and the system writes memory for
> the next case."

Briefing transcript:

```text
Payroll risk is now watch, not cleared. Harbour Labs paid £1,200.
Northstar says they should be able to pay Friday, but payment depends on
PO re-approval. Approve the Northstar confirmation email, hold Supplier X
until Friday morning, and keep chasing Blue Finch. If Northstar slips,
payroll remains short by £1,600.
```

Memory card:

```text
Northstar promises are conditional unless PO confirmation is explicit.
Use direct finance-team wording with PO reference.
Do not treat "should be able to pay" as guaranteed cash.
```

Next Case Preview:

```text
If Northstar appears in a future Payroll Risk Case:
  - treat "should be able to pay" as conditional
  - require PO confirmation
  - use direct finance-team wording
```

---

## Closing line

> "One case. Two customers. One supplier lever. One conditional promise. One
> bank event. One live replan. MongoDB Atlas as the durable context engine.
> That is RunwayOps."

---

## Reset between runs

```bash
npm run reset && npm run seed
```

Verify in the cockpit that:

```text
Status:        HIGH
Cash:          £8,400
Forecast:      v1
Plan:          v1
Approvals:     3 pending
event_inbox:   1 (the scheduler payroll scan)
```

---

## Failure-mode cheatsheet

| If this breaks | Use this instead |
|---|---|
| Atlas Trigger | The UI inserts event_inbox and calls `/api/orchestrate` directly. Still narrate "MongoDB receives the event, the workflow wakes." |
| EventBridge Scheduler | The local timer fires the same `/api/events/bank-transaction` route. Still call it "live bank feed". |
| Fireworks classification | Cached `retrieval_attempts_expected.json` and template draft. |
| Fireworks drafting | Deterministic template emails from `data/fixtures/baseline_collection_drafts.json`. |
| ElevenLabs voice | Play cached MP3 in `data/cached_audio/`. If missing, read transcript on stage. |
| UI panel error | Open MongoDB Compass / Atlas UI on the same data. |
