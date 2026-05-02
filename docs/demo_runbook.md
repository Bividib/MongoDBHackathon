# RunwayOps — Demo Runbook

This is the operational document for running the live RunwayOps demo. It is
designed to be followed verbatim under stage pressure. It assumes two
people on the day (one operator, one presenter) but is single-operator
runnable.

| | |
|---|---|
| Demo length | 3 minutes |
| Demo company | Marlow & Finch Creative Ltd |
| Demo date in fixtures | Monday 4 May 2026 |
| Payroll deadline in fixtures | Friday 8 May 2026 |
| Currency | GBP |
| AWS region | eu-west-2 |

If anything in this document conflicts with `docs/demo_script.md`, the
demo script wins (it is the on-stage narration). This runbook is the
operator's playbook.

---

## 1. Roles

```text
Operator    Drives the cockpit. Owns reset/seed, dev server, click cues,
            and fallback decisions. Sits at the keyboard.
Presenter   Delivers the narration from docs/demo_script.md. Watches the
            audience and the clock. Cues the operator with prearranged
            phrases.
```

If running solo, the operator is also the presenter and uses a checklist
on a second screen or printout.

Cue phrases (presenter -> operator):

```text
"Open the case board."        -> click Main Case Board scenario card
"Show the retrieval."         -> open Northstar evidence panel
"Now Northstar replies."      -> click Simulate Customer A Reply
"Live bank feed."             -> click Start Live Bank Feed
"Open Atlas Live State."      -> focus right panel
"Play the briefing."          -> click play on FounderBriefing audio
```

---

## 2. Pre-demo setup (T-30 minutes)

### 2.1 Hardware and network

```text
1. One laptop on stable wifi.
2. Mobile hotspot ready as backup.
3. HDMI/USB-C dongle tested with the stage screen.
4. Power adapter plugged in. Battery >= 60%.
5. Audio output tested (founder briefing MP3 must play through stage PA).
6. External display mirroring on, full screen browser.
```

### 2.2 Repo and dependencies

```bash
cd /Users/abhinavgupta/Desktop/MongoDB
git status
git pull --ff-only
npm install
```

Expected:

```text
working tree clean (or only the operator's known WIP)
npm install completes with no peer-dep errors
```

### 2.3 Environment variables

`.env.local` must exist with at minimum a MongoDB URI. Other keys are
optional but enable the live path:

```text
MONGO_DB_CONNECTION   required for the demo
MONGODB_URI           accepted alias
MONGODB_DB            runwayops_demo
FIREWORKS_API_KEY     optional (cached fallback works)
ELEVENLABS_API_KEY    optional (cached MP3 works)
AWS_REGION            optional (eu-west-2)
DEMO_MODE             true
DEMO_COMPANY_ID       cmp_marlow_finch
DEMO_CASE_ID          case_payroll_2026_05_08
```

Verify keys are loaded:

```bash
npm run check:env
```

### 2.4 Provider checks

```bash
npm run check:db          # MongoDB Atlas reachable
npm run check:providers   # Fireworks + ElevenLabs auth
npm run check:data        # 37 JSON files validated
```

Acceptable outcomes:

```text
check:db          MUST PASS.
check:providers   FAIL is acceptable; cached fallbacks will be used.
check:data        MUST PASS. If it fails, do not start the demo.
```

---

## 3. Reset and seed MongoDB

### 3.1 Full reset (use before every fresh rehearsal or live demo)

```bash
npm run reset
npm run seed
```

Expected `npm run seed` output (counts may vary slightly with fixture
revisions but the headline collections must be present):

```text
Seeding RunwayOps demo data...
  companies:                1
  users:                    2
  customers:                3
  invoices:                 3
  supplier_bills:           1
  supplier_terms:           1
  payroll_obligations:      1
  bank_transactions_ts:     N
  email_threads:            1
  evidence_chunks_seed:     N
  memory_cards_seed:        N
  cases:                    1   (case_payroll_2026_05_08, status active)
  event_inbox:              1   (the scheduler payroll scan)
Seed complete.
```

### 3.2 Quick reset (between rehearsal runs only)

If the seed script supports a partial reset, prefer it. Otherwise rerun
both commands. The full reset/seed should complete in under 30 seconds.

### 3.3 If reset fails

```text
1. Check MongoDB Atlas IP allowlist — your current IP must be allowed.
2. Run npm run check:db. If it fails, the URI is wrong or the cluster
   is paused. Resume the cluster from the Atlas UI.
3. If seed fails after a successful check:db, drop the
   runwayops_demo database from the Atlas UI and re-run npm run seed.
```

---

## 4. Start the dev server

```bash
npm run dev
```

Expected:

```text
- Next.js dev server boots on http://localhost:3000
- No "Module not found" or unhandled promise warnings
- The cockpit page renders within 5 seconds
```

Open the cockpit in a chromium-based browser (Chrome, Edge, or Brave) at:

```
http://localhost:3000
```

Hide bookmarks bar, set zoom to 100%, full screen.

---

## 5. Pre-demo cockpit verification (T-5 minutes)

Before going live, the baseline view must show **exactly** these values.
If anything below is wrong, reset and seed again.

### 5.1 Top Risk Command Bar

```text
Status:           HIGH
Cash today:       £8,400
Payroll due:      £11,200 (Fri 8 May)
Projected gap:    £5,200
Time to payroll:  4 days
Plan:             v1
Approvals:        3 pending
```

### 5.2 Event Feed (most recent at top)

```text
scheduler.payroll_scan
case.opened
forecast.v1_created
drafts.created
payment_plan.v1_created
```

### 5.3 Main Case Board

```text
Pay Supplier X + no collections:        -£5,200   (HIGH)
Hold Supplier X + no collections:       -£2,800   (HIGH)
Hold Supplier X + Northstar pays Friday: +£2,000  (WATCH, conditional)
```

### 5.4 Drafts panel

```text
[ pending approval ]  Northstar confirmation email
[ pending approval ]  Blue Finch formal reminder
[ pending approval ]  Supplier X hold within 5-day grace window
```

### 5.5 MongoDB Atlas Live State

```text
event_inbox          1 doc    (scheduler payroll scan)
events               5 docs
tasks                3 docs   (the three pending approvals)
agent_runs           >= 4
retrieval_attempts   >= 1
cashflow_forecasts   v1
payment_run_plans    v1
memory_chunks        seeded
```

### 5.6 Founder Briefing panel

```text
Status: not generated yet
```

### 5.7 Memory Card panel

```text
Status: empty (the case is still open)
```

If all seven sections match, **green-light to start**.

---

## 6. The 3-minute click-by-click flow

Each beat below has a target time, the operator action, the exact UI state
the audience should see immediately after, and the MongoDB documents
that should change. Everything is deterministic and pre-validated.

### Beat 1 — 0:00 to 0:20 — Case opens

```text
Action:        none. The cockpit is already on baseline.
Operator cue:  ensure full screen, mouse off the screen.
Presenter:     reads the 0:00–0:20 narration from docs/demo_script.md.
Expected UI:   matches section 5 above.
Mongo delta:   none.
```

### Beat 2 — 0:20 to 0:45 — Root cause (deterministic forecast)

```text
Action:        click the "scenarios" tab on Main Case Board.
Expected UI:
  Three scenarios visible with the exact totals from 5.3.
  Highlight band on the WATCH scenario.
Mongo delta:   none.
```

### Beat 3 — 0:45 to 1:15 — Adaptive retrieval

```text
Action:        click Northstar row in the customer panel.
Expected UI:
  Retrieval trace card appears showing:
    Query (rewritten): Northstar Studio INV-1042 Friday payment promise
                       PO re-approved prior reliability
    Strategy:          hybrid_search_then_rerank
    Top results: invoice INV-1042, email thread, payment history,
                 memory card "PO-dependent promises"
    Sufficiency:       sufficient
Mongo delta:   none new (this is the seeded retrieval_attempt).
```

### Beat 4 — 1:15 to 1:40 — Drafts and approval queue

```text
Action:        scroll to or focus the Drafts panel (no clicks if already
               visible).
Expected UI:
  Three drafts visible, all labelled "Pending approval".
Mongo delta:   none.
```

### Beat 5 — 1:40 to 2:10 — Customer A reply (manual event)

```text
Action:        click the "Simulate Customer A Reply" button.
Expected UI within ~2 seconds:
  Event feed gains:
    email.received
    reply.classified
    forecast.v2_created
    payment_plan.v2_created
  Top bar:
    Status:        HIGH (unchanged)
    Plan:          v2
  Classification card:
    Classification:   conditional_promise
    Guaranteed cash:  no
    Confidence:       0.48
    Action:           ask for PO/payment confirmation
  Atlas Live State:
    event_inbox        +1
    events             +1
    retrieval_attempts +1
    agent_runs         +4
    cashflow_forecasts v1 -> v2
Operator note:  if the UI does not update within 5 seconds, see Section 7.
```

### Beat 6 — 2:10 to 2:30 — Timed bank event

```text
Action:        click "Start Live Bank Feed" at 1:35–1:40 of the demo
               (i.e. *during* Beat 5) so the timer fires while the
               presenter is finishing the customer-reply narration.
Expected UI ~30–45s after click:
  Event feed gains:
    bank.transaction.posted   +£1,200 Harbour Labs retainer
    forecast.v3_created
    payment_plan.v3_created
    decision_log entry
    briefing.generated
    memory_card.written
  Top bar:
    Cash:          £8,400 -> £9,600
    Status:        HIGH -> WATCH (highlight transition)
    Plan:          v3
  Main Case Board:
    Supplier X recommendation: full delay -> conditional hold
  Audit / Why drawer auto-opens with:
    Why WATCH and not SAFE?
    - Northstar payment is still conditional on PO re-approval.
    - If Northstar slips, payroll is short by £1,600 even with
      Supplier X held.
  Atlas Live State:
    event_inbox        +1
    events             +>=3
    agent_runs         +>=6
    cashflow_forecasts v2 -> v3
    payment_run_plans  v2 -> v3
    decision_log       +>=1
    founder_briefings  +1
    memory_cards       +1
    artifacts          +1
Operator note:  if the timer does not fire by 2:15, manually click
                "Trigger Bank Event" or POST to /api/events/bank-transaction.
```

### Beat 7 — 2:30 to 2:45 — MongoDB Atlas Live State

```text
Action:        focus or scroll the right-hand Atlas Live State panel.
Expected UI:
  All counts above are visible.
  Each row shows: collection | latest doc id | change | why it matters | timestamp.
Mongo delta:   none new.
```

### Beat 8 — 2:45 to 3:00 — Founder briefing and memory

```text
Action:        click play on the FounderBriefing audio control.
Expected UI:
  Audio plays through stage PA.
  Transcript scrolls in time with audio.
  Memory card panel populates with the PO-conditional rule.
  Next Case Preview populates.
Mongo delta:   none new (already written in Beat 6).
Closing:       presenter delivers the closing tag from docs/demo_script.md.
```

---

## 7. Fallback plans

Every external service has a cached fallback. The cockpit should remain
narratable even if every external call fails.

### 7.1 If MongoDB Atlas is unreachable (mid-demo)

```text
Symptom:    cockpit shows "Atlas connection lost" or panels go blank.
Recovery:
  1. Switch laptop to mobile hotspot.
  2. npm run check:db in a side terminal.
  3. If still failing, open MongoDB Compass connected to Atlas and
     show the same data live to the audience as proof of state.
  4. Narrate what would have happened from docs/demo_script.md.
Pre-demo prevention: confirm IP allowlist before the day; avoid
                    coffee-shop wifi; warm the cluster 5 min before stage.
```

### 7.2 If Fireworks AI fails

```text
Symptom:    classification spinner hangs > 5s; draft panel empty.
Recovery:
  - Cached structured outputs from data/expected_outputs/ render the
    classification, drafts, audit summary, and briefing transcript
    automatically when DEMO_MODE=true.
  - The Atlas Live State agent_runs and retrieval_attempts still update
    using the cached records.
Narration shift: the story does not change. Do not mention the fallback.
```

### 7.3 If ElevenLabs is unavailable

```text
Symptom:    audio play button errors or silence.
Recovery (in order):
  1. Cached MP3 in data/cached_audio/ should auto-play. If yes, no action.
  2. If cached MP3 is missing, the briefing panel falls back to
     transcript-only.
  3. Presenter reads the briefing transcript from docs/demo_script.md
     out loud as if it were the system speaking.
```

### 7.4 If AWS API Gateway / Lambda / EventBridge fails

```text
Symptom:    "Simulate Customer A Reply" or "Start Live Bank Feed" buttons
            return an error after click.
Recovery:
  - The local Next.js routes (/api/events/customer-reply,
    /api/events/bank-transaction, /api/orchestrate) are always available.
  - Toggle the cockpit to "Local mode" if the UI exposes it, otherwise
    AWS_REGION env unset on next dev restart routes events locally.
  - The MongoDB writes are identical between AWS and local paths.
Narration shift: do not mention AWS in the recovered version. The
                 narrative is "MongoDB receives the event."
```

### 7.5 If the timed bank event does not fire

```text
Symptom:    no Harbour Labs entry by 2:15.
Recovery:
  1. Click "Trigger Bank Event" debug button (if exposed).
  2. From a side terminal:
       curl -X POST http://localhost:3000/api/events/bank-transaction
  3. UI catches up immediately.
Pre-demo prevention: rehearse with the local timer twice in a row.
```

### 7.6 If the cockpit UI breaks entirely

```text
Symptom:    blank screen, hard error, or React stack trace.
Recovery:
  1. In a side terminal: npm run dev in a fresh shell.
  2. While restarting, present from MongoDB Atlas UI directly:
     show cases, event_inbox, cashflow_forecasts, payment_run_plans,
     decision_log, founder_briefings, memory_cards.
  3. Read docs/demo_script.md narration verbatim.
The story is in the data, not the UI. The judges still see Atlas.
```

---

## 8. Final acceptance checklist (T-2 minutes, on stage)

This is the green-light list. Every item must be a yes. If any is a no,
do **not** start the demo — reset and reseed first.

```text
[ ] npm run check:db passed within the last 5 minutes.
[ ] npm run check:data passed within the last 30 minutes.
[ ] Cockpit shows: HIGH, £8,400, £11,200, gap £5,200, plan v1.
[ ] Event Feed shows the five seeded baseline events (5.2).
[ ] Three drafts visible, all "Pending approval".
[ ] MongoDB Atlas Live State shows event_inbox = 1 (scheduler scan).
[ ] Founder Briefing panel says "not generated yet".
[ ] Memory Card panel is empty.
[ ] Cached founder briefing MP3 exists in data/cached_audio/.
[ ] Mouse cursor parked off-screen.
[ ] Browser at 100% zoom, full screen, no devtools open.
[ ] Audio output verified through stage PA at low volume.
[ ] Mobile hotspot tethered and standby.
[ ] Two side terminals open: one running dev server, one for fallback
    curls.
[ ] docs/demo_script.md open on a second device.
[ ] Timer or stopwatch ready.
```

If all green: take a breath. Begin.

---

## 9. Reset between rehearsal runs

```bash
npm run reset && npm run seed
```

Then re-verify section 5. Do not re-verify section 8 — it is for the
final stage check only.

Target: a full reset + verification cycle in **under 60 seconds**. If it
takes longer, something is wrong with the network or seed script.

---

## 10. Emergency one-page reference

Tape this card next to the laptop:

```text
RunwayOps demo — emergency card
-------------------------------
Reset:       npm run reset && npm run seed
Health:      npm run check:db && npm run check:data
Dev:         npm run dev
Cockpit:     http://localhost:3000

Force events from terminal:
  curl -X POST http://localhost:3000/api/events/customer-reply
  curl -X POST http://localhost:3000/api/events/bank-transaction

If MongoDB dies   -> hotspot, then Compass on the same data.
If Fireworks dies -> cached outputs auto-fill, do not narrate fallback.
If ElevenLabs dies -> cached MP3 or read transcript.
If AWS dies       -> local routes already do the same writes.
If UI dies        -> show Atlas UI directly, read script aloud.

Baseline:    HIGH | £8,400 | £11,200 | gap £5,200 | plan v1
After reply: HIGH | conf 0.48 | forecast v2
After bank:  WATCH | £9,600 | forecast v3 | plan v3 | briefing | memory
```

---

## 11. Post-demo

```text
1. Hand presenter a glass of water.
2. Screenshot the final cockpit state for the judging packet.
3. Save the Atlas Live State row dump to docs/post_demo/<run_id>.md
   (optional, only if the judges request artifacts).
4. Do not reset until the judges have left the desk.
```

---

## 12. References

```text
docs/demo_script.md            On-stage narration
docs/qa_checklist.md           Pre-stage QA verification
docs/rehearsal_notes.md        Rehearsal guidance and pitfalls
docs/architecture.md           System architecture and design rationale
docs/judging_answers.md        Judge Q&A
docs/pitch.md                  30-second + 3-minute pitch
docs/implementation-plan.md    Day-of build plan
MASTER SPEC.md                 Source-of-truth product brief
```
