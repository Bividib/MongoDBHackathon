# RunwayOps — Rehearsal Notes

This is the coaching document for getting the live demo from "it works"
to "it lands." Use it after the cockpit is functional and before the
final dress run. The runbook is the playbook; this document is the
craft.

If anything here conflicts with [`docs/demo_runbook.md`](demo_runbook.md)
or [`docs/demo_script.md`](demo_script.md), those win. This file is
guidance only.

---

## 1. Why rehearse three times

```text
First run    Find what is broken. Expect surprises. Time it loosely.
Second run   Find what is dramatic. Time each beat. Tighten.
Dress run    Find what is fragile. Run the failure paths. Sleep on it.
```

Three runs minimum. Five if the time is there. After the third run, the
risk is over-rehearsing — the demo starts to sound flat. Stop and
rest the voice.

---

## 2. Recommended rehearsal schedule

```text
T-12 hours    First full run. Notes only, no fixing.
T-10 hours    Fix the top three issues from the first run.
T-9  hours    Second full run. Time each beat. Notes only.
T-7  hours    Fix critical issues from the second run. No new features.
T-3  hours    Dress run with the failure paths.
T-1  hour     Quiet time. Re-read docs/demo_script.md aloud once.
T-30 min      docs/demo_runbook.md sections 2-5 only.
T-2  min      docs/demo_runbook.md section 8 acceptance gate.
On stage      Read the room. Do not rush. The clock is your friend.
```

If the team is short on time, cut from the front. The dress run with
failure paths is the one that cannot be skipped.

---

## 3. Roles in rehearsal

```text
Operator         Drives the cockpit. Owns reset/seed. Owns timing.
Presenter        Speaks. Owns narration and audience eye contact.
Note-taker       Watches the audience-facing screen and writes down every
                 stumble, broken UI element, and slow beat. Does not
                 interrupt. Reports at the end of each run.
```

If the team is two people, the operator also takes notes during
narration. If solo, record each rehearsal on the laptop camera and
review.

---

## 4. Timing targets per beat

The beats in [`docs/demo_script.md`](demo_script.md) are not equal in
weight. Some can stretch; some must be tight.

```text
Beat                              Target   Hard cap   Trim if over
1. Case opens                      0:20     0:25       Drop the "they are not failing" line.
2. Root cause                      0:25     0:30       Skip the second scenario row.
3. Adaptive retrieval              0:30     0:35       Show only the top result.
4. Drafts and approvals            0:25     0:30       Show two drafts, not three.
5. Customer A reply                0:30     0:35       Do not narrate the confidence number.
6. Timed bank event                0:20     0:25       Cannot be trimmed; let the timer run.
7. MongoDB Atlas Live State        0:15     0:20       Speak the row count, not the columns.
8. Briefing and memory             0:15     0:25       Skip Next Case Preview.

Total                              3:00     3:25       (Anything over 3:00 is bad.)
```

The two beats that **cannot** be trimmed are Beat 6 (the timed bank
event) and Beat 8 (the briefing). Beat 6 is the wow moment. Beat 8 is
the pay-off. Cut from the middle if you must.

---

## 5. Narration craft

### 5.1 What to say vs let the UI show

The cockpit is dense. Audiences read screens faster than they listen.
Narrate the **why**, let the screen show the **what**.

```text
Wrong:  "Status is HIGH, cash is £8,400, payroll is £11,200, the gap is £5,200..."
Right:  "Their cash timing is broken. Payroll is short by £5,200 on Friday."
```

```text
Wrong:  "MongoDB writes a document called retrieval_attempts with a query
         and a strategy and the top results and an agent judgement..."
Right:  "Every retrieval is stored — the query, the strategy, the
         evidence, and whether it was sufficient."
```

### 5.2 Pace

```text
Speak slower than feels natural. The audience needs ~1.2 seconds per
on-screen change to register what changed. If you narrate at the speed
you read, you will outrun them.
```

### 5.3 The two pause points

Hold a deliberate ~2 second pause:

```text
1. Right after clicking "Simulate Customer A Reply" — let the UI animate
   before saying "It does not count that as cash."
2. Right after the bank event arrives — let the HIGH -> WATCH transition
   land before saying "Risk improves to watch, not safe."
```

Both pauses are dramatic. Both are tempting to fill with words. Don't.

### 5.4 The three pitfalls

```text
1. Don't read the numbers off the screen.       The audience can already see them.
2. Don't apologise.                             Even if something stutters, narrate forward.
3. Don't promise features.                      Stick to what is on the cockpit.
```

---

## 6. What to watch for during rehearsal

Each rehearsal, the note-taker logs anything from this list. The team
fixes the top three before the next run.

### 6.1 Cockpit issues

```text
[ ] Layout shifts when an event arrives.
[ ] A panel grows past the viewport.
[ ] A button looks clickable but is not.
[ ] The cursor flicker on a hot region.
[ ] Atlas Live State row order changes unexpectedly.
[ ] Audit drawer auto-open misfires.
[ ] Audio plays before the UI animation finishes.
[ ] Audio level is too low to hear over the room.
```

### 6.2 Story issues

```text
[ ] Beat lands flat (audience does not react).
[ ] Beat lands too soon (presenter ahead of UI).
[ ] Beat lands too late (UI ahead of presenter).
[ ] A number on screen does not match the narration.
[ ] An agent name in narration does not match the cockpit.
```

### 6.3 Reliability issues

```text
[ ] An event takes more than 5 seconds to update the cockpit.
[ ] A click double-fires.
[ ] A console error appears at any point in the flow.
[ ] An LLM call returns malformed JSON.
[ ] A retrieval call returns no results when it should.
[ ] The seed script leaves stale data after reset.
```

---

## 7. Recovery patterns (rehearse these on purpose)

Practise each at least once with the note-taker recording how long
recovery takes. Recovery should never exceed 15 seconds.

### 7.1 Cockpit hangs after a click

```text
1. Wait one breath.
2. If the Atlas Live State panel is still ticking, narrate from there.
3. If not, hard refresh the page (Cmd+Shift+R).
4. Continue from the next beat. Do not re-do the previous beat.
```

### 7.2 The timed bank event is late

```text
1. Continue narrating Beat 5 until the audience naturally drifts to
   waiting.
2. From a side terminal:
     curl -X POST http://localhost:3000/api/events/bank-transaction
3. The UI catches up. Resume Beat 6 narration on the visible change.
```

### 7.3 Audio fails

```text
1. Click the audio control once more.
2. If still silent, read the briefing transcript out loud as if it were
   the system speaking. The audience will not notice.
3. Continue to memory card.
```

### 7.4 Atlas connection drops mid-demo

```text
1. Switch to the mobile hotspot from the wifi menu without leaving the
   browser.
2. The cockpit reconnects on its own.
3. If not, open MongoDB Compass on the same data and present from there
   for the remaining beats.
4. Read the script from docs/demo_script.md.
```

---

## 8. Common pitfalls and how to avoid them

```text
Pitfall                          Fix
-------                          ---
Clicking too early on Beat 5     Wait for the presenter to finish "PO-dependent."
Clicking too early on Beat 6     Click during Beat 5, not Beat 6 — let the timer fire.
Talking through the timer        Use the silence. The bank event arrival is theatre.
Pointing at the screen           Use the cursor; do not block the screen with a hand.
Reading the briefing transcript  Let the audio play. The transcript scrolls.
Talking over the briefing audio  Narrate one sentence after the audio ends, then stop.
Resetting mid-Q&A                Reset only after the judges have moved on.
```

---

## 9. Voice and stage presence

```text
Stand still. The cockpit is the visual; the presenter is the voice.
Hands at sides or one hand on the laptop. Not both on the laptop.
Eye contact with the back row, not the screen.
End the demo on the closing tag from docs/demo_script.md, then stop.
Do not say "and that's it" or "any questions?" — wait for them.
```

---

## 10. Post-rehearsal review template

After each run, the team gathers for ~5 minutes and fills this in.
Brief is good. Three items per section is enough.

```text
Run number:       __ of __
Total time:       __:__
Beats over cap:   ____________________________________________________

What worked
  1.
  2.
  3.

What did not
  1.
  2.
  3.

Top three fixes before the next run
  1.
  2.
  3.

Decided by:       ___________________
Next run at:      __:__
```

---

## 11. Stage-day morning checklist

```text
[ ] Sleep at least 6 hours. Do not pull an all-nighter.
[ ] Eat something with protein. Avoid heavy carbs before stage.
[ ] Drink water. Avoid caffeine within 60 minutes of stage.
[ ] Re-read docs/demo_script.md once, aloud, slow.
[ ] Re-read this file's section 5 (narration craft).
[ ] Confirm the laptop is charged and the hotspot is paid up.
[ ] Confirm the Atlas cluster is not paused.
[ ] Run docs/qa_checklist.md sections 1-7 once.
[ ] Run a full demo flow once on the stage screen.
[ ] Reset and seed.
[ ] Park the cursor off-screen. Walk away from the laptop.
```

---

## 12. After the demo

```text
[ ] Hand the presenter water.
[ ] Take a screenshot of the final cockpit state.
[ ] Note the three best questions from the judges.
[ ] Save the run id (if applicable).
[ ] Do not modify the cockpit. The state should be reproducible from
    the seed if anyone asks.
```

---

## 13. References

```text
docs/demo_runbook.md           Operational playbook
docs/qa_checklist.md           Pre-stage QA verification
docs/demo_script.md            On-stage narration
docs/architecture.md           System architecture
docs/judging_answers.md        Judge Q&A
docs/pitch.md                  30-second + 3-minute pitch
MASTER SPEC.md                 Source-of-truth product brief
```
