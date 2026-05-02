# RunwayOps — QA Checklist

A granular pre-stage QA pass. Run this checklist **once** when the
build feels demo-ready, then again as the dress run before the live
demo. Items are grouped by surface so they can be split between two
people or run sequentially solo.

For the on-stage acceptance gate, see Section 8 of
[`docs/demo_runbook.md`](demo_runbook.md). This file is broader and
catches what the runbook trusts.

```text
Status legend
  [ ]   not yet checked
  [x]   verified
  [-]   skipped (with reason)
  [!]   failing (with note)
```

---

## 1. Code health

```text
[ ] git status is clean of unintended modifications.
[ ] node --version >= 20.
[ ] npm --version >= 10.
[ ] npm install completes with no error and no peer-dep warnings
    that block the build.
[ ] npm run typecheck passes.
[ ] npm run check-maths passes.
[ ] No process.env keys are read in a way that crashes when
    they are absent (Fireworks, ElevenLabs, AWS).
[ ] No console.log of secrets in any provider client.
```

---

## 2. Environment

```text
[ ] .env.local exists in repo root.
[ ] .env.local is git-ignored (git check-ignore .env.local prints the path).
[ ] MONGO_DB_CONNECTION or MONGODB_URI is set.
[ ] MONGODB_DB = runwayops_demo.
[ ] DEMO_MODE = true.
[ ] DEMO_COMPANY_ID = cmp_marlow_finch.
[ ] DEMO_CASE_ID = case_payroll_2026_05_08.
[ ] AWS_REGION = eu-west-2 (or unset and falling back to local routes).
[ ] No secrets are committed in git history.
    Verify: git log -p | grep -E "sk-|AKIA|mongodb\+srv://[^ ]+:" | head
```

---

## 3. Data pack

```text
[ ] npm run check:data prints "Data pack OK: 37 JSON files validated".
[ ] data/fixtures/ has all 19 required JSON files.
[ ] data/events/ has all 7 required JSON files.
[ ] data/expected_outputs/ has all 11 required JSON files.
[ ] data/cached_audio/ contains a briefing MP3 for the v3 case.
[ ] All fixture amounts match MASTER SPEC.md:
    [ ] cash_today = £8,400 (840000 pence if pence-encoded)
    [ ] payroll = £11,200
    [ ] supplier_x = £2,400 with 5-day grace
    [ ] customer_a (Northstar) = £4,800, 18 days overdue
    [ ] customer_b (Blue Finch) = £2,200, 7 days overdue
    [ ] harbour_labs retainer = £1,200
[ ] forecast_v1_baseline scenarios:
    [ ] -£5,200 (supplier paid, no collections)
    [ ] -£2,800 (supplier held, no collections)
[ ] forecast_v2_after_customer_a_reply scenarios:
    [ ] +£2,000 (Northstar pays, supplier held)
    [ ] -£2,800 (Northstar slips, supplier held)
[ ] forecast_v3_after_harbour_labs_retainer scenarios:
    [ ] -£1,600 (Northstar slips, supplier held)
    [ ] +£800 (Northstar pays, supplier paid after payroll)
```

---

## 4. MongoDB Atlas

```text
[ ] npm run check:db succeeds.
[ ] Atlas IP allowlist includes the demo machine's current public IP.
[ ] runwayops_demo database exists after npm run seed.
[ ] Collections present:
    [ ] cases
    [ ] events
    [ ] tasks
    [ ] agent_runs
    [ ] retrieval_attempts
    [ ] memory_chunks
    [ ] artifacts
    [ ] checkpoints
    [ ] companies, users, customers, invoices
    [ ] supplier_bills, supplier_terms, payroll_obligations
    [ ] bank_transactions_ts (time-series)
    [ ] email_threads, source_files
    [ ] cashflow_forecasts, payment_run_plans
    [ ] collection_drafts, decision_log
    [ ] founder_briefings, memory_cards
    [ ] agent_scratch (TTL), retrieval_cache (TTL)
    [ ] event_inbox
[ ] Indexes present:
    [ ] event_inbox unique on (company_id, event_key)
    [ ] cases unique on (company_id, case_ref)
    [ ] memory_chunks vector index (1024 dim, cosine)
    [ ] memory_chunks Atlas Search index
    [ ] cashflow_forecasts (company_id, case_id, version desc)
    [ ] payment_run_plans (company_id, case_id, version desc)
    [ ] agent_scratch TTL on expires_at
[ ] Schema validators in place on cases, event_inbox, tasks,
    cashflow_forecasts, payment_run_plans, collection_drafts.
[ ] bank_transactions_ts is a time-series collection
    (timeField=posted_at, metaField=account_meta).
```

---

## 5. AI providers

```text
[ ] npm run check:providers result recorded.
[ ] If FIREWORKS_API_KEY present: a structured-JSON classification
    call returns expected shape with `confidence` between 0 and 1.
[ ] If FIREWORKS_API_KEY absent: cached outputs in data/expected_outputs/
    render the classification, drafts, and briefing transcript.
[ ] If ELEVENLABS_API_KEY present: a 1-sentence TTS call returns audio.
[ ] If ELEVENLABS_API_KEY absent: cached MP3 in data/cached_audio/
    plays from the FounderBriefing panel.
[ ] If embeddings provider present: memory_chunks have non-empty
    embedding arrays of length 1024.
[ ] If embeddings provider absent: keyword fallback retrieval still
    writes a retrieval_attempts document with strategy = "atlas_search_only".
```

---

## 6. AWS layer (optional)

```text
[ ] If AWS configured:
    [ ] API Gateway URL responds to a GET /health (or 200/4xx, not 5xx).
    [ ] Lambda can write to event_inbox.
    [ ] EventBridge Scheduler is enabled but not yet armed for stage.
    [ ] S3 bucket runwayops-demo-artifacts exists and is reachable.
[ ] If AWS not configured:
    [ ] Local timer fallback for the bank event is verified twice.
    [ ] Local /api/events/* routes are confirmed to write event_inbox.
```

---

## 7. Cockpit UI

```text
[ ] npm run dev boots in under 10 seconds with no errors in the console.
[ ] http://localhost:3000 renders the cockpit at 100% zoom.
[ ] Top Risk Command Bar shows: HIGH, £8,400, £11,200, gap £5,200,
    4 days, plan v1, 3 approvals pending.
[ ] Event Feed shows the five seeded baseline events.
[ ] Main Case Board shows three deterministic scenarios.
[ ] Drafts panel shows three "Pending approval" drafts.
[ ] MongoDB Atlas Live State panel renders the seeded counts.
[ ] Audit / Why drawer can be opened and is empty (no events yet).
[ ] FounderBriefing panel says "not generated yet".
[ ] MemoryCardPreview is empty.
[ ] All buttons clickable; cursor changes on hover.
[ ] Tab order is sane (no focus traps).
[ ] No layout overflow at 1280x720, 1440x900, 1920x1080.
[ ] No `console.error` or `console.warn` in browser devtools.
[ ] No 4xx/5xx in the network tab during baseline render.
```

---

## 8. Event ingestion + replan cascade

Run each scenario twice (once for the dry run, once for confidence).

### 8.1 Customer A reply

```text
[ ] Click "Simulate Customer A Reply".
[ ] Within 5 seconds:
    [ ] event_inbox +1 (event_type = email.received).
    [ ] events +1 (reply.classified).
    [ ] retrieval_attempts +1.
    [ ] agent_runs +>=4.
    [ ] cashflow_forecasts: new doc with version = 2.
    [ ] cases.current_state.latest_forecast_version = 2.
[ ] UI updates without manual refresh.
[ ] Classification card shows: conditional_promise, confidence 0.48,
    is_guaranteed_payment = false.
[ ] Top bar status remains HIGH.
[ ] Top bar plan shows v2.
[ ] Idempotency: clicking again does NOT create a duplicate
    event_inbox row (same event_key).
```

### 8.2 Harbour Labs bank event (timed)

```text
[ ] Click "Start Live Bank Feed".
[ ] After 30–45 seconds:
    [ ] event_inbox +1 (event_type = bank.transaction.posted).
    [ ] cashflow_forecasts: new doc with version = 3.
    [ ] payment_run_plans: new doc with version = 3.
    [ ] decision_log +>=1.
    [ ] founder_briefings +1.
    [ ] memory_cards +1 (Northstar PO-conditional).
    [ ] artifacts +1 (briefing audio reference).
[ ] UI updates show:
    [ ] Cash £8,400 -> £9,600.
    [ ] Status HIGH -> WATCH.
    [ ] Supplier X recommendation: full delay -> conditional hold.
    [ ] Audit / Why drawer auto-opens with the WATCH/not-SAFE reasoning.
[ ] FounderBriefing panel populates with transcript.
[ ] MemoryCardPreview populates with the Northstar PO rule.
[ ] Idempotency: replaying the same bank event_key is rejected.
```

### 8.3 Replay safety

```text
[ ] Drop and re-run the seed script. Cockpit returns to baseline.
[ ] Re-run the full demo flow end-to-end. All numbers identical.
```

---

## 9. Fallback rehearsal

Rehearse each fallback path at least once before the day. Mark the
date so the team knows the last time it was practised.

```text
[ ] Disable Fireworks (unset key, restart dev server). Run flow.
    Confirm cached outputs render and the story still works. Date: ____
[ ] Disable ElevenLabs. Confirm cached MP3 plays and transcript shows. Date: ____
[ ] Switch to mobile hotspot. Confirm Atlas check still passes. Date: ____
[ ] Force-fail the timed bank event by stopping the timer; trigger via
    curl POST. Date: ____
[ ] Kill the dev server; bring up MongoDB Compass on the demo data and
    walk through the same story from the database. Date: ____
```

---

## 10. Documentation

```text
[ ] README.md links resolve.
[ ] docs/demo_script.md numbers match data/expected_outputs/*.json.
[ ] docs/demo_runbook.md numbers match data/expected_outputs/*.json.
[ ] docs/architecture.md collection list matches db/create_collections.js.
[ ] docs/judging_answers.md does not promise features that are not built.
[ ] No emoji or markdown rendering quirks in any docs file.
```

---

## 11. Final go / no-go

A single yes or no. Mark with the date and time of the decision.

```text
Decision:        [ go ] [ no go ]
Decided at:      __:__
Decided by:      ___________________
Reason if no go: ______________________________________________________
Next reset due:  T-__:__ before stage
```

If the decision is **go**, switch to
[`docs/demo_runbook.md`](demo_runbook.md) Section 8 for the on-stage
acceptance gate.

If the decision is **no go**, identify the single blocker, fix it, and
rerun this checklist from the affected section onward.
