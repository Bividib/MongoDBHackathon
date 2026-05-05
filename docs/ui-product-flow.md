# RunwayOps UI Product Flow

**Version:** v0.1 (Round 2 worker output)
**Date:** 2026-05-05
**Status:** Specification draft. No UI code exists yet. Apps/web is to be archived.
**Authoritative inputs:** [`New Spec.md`](../New%20Spec.md), [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md), public exports of `@runwayops/domain` and `@runwayops/cash-engine`.

This document defines the seven operational screens of RunwayOps, their typed
data contracts, all required states, user actions and approval flow, the
audit/evidence surface, and Playwright acceptance scenarios. It also captures
three cross-cutting concerns (global states, approval policy reference, and
evidence/audit invariants) and a contract-gap section for the integrator.

UI does not perform calculations, does not call AI providers, and does not
mutate operational state directly. Every mutation is mediated by the API layer,
which writes through the cash engine and domain validators.

---

## 0. Conventions

### 0.1 Type contract style

Every screen lists its `Inputs` as a TypeScript projection over the exported
types from `@runwayops/domain` and `@runwayops/cash-engine`. The UI receives
these as immutable view-models from the API layer; it does not import the
packages directly to avoid pulling Zod into the browser bundle. The API layer
is responsible for parsing/validating and re-serialising to the wire shape.

`EvidenceRef` is the same `{ kind, id, summary?, sourceProvider?,
sourceTimestamp? }` shape from `@runwayops/domain`. The UI resolves an
`EvidenceRef` into a renderable card via `evidenceById: Record<string, EvidenceRef>`
maps that the API includes alongside any payload that contains evidence
references.

### 0.2 60-second test

Every screen has a "60-second decision" — the single decision a finance operator
must reach with no further drilling. This drives information density and the
default sort/filter posture.

### 0.3 Error-state vocabulary

- **Empty** — endpoint returned successfully, but there is no data to show
  (legitimate zero state, e.g. no actions today).
- **Loading** — initial render, skeletons only, no stale data displayed.
- **Error (retryable)** — transient failure (network, 502/503/504, fetch
  abort). Show retry button. Do not surface stack traces.
- **Error (non-retryable)** — 401/403 (auth), 404 (entity gone), 422
  (validation rejection from server), 410 (tenant suspended). Show the
  remediation, never a retry.
- **Partial-data** — at least one upstream is unhealthy (e.g. Xero stale,
  bank feed disconnected). Show whatever rendered, with an inline banner that
  names the unhealthy integration and links to **Integration Health**.
- **Data** — happy path.

### 0.4 Approver roles

Used throughout: `viewer`, `operator`, `approver`, `senior_approver`, `admin`.
Mapped to `ApprovalRequest.assignedApproverId` and to policy gates referenced
in §X2.

---

## 1. Daily Cash Actions

### 1.1 Purpose

Tells a finance operator the **top five cash actions for today**: who to chase,
why, what to send, and which obligation each action protects. Operator should
be able to scan, open the top action, read the draft, see the evidence, and
either approve, edit, reject, or defer — all within 60 seconds for the first
action.

This is the home screen. If the screen is empty, the operator has nothing to
do today. If the screen is overflowing, only the top five render in the queue;
the rest live in the Collections Queue.

### 1.2 Required data contract

```ts
import type {
  RankedCollectionAction,            // @runwayops/cash-engine
  CashForecast,                      // @runwayops/cash-engine
  EvidenceRef,                       // @runwayops/domain
  ApprovalRequest,                   // @runwayops/domain
  Customer,                          // @runwayops/domain
  Invoice,                           // @runwayops/domain
} from "...";

type DailyCashActionsScreenInputs = {
  asOfDate: string;                                  // ISO date
  actions: RankedCollectionAction[];                 // top N, sorted by priorityScore desc
  forecast: Pick<CashForecast,
    "forecastId" | "asOfDate" | "horizonDays" |
    "riskStatus" | "shortfallAmount" | "obligationRisks">;
  customersById: Record<string, Customer>;
  invoicesById: Record<string, Invoice>;
  approvalsByActionId: Record<string, ApprovalRequest | undefined>;
  draftsByActionId: Record<string, MessageDraftView | undefined>;  // SEE GAP #3
  evidenceById: Record<string, EvidenceRef>;
  integrationHealthSummary: IntegrationHealthBanner;               // SEE GAP #4
};

type MessageDraftView = {
  draftId: string;
  channel: "email" | "sms" | "phone_task" | "letter" | "portal";
  tone: "friendly" | "neutral" | "firm";
  subject?: string;
  bodyMarkdown: string;
  paymentLinkUrl?: string;
  modelRunId?: string;
  generatedAt: string;
  evidenceRefs: EvidenceRef[];
};
```

**Notes:**

- `RankedCollectionAction.actionId` is a deterministic composite
  (`action:{companyId}:{invoiceId}:{kind}`) — see GAP #10. The UI must treat it
  as opaque.
- `RankedCollectionAction.evidenceConfidence`,
  `RankedCollectionAction.probabilityOfPayment`,
  `RankedCollectionAction.expectedCashImpact`, and
  `RankedCollectionAction.obligationUrgency` drive the priority chip and
  evidence drawer content.
- `forecast.obligationRisks[].obligationId` is shown next to the action when
  the action depends on protecting that obligation
  (`RankedCollectionAction.invoiceId` → invoice → matching obligation in the
  near-term window).

### 1.3 States

- **Empty** — `actions.length === 0`. Render: "No actions ranked for today."
  Sub-line: "Cash forecast risk status is `safe`." Show a secondary CTA to
  view the Collections Queue.
- **Loading** — five skeleton rows; forecast banner placeholder. No stale
  cached priority scores.
- **Error (retryable)** — single full-screen panel with retry CTA.
  Distinguish: forecast fetch vs actions fetch. If only one failed, render
  the half that succeeded plus a partial-data banner.
- **Error (non-retryable)** — 401/403 → "Session expired, sign in again."
  410 → "This workspace is suspended; contact admin." 404 (workspace not
  found) → tenant-switch prompt.
- **Partial-data** — `integrationHealthSummary.unhealthyConnectors.length > 0`
  shows top banner: "Xero last synced 14h ago. Forecast may be stale." Links
  to **Integration Health**.
- **Data** — top five rows, each row showing customer name, invoice number,
  amount due, expected cash impact, payment probability, recommended channel
  & tone, obligation it protects, action kind label, priority chip, and the
  three primary controls.

### 1.4 User actions

| Action               | Required role     | Side effects                                                                                                                                                              |
|----------------------|-------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Open evidence drawer | `viewer`          | None.                                                                                                                                                                     |
| Open draft preview   | `viewer`          | None.                                                                                                                                                                     |
| Edit draft           | `operator`        | `POST /approvals/:id/edit` only after approval has been requested. Until then, edits live on the `MessageDraft`. Original + edited bodies are both retained.              |
| Request approval     | `operator`        | Creates `ApprovalRequest{ subjectKind: "external_message", status: "pending" }`. Emits `approval.requested` event and `audit_event{action: "approval.requested"}`.        |
| Approve & send       | `approver`+       | Idempotent. Writes `ApprovalDecision{decision: "approved"}`, emits `approval.granted`, schedules send via Temporal `external_message.sent` workflow.                      |
| Reject               | `approver`+       | Writes `ApprovalDecision{decision: "rejected"}` with required `note`. No external action. Emits `approval.rejected`.                                                      |
| Defer                | `operator`        | Updates `CollectionAction.status` to `cancelled` for the day OR pushes `dueAt`. Logged as `audit_event{action: "collection_action.deferred"}`.                            |
| View customer memory | `viewer`          | Navigates to **Customer Memory** screen, scoped to `customerId`.                                                                                                          |

**Blocked actions** (never available from this screen, regardless of role):

- Initiating outbound payment.
- Sending without approval (no "send now" button, ever).
- Marking an invoice paid (this happens only via bank-event matching).
- Writing to the accounting ledger.

### 1.5 Approval flow

1. Operator clicks **Request approval**. Approval card appears in **Approval
   Inbox** for the appropriate role (per §X2 policy).
2. The Daily Cash Actions row reflects `approvalsByActionId[actionId].status`
   (`pending` → "Awaiting approval", `approved` → "Sent ✓",
   `rejected` → "Rejected" with collapse).
3. If the approver edits the draft, both the original and edited bodies are
   retained. Edited body is shown to the operator on next visit.
4. Rejection requires a note; the note is rendered in the action row's
   collapsed state and pinned to the Audit Drawer entry.
5. Send happens **only** after `ApprovalDecision.decision === "approved"`. The
   Temporal workflow performs the send; the UI polls / subscribes for the
   `external_message.sent` domain event and updates the row status.

### 1.6 Audit/evidence surface

- Each row has an **Evidence** button. Opens a drawer listing every
  `EvidenceRef` from `RankedCollectionAction.evidenceRefs`, grouped by `kind`
  (invoice, payment, communication_message, customer_stat, promise_to_pay,
  policy). Each row in the drawer is clickable: clicking an `invoice` ref
  opens the invoice detail; clicking a `source_object` ref shows the raw
  provider payload (read-only, JSON viewer) — see GAP #9.
- Hovering the priority chip shows the score breakdown:
  `cashImpact × probability × urgency × effectiveness × evidenceConfidence
  − relationshipRiskPenalty − effortPenalty`. Numbers are pulled directly
  from the `RankedCollectionAction` fields — UI does not recompute.
- Mutations (request approval, edit draft, defer) appear in the row's audit
  affordance ("View history") which opens the **Audit Drawer** filtered by
  `targetKind: "collection_action"` and `targetId: action.actionId`.

### 1.7 Playwright acceptance scenarios

1. **Golden path: top action approved & sent.**
   *Given* the operator has five ranked actions and the highest-priority one
   is `kind: "send_payment_reminder"` for invoice INV-1024.
   *When* they open the draft, request approval, then sign in as approver and
   click Approve & send.
   *Then* the row shows "Sent ✓", the Audit Drawer for that action contains
   `approval.requested`, `approval.granted`, and `external_message.sent`, and
   the matching `ApprovalRequest.status === "approved"`.

2. **Approval-required path: edit before approve.**
   *Given* an action with a pending approval request.
   *When* the approver edits the draft body and approves.
   *Then* the `ApprovalDecision.decision === "edited"`, both original and
   edited bodies appear in the Audit Drawer entry, and the sent message
   matches the edited body.

3. **Failure path: integration unhealthy banner.**
   *Given* `integrationHealthSummary.unhealthyConnectors` includes
   `provider: "xero", lastSuccessfulSyncAt: 14h ago`.
   *When* the operator loads the screen.
   *Then* a yellow banner appears at the top with the text "Xero last synced
   14 hours ago — forecast may be stale" and a link to Integration Health.
   The action list still renders.

4. **Failure path: actions fetch errors but forecast succeeds.**
   *Given* the forecast endpoint returns 200 and the actions endpoint returns
   503.
   *When* the operator loads the screen.
   *Then* the forecast banner renders normally, the action list shows a retry
   panel, no stale cached actions are shown, and clicking retry re-fetches
   actions only.

5. **Empty state.**
   *Given* `actions.length === 0` and `forecast.riskStatus === "safe"`.
   *When* the screen renders.
   *Then* the empty illustration appears with the copy "No actions ranked
   for today" and a secondary CTA labelled "Open Collections Queue."

---

## 2. Forecast (Cash Confidence Forecast)

### 2.1 Purpose

Show near-term cash with **confidence bands and obligation coverage**. The
operator must see, in under 60 seconds: today's actual cash, expected inflows
within the horizon weighted by confidence, expected outflows for critical
obligations, and the risk status (`safe` / `watch` / `high` / `critical`) with
the specific obligation that drove that status.

### 2.2 Required data contract

```ts
import type {
  CashForecast,                // @runwayops/cash-engine
  ForecastCashFlow,            // @runwayops/cash-engine
  ConfidenceBand,              // @runwayops/cash-engine
  ForecastScenario,            // @runwayops/cash-engine
  ObligationRisk,              // @runwayops/cash-engine
  Obligation,                  // @runwayops/domain
  EvidenceRef,                 // @runwayops/domain
} from "...";

type ForecastScreenInputs = {
  forecast: CashForecast;                                // current selected version
  horizonOptions: Array<7 | 14 | 30 | 90>;
  selectedHorizonDays: 7 | 14 | 30 | 90;
  selectedScenarioName: ForecastScenario["name"];        // "conservative" | "base" | "optimistic"
  forecastVersions: Array<Pick<CashForecast,
    "forecastId" | "generatedAt" | "asOfDate" | "horizonDays" | "riskStatus" |
    "triggerEventIds">>;
  obligationsById: Record<string, Obligation>;
  evidenceById: Record<string, EvidenceRef>;
};
```

**Notes:**

- `forecast.confidenceBands` provides `{date, low, expected, high}` — used for
  the band chart.
- `forecast.scenarios` is the canonical conservative/base/optimistic triple;
  the UI does not compute its own.
- `forecast.obligationRisks` is the source of truth for the per-obligation
  risk pills under the chart.
- `ForecastCashFlow.kind` enum from cash-engine (`"invoice" | "promise" |
  "payment" | "bank_transaction" | "supplier_bill" | "critical_obligation"`)
  drives the legend grouping. Note this is **not** the same enum as
  `@runwayops/domain.forecastCashFlowKindSchema` — see GAP #7.

### 2.3 States

- **Empty** — no obligations and no expected inflows. Render: "Forecast is
  empty — connect a bank feed and an accounting integration to populate."
  Link to Integration Health.
- **Loading** — chart skeleton, scenario toggles disabled.
- **Error (retryable)** — chart and table replaced by a single panel with
  retry. Forecast version selector remains usable (cached).
- **Error (non-retryable)** — 401/403/410 as in §1.3.
- **Partial-data** — banner: "Bank feed disconnected — actual cash balance is
  from last sync at HH:MM." Render the chart with a dashed line on the
  actual-cash series past the last sync timestamp.
- **Data** — band chart, scenario toggles, horizon toggles, obligation list,
  forecast version dropdown.

### 2.4 User actions

| Action                           | Required role | Side effects                                                                                                                  |
|----------------------------------|---------------|-------------------------------------------------------------------------------------------------------------------------------|
| Switch horizon (7/14/30/90)      | `viewer`      | Re-fetch `/forecast/latest?horizonDays=N`. No mutation.                                                                       |
| Switch scenario                  | `viewer`      | Client-side rerender from `forecast.scenarios`. No fetch.                                                                     |
| Open historical forecast version | `viewer`      | `GET /forecasts/:forecastId`. Read-only render with banner "Viewing snapshot from {generatedAt}."                             |
| Drill into obligation risk       | `viewer`      | Opens detail panel showing `ObligationRisk.dependentInflowIds` resolved against `forecast.expectedInflows` for that risk.     |
| Open evidence on cash flow       | `viewer`      | Drawer with `ForecastCashFlow.evidenceRefs`.                                                                                  |
| Trigger refresh                  | `operator`    | Enqueues a Temporal `forecast.generated` recompute. Logged as `audit_event{action: "forecast.recompute_requested"}`.          |

**Blocked actions:** the operator cannot edit the forecast directly; cash
arithmetic is deterministic in the cash engine.

### 2.5 Approval flow

The Forecast screen has no approval surface of its own. However:

- Recomputing a forecast does not require approval (read-only operation).
- Forecasts feed approvals on other screens; clicking on an obligation risk
  with `riskStatus: "high"` or `"critical"` exposes a CTA "Open critical
  obligation case" which navigates to the (future) Critical-Obligation Case
  screen — see §32.

### 2.6 Audit/evidence surface

- Each `ForecastCashFlow` carries `evidenceRefs`. Clicking a flow on the chart
  or in the table opens an evidence drawer.
- The forecast version dropdown shows `forecastVersions[i].triggerEventIds` —
  clicking a trigger event opens the **Audit Drawer** filtered by that
  `domainEventId` (`correlationId` on `AuditEvent`).
- A separate "Why this risk status?" affordance on each obligation pill
  expands to render `ObligationRisk.coverageStatus`
  (`covered_by_actual` | `covered_by_high_confidence` |
  `dependent_on_medium_confidence` | `shortfall_actionable` |
  `shortfall_unavoidable`) plus the dependent inflow IDs as evidence chips.

### 2.7 Playwright acceptance scenarios

1. **Golden path: 30-day horizon, base scenario.**
   *Given* a forecast with `riskStatus: "watch"` and one obligation in
   `dependent_on_medium_confidence`.
   *When* the operator switches to 30-day horizon and base scenario.
   *Then* the chart renders three series (low/expected/high), the obligation
   pill shows yellow with the text "Watch — depends on 1 medium-confidence
   inflow", and clicking it expands the dependent inflow list.

2. **Approval-required path: recompute is read-only, no approval needed.**
   *Given* the operator triggers a recompute.
   *When* the recompute completes.
   *Then* a new `forecastId` appears at the top of the version dropdown and
   no `ApprovalRequest` was created. The Audit Drawer shows
   `forecast.recompute_requested` and `forecast.generated` events.

3. **Failure path: bank feed disconnected.**
   *Given* `integrationHealthSummary.unhealthyConnectors` includes a bank
   provider with `status: "disconnected"`.
   *When* the operator loads the forecast.
   *Then* the actual cash line is dashed past the last sync timestamp and a
   partial-data banner appears.

4. **Failure path: forecast endpoint 503.**
   *Given* `/forecast/latest` returns 503.
   *When* the operator loads the screen.
   *Then* the chart area shows a retry panel; the version dropdown is
   disabled. No stale chart is shown.

5. **Drill-in: critical obligation.**
   *Given* a forecast with `riskStatus: "critical"` and one obligation with
   `coverageStatus: "shortfall_unavoidable"`.
   *When* the operator clicks the red obligation pill.
   *Then* a panel opens listing the obligation amount, due date, and a CTA
   "Open critical-obligation case" disabled with tooltip "Phase 5 feature."

---

## 3. Promise Board

### 3.1 Purpose

Track every promise-to-pay across all customers, sorted by upcoming due date.
The operator must see, in under 60 seconds: which promises are due this week,
which are conditional and on what condition, what the system's confidence is,
and which have broken or been kept. The promise is the central object of
RunwayOps' core thesis ("a promise is not cash").

### 3.2 Required data contract

```ts
import type {
  PromiseToPay,                // @runwayops/cash-engine — projection of domain.PromiseToPay
  PromiseType,                 // @runwayops/domain
  PromiseOutcome,              // @runwayops/domain
  EvidenceRef,                 // @runwayops/domain
  Customer,                    // @runwayops/domain
  Invoice,                     // @runwayops/domain
} from "...";

type PromiseBoardScreenInputs = {
  promises: PromiseToPay[];
  customersById: Record<string, Customer>;
  invoicesById: Record<string, Invoice>;
  evidenceById: Record<string, EvidenceRef>;
  filters: {
    types: PromiseType[];                  // multi-select
    outcomes: PromiseOutcome[];            // multi-select
    customerId?: string;
    promisedDateRange?: { from: string; to: string };
  };
  sort: "promisedDate_asc" | "promisedDate_desc" | "confidence_desc" | "amount_desc";
};
```

**Notes:**

- `PromiseToPay.promiseType` ∈ `"firm" | "conditional" | "vague" | "partial"
  | "disputed" | "cannot_pay" | "already_paid_claim"`.
- `PromiseToPay.outcome` ∈ `"pending" | "kept" | "partially_kept" | "late"
  | "broken" | "superseded" | "disputed"`.
- `PromiseToPay.confidenceAtCreation` is a 0–1 score from the AI extractor;
  the live confidence is recomputed by the cash engine as the promised date
  approaches and as bank events arrive.
- `PromiseToPay.conditionText` is required when `promiseType === "conditional"`
  (enforced by the domain Zod schema).
- `PromiseToPay.matchedPaymentId` (cash-engine projection only) indicates the
  bank transaction that closed the promise. UI uses this to render an
  "auto-matched" badge.

### 3.3 States

- **Empty** — no promises in the workspace yet. Render: "No promises tracked.
  Promises are extracted automatically from customer replies."
- **Loading** — table skeleton.
- **Error (retryable)** — single panel with retry.
- **Error (non-retryable)** — 401/403/410.
- **Partial-data** — banner if email integration is disconnected (no new
  promises will be extracted) or if AI classifier is in a degraded state.
- **Data** — table view with rows grouped by week of `promisedDate`. Past-due
  promises with `outcome: "pending"` are highlighted in amber (PromiseToPay
  was promised but not yet matched to a bank event).

### 3.4 User actions

| Action                            | Required role | Side effects                                                                                                                |
|-----------------------------------|---------------|-----------------------------------------------------------------------------------------------------------------------------|
| Filter / sort                     | `viewer`      | None.                                                                                                                       |
| Open promise detail               | `viewer`      | Side-panel with extracted text, condition text, evidence refs, source message, confidence breakdown.                        |
| Reclassify promise type           | `operator`    | Writes new `PromiseToPay.promiseType` and creates `audit_event{action: "promise.reclassified", before, after}`.             |
| Mark outcome (manual override)    | `operator`    | Sets `outcome` to one of the enum values. Requires `note` (free text) which is stored in the audit before/after diff.       |
| Match to payment (manual)         | `operator`    | Sets `matchedPaymentId`. Triggers cash-engine recompute. Logged.                                                             |
| Supersede with new promise        | `operator`    | Marks current promise `outcome: "superseded"` and creates a new `PromiseToPay` linked via `evidenceRefs`. Audit-logged.     |
| Open customer memory              | `viewer`      | Navigates to Customer Memory for the linked `customerId`.                                                                   |

**Blocked actions:**

- Cannot create a promise from scratch in the UI (promises must come from a
  classified `customer_reply.received` event with evidence). This protects the
  evidence invariant.
- Cannot delete a promise. Use `outcome: "superseded"` or
  `outcome: "disputed"`.

### 3.5 Approval flow

Promise reclassification and manual outcome overrides do **not** require
approval (they are internal state changes, not external actions). They are
audit-logged with `actorType: "user"`. Promise supersession does require an
explicit confirmation modal because it creates a new promise object.

The Promise Board does not generate external messages. To act on a broken
promise, the operator returns to **Daily Cash Actions** where the cash engine
will have recomputed and re-ranked.

### 3.6 Audit/evidence surface

- The promise detail panel always renders the source `communication_message`
  evidence ref (see GAP #6: `CommunicationMessage` is not yet exported), the
  extracted text, and the confidence breakdown components.
- Confidence breakdown (rendered from `calculatePromiseConfidence` outputs in
  cash-engine) shows: base confidence by promise type, customer reliability
  factor, recency factor, condition penalty, dispute penalty, final
  confidence. Each component links to its evidence (e.g. customer reliability
  links to `customer_stat` evidence).
- Reclassifications produce `AuditEvent{actorType: "user", action:
  "promise.reclassified", before, after}` rendered in the promise's history.

### 3.7 Playwright acceptance scenarios

1. **Golden path: conditional promise rendered with condition text.**
   *Given* a promise with `promiseType: "conditional"`,
   `conditionText: "PO re-approval"`, `confidenceAtCreation: 0.42`.
   *When* the operator opens the promise detail.
   *Then* the panel shows the condition text, an amber confidence chip with
   value 0.42, and an explanation that conditional promises start at lower
   base confidence.

2. **Approval-required path: supersession requires confirmation.**
   *Given* a pending promise.
   *When* the operator clicks "Supersede" and enters new promise text.
   *Then* a confirmation modal appears warning "This will mark the existing
   promise as superseded. The new promise will require evidence." Confirming
   creates a new `PromiseToPay` and writes an audit event chain
   (`promise.updated` on old, `promise.created` on new) with shared
   `correlationId`.

3. **Failure path: AI classifier degraded.**
   *Given* `integrationHealthSummary.degradedServices` includes
   `service: "ai_classifier"`.
   *When* the operator loads the Promise Board.
   *Then* a banner appears: "Promise extraction is paused. New customer
   replies will not produce promises automatically until classification
   resumes." Existing promises render normally.

4. **Manual match: auto-matched badge.**
   *Given* a promise with `outcome: "kept"` and `matchedPaymentId` set by the
   bank-event matcher.
   *When* the row renders.
   *Then* it shows a green "Kept ✓ auto-matched" badge that reveals the bank
   transaction evidence on hover.

5. **Filter: only conditional, only pending.**
   *Given* 50 promises with mixed types and outcomes.
   *When* the operator filters `types: ["conditional"], outcomes: ["pending"]`.
   *Then* only conditional + pending rows render and the URL contains the
   filter state for shareability.

---

## 4. Approval Inbox

### 4.1 Purpose

The single queue where every external action that requires human sign-off
lands. Operator must see, in under 60 seconds: how many approvals are
pending, who is the assigned approver, and which approvals are policy-flagged
(higher risk, escalation tone, large amount). The Approval Inbox is the
**only** place an action transitions from "draft" to "sent."

### 4.2 Required data contract

```ts
import type {
  ApprovalRequest,             // @runwayops/domain
  ApprovalDecision,            // @runwayops/domain
  ApprovalSubjectKind,         // @runwayops/domain
  EvidenceRef,                 // @runwayops/domain
  AuditEvent,                  // @runwayops/domain
  Customer,                    // @runwayops/domain
} from "...";

type ApprovalInboxScreenInputs = {
  pending: ApprovalRequest[];
  recentlyDecided: ApprovalRequest[];     // last 7 days, decided
  subjectsByApprovalId: Record<string, ApprovalSubjectView>;
  customersById: Record<string, Customer>;
  evidenceById: Record<string, EvidenceRef>;
  policyWarnings: Record<string, PolicyWarning[]>;          // approvalId → warnings
  approvalHistory: Record<string, AuditEvent[]>;            // approvalId → audit events
};

type ApprovalSubjectView =
  | {
      kind: "external_message";
      draft: MessageDraftView;                              // SEE GAP #3
      collectionActionId: string;
      customerId: string;
      invoiceId?: string;
      threadContext?: CommunicationThreadView;              // SEE GAP #6
    }
  | {
      kind: "supplier_timing";
      supplierName: string;
      currentDueDate: string;
      proposedDueDate: string;
      rationale: string;
    }
  | {
      kind: "payment_plan";
      customerId: string;
      installments: Array<{ date: string; amount: { amountMinor: string; currency: string } }>;
      rationale: string;
    }
  | {
      kind: "accounting_writeback";
      writebackTarget: "xero" | "quickbooks";
      changeSummary: string;
      sourceCollectionActionId: string;
    };

type PolicyWarning = {
  severity: "info" | "warn" | "block";
  ruleId: string;
  message: string;
  evidenceRefs: EvidenceRef[];
};
```

**Notes:**

- `ApprovalRequest.subjectKind ∈ "collection_action" | "message_draft" |
  "payment_plan" | "supplier_timing" | "accounting_writeback" |
  "external_message"`.
- `ApprovalDecision.decision ∈ "approved" | "rejected" | "edited"`. An
  `"edited"` decision **must** include `editedPayload` (Zod-enforced).
- `ApprovalRequest.assignedApproverId` may be unset (open queue) or set to a
  specific user.

### 4.3 States

- **Empty** — `pending.length === 0`. Render: "Inbox zero." Show last 7 days
  of decided approvals as a secondary list.
- **Loading** — list skeleton.
- **Error (retryable)** — single panel with retry.
- **Error (non-retryable)** — 401/403/410. 422 if the operator tries to
  approve something whose policy state has changed.
- **Partial-data** — `policyWarnings` fetch failed: render the approval but
  show a yellow inline warning "Policy validation unavailable — proceed only
  if certain." Approval is permitted but the Audit Event explicitly notes
  the missing policy check.
- **Data** — list of cards. Each card: subject summary, customer (if any),
  draft preview (first 3 lines), policy warnings, evidence summary,
  decision controls.

### 4.4 User actions

| Action                       | Required role                      | Side effects                                                                                                                                            |
|------------------------------|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| Open card                    | `viewer`                           | None. Loads full draft + evidence in side panel.                                                                                                         |
| Approve                      | `approver` (`senior_approver` for amounts > policy threshold; see §X2) | Writes `ApprovalDecision{decision: "approved", decidedByUserId, decidedAt}`. Emits `approval.granted`. Triggers downstream Temporal action.             |
| Edit then approve            | `approver`+                        | Writes `ApprovalDecision{decision: "edited", editedPayload}`. Both original and edited bodies retained. Emits `approval.edited` then `approval.granted`. |
| Reject                       | `approver`+                        | Requires `note`. Writes `ApprovalDecision{decision: "rejected", note}`. Emits `approval.rejected`.                                                       |
| Defer                        | `operator` or `approver`           | Reschedules `expiresAt`. Logged but does not decide.                                                                                                    |
| Reassign approver            | `senior_approver` or `admin`       | Updates `assignedApproverId`. Logged.                                                                                                                   |

**Blocked actions:**

- **Payment initiation** — never available. The Approval Inbox cannot have an
  approval whose `subjectKind` corresponds to moving money. If it appears,
  it is a server bug; UI renders a red error card "Invalid approval kind —
  contact admin."
- **Autonomous send** — there is no "auto-approve all" affordance.
- **Ledger writeback for material amounts** — `accounting_writeback` is
  permitted in the schema but in v1 the UI gates this behind `senior_approver`
  and a confirmation modal warning "Writes to your accounting integration
  cannot be undone from RunwayOps." See §X2.
- **Bypassing policy `block` warnings** — if any `PolicyWarning.severity ===
  "block"`, the Approve button is disabled with a tooltip naming the rule.

### 4.5 Approval flow

1. Operator (anywhere in the app) creates an `ApprovalRequest`. It appears
   here, scoped by `assignedApproverId` (if set) or visible to all approvers.
2. Approver opens the card. The full draft renders in an editable code-mirror
   style box. The diff against the AI-generated original is shown when the
   approver edits.
3. Approver sees policy warnings inline (e.g. "Customer is `relationshipTier:
   "strategic"` — wording reviewed against firm-tone policy"). Block-severity
   warnings disable the Approve button.
4. Approver clicks Approve / Edit & Approve / Reject.
5. UI optimistically shows "Sending…" and awaits the
   `external_message.sent` (or equivalent) domain event before showing a
   final-success state. Retains a "View in Audit Drawer" affordance.
6. Rejected approvals collapse to a one-line summary with the reason note
   visible on hover.

### 4.6 Audit/evidence surface

The Approval Inbox is the densest evidence surface in the product. Each card
must show, before the approver clicks Approve:

- The **draft body** (verbatim, no truncation).
- The **AI-generated original** (collapsed by default; expandable diff).
- The **evidence refs** that justified the recommendation (rendered as chips
  by `kind`).
- The **policy warnings** with rule IDs cross-referenced to §X2.
- The **prior thread context** for `external_message` approvals — the last
  N customer messages on the thread, with the most recent at the bottom.
- The **approval history** (a mini Audit Drawer scoped to this approval).

Every approval decision writes:

```text
AuditEvent{
  actorType: "user",
  actorId: <approver user id>,
  action: "approval.granted" | "approval.rejected" | "approval.edited",
  targetKind: "approval",
  targetId: approvalRequest.id,
  before: { status, decision? },
  after: { status, decision },
  evidenceRefs: [...approvalRequest.evidenceRefs, draft body ref, edited-body ref if edited],
  correlationId: <case or workflow correlation id>
}
```

When the downstream action executes, a separate audit event chains via
`causationEventId` so the Audit Drawer renders the full
draft → approver → final-content → delivery-result chain.

### 4.7 Playwright acceptance scenarios

1. **Golden path: approver approves an external message.**
   *Given* one pending approval with `subjectKind: "external_message"` and
   no policy warnings.
   *When* the approver clicks Approve.
   *Then* the card collapses showing "Approved by {user} at {time}", a
   downstream `external_message.sent` audit event appears, and the card moves
   to "Recently decided".

2. **Approval-required path: senior approver gate on large amount.**
   *Given* an approval whose underlying invoice amount exceeds the
   `senior_approver` policy threshold (£20,000 in default policy) and the
   current user is `approver` (not senior).
   *When* the approver opens the card.
   *Then* the Approve button is disabled with tooltip "Senior approver
   required for amounts over £20,000. Reassign or escalate."

3. **Failure path: blocked by policy.**
   *Given* an approval with `policyWarnings: [{severity: "block", ruleId:
   "no_legal_threats_without_cfo"}]`.
   *When* a senior approver opens the card.
   *Then* the Approve button is disabled and a red banner names the rule.
   The Reject button remains enabled.

4. **Edit path: original and edited bodies retained.**
   *Given* a pending approval with an AI-drafted body.
   *When* the approver edits the body and clicks Edit & Approve.
   *Then* `ApprovalDecision.decision === "edited"`, the audit drawer entry
   shows both bodies, and the sent message matches the edited body verbatim.

5. **Failure path: send fails after approval.**
   *Given* an approval is approved but the downstream
   `external_message.sent` workflow fails.
   *When* 30 seconds elapse without a success event.
   *Then* the card surfaces a red banner "Send failed — retry from Audit
   Drawer," the approval status remains `approved`, and the failure is
   visible as `audit_event{action: "external_message.send_failed"}`.

---

## 5. Customer Memory

### 5.1 Purpose

A per-customer view answering: **"how does this customer actually behave with
us?"** Behavioural memory (structured stats), semantic evidence (recent
quotes, tone signals), and policy memory (overrides like "never SMS this
customer"). Shown when the operator wants to inform a draft, understand a
pattern, or sanity-check a recommendation.

### 5.2 Required data contract

```ts
import type {
  CustomerPaymentStats,        // @runwayops/cash-engine — SEE GAP #2
  PromiseToPay,                // @runwayops/cash-engine
  CollectionAction,            // @runwayops/domain
  Customer,                    // @runwayops/domain
  EvidenceRef,                 // @runwayops/domain
} from "...";

type CustomerMemoryScreenInputs = {
  customer: Customer;
  stats: CustomerPaymentStats;                // structured behavioural memory
  recentPromises: PromiseToPay[];             // last 12 months
  recentActions: CollectionAction[];          // last 12 months
  semanticMemoryChunks: SemanticMemoryChunk[];        // SEE GAP #2
  policyMemory: CustomerPolicyEntry[];                // SEE GAP #2 / #8
  evidenceById: Record<string, EvidenceRef>;
};

type SemanticMemoryChunk = {
  id: string;
  text: string;
  capturedAt: string;
  sourceEvidenceRefs: EvidenceRef[];
};

type CustomerPolicyEntry = {
  id: string;
  rule: string;                               // e.g. "Never SMS — strategic"
  scope: "customer" | "tier" | "company";
  enforced: boolean;                          // soft hint vs hard block
  evidenceRefs: EvidenceRef[];
};
```

**Notes:**

- `CustomerPaymentStats` lives in cash-engine, **not** domain. The UI receives
  it pre-validated by the API. See GAP #2: domain should re-export this or
  define its own canonical `CustomerMemoryCard`.
- `Customer.relationshipTier ∈ "strategic" | "standard" | "watch" | "low_touch"
  | "sensitive"`.
- `stats.lastSuccessfulChannel` and `stats.lastSuccessfulTone` drive the
  "what works" panel.
- `stats.actionEffectiveness` is keyed by `CollectionActionKind` (cash-engine
  enum) — note this is not the same enum as domain's `CollectionActionType`.
  See GAP #1.

### 5.3 States

- **Empty** — `stats` exists but every count is zero (new customer, no
  history). Render: "No payment history yet. Memory will populate after the
  first sync."
- **Loading** — three-column skeleton.
- **Error (retryable)** — single retry panel.
- **Error (non-retryable)** — 401/403/410. 404 if customer was deleted.
- **Partial-data** — semantic memory unavailable (vector search degraded):
  show structured stats and policy memory only, plus a banner.
- **Data** — three columns: Behaviour (stats), What works (channel/tone +
  recent successful actions), Memory (semantic chunks + policy rules).

### 5.4 User actions

| Action                            | Required role | Side effects                                                                                                |
|-----------------------------------|---------------|-------------------------------------------------------------------------------------------------------------|
| Open evidence on stat             | `viewer`      | Drawer with the underlying invoices/payments/promises.                                                      |
| Add policy memory entry           | `operator`    | Writes a new `CustomerPolicyEntry`. Audit-logged.                                                           |
| Edit policy memory entry          | `operator`    | Audit-logged with before/after.                                                                             |
| Remove policy memory entry        | `operator`    | Soft-delete (sets `enforced: false`, retains record). Audit-logged.                                         |
| Change relationship tier          | `senior_approver` | Mutates `Customer.relationshipTier`. Triggers re-rank. Audit-logged.                                     |
| Open thread for semantic chunk    | `viewer`      | Drills into the source `communication_message` (or whichever evidence kind).                                |
| Open recent promise / action      | `viewer`      | Cross-navigates to Promise Board / Daily Cash Actions, scoped to that record.                               |

**Blocked actions:**

- Cannot edit `CustomerPaymentStats` directly. Stats are derived; the UI is
  read-only over them.
- Cannot delete semantic memory chunks (they are tied to source evidence).

### 5.5 Approval flow

Customer Memory does not generate external actions. Internal mutations
(adding/removing a policy entry, changing relationship tier) are gated on
role only:

- `operator` can add/edit/remove customer-scoped policy entries.
- `senior_approver` is required to change `relationshipTier` (because it
  affects ranking globally for that customer).
- Tier-scoped or company-scoped policy entries are managed in the (future)
  Admin / Policy Controls screen, not here.

### 5.6 Audit/evidence surface

- Every stat tile has an "Evidence" pop-out listing the records that produced
  it (e.g. `promise_kept_rate` → list of kept and broken promises in the
  window).
- Every semantic memory chunk is sourced from `EvidenceRef[]`. Hovering the
  chunk highlights the underlying message timestamp.
- Adding/removing a policy entry writes
  `audit_event{action: "customer_policy.added", before: null, after}` or
  `customer_policy.removed`. Tier changes write
  `audit_event{action: "customer.relationship_tier_changed", before, after}`.

### 5.7 Playwright acceptance scenarios

1. **Golden path: stats render with evidence.**
   *Given* a customer with 4 kept promises, 1 broken promise, and
   `lastSuccessfulChannel: "email"`, `lastSuccessfulTone: "neutral"`.
   *When* the operator opens the customer.
   *Then* the Behaviour column shows 80% promise-kept rate, the What Works
   column shows "Email · Neutral tone", and clicking the kept-rate tile
   opens an evidence drawer listing the five promises.

2. **Approval-required path: changing relationship tier requires senior
   approver.**
   *Given* the current user is `operator`.
   *When* they attempt to change the customer's relationship tier from
   `standard` to `strategic`.
   *Then* the dropdown is disabled with a tooltip "Senior approver required."

3. **Failure path: semantic memory degraded.**
   *Given* `integrationHealthSummary.degradedServices` includes
   `service: "vector_search"`.
   *When* the operator opens the customer.
   *Then* the Memory column shows a banner "Semantic search unavailable —
   showing structured memory only" and renders behavioural stats and policy
   memory normally.

4. **Adding a policy memory entry.**
   *Given* a customer with no policy entries.
   *When* the operator adds the rule "Never SMS — finance contact prefers
   email" and saves.
   *Then* the entry persists, an `audit_event{action: "customer_policy.added"}`
   is created, and the rule appears as a yellow chip on the Daily Cash
   Actions row for any future action targeting this customer.

5. **Cross-navigation: open a recent promise.**
   *Given* a customer with two recent pending promises.
   *When* the operator clicks a promise row.
   *Then* the Promise Board opens with the filter pre-applied to that
   `customerId` and the row scrolled into view.

---

## 6. Audit Drawer

### 6.1 Purpose

The single source of truth for "what happened, who did it, and why." Surfaces
the full chain of `AuditEvent` records for any object the operator drills
into. The drawer is **not** a separate page — it overlays from the right edge
on every other screen. As a standalone view it is also routable
(`/audit?targetKind=...&targetId=...`) for sharing.

The 60-second decision: "is this state correct, and if not, who do I talk to?"

### 6.2 Required data contract

```ts
import type {
  AuditEvent,                  // @runwayops/domain
  AuditActorType,              // @runwayops/domain
  AuditTargetKind,             // @runwayops/domain
  EvidenceRef,                 // @runwayops/domain
  DomainEvent,                 // @runwayops/domain
} from "...";

type AuditDrawerScreenInputs = {
  scope: { targetKind: AuditTargetKind; targetId: string }
       | { correlationId: string }
       | { companyWide: true; window: { from: string; to: string } };
  events: AuditEvent[];                              // sorted by occurredAt asc
  domainEventsByCorrelationId: Record<string, DomainEvent[]>;
  modelRunsById: Record<string, ModelRunRef>;        // SEE GAP — not in domain yet
  retrievalAttemptsById: Record<string, RetrievalAttemptRef>;  // SEE GAP #5
  evidenceById: Record<string, EvidenceRef>;
  pagination: { hasMore: boolean; cursor?: string };
};

type ModelRunRef = {
  id: string;
  modelProvider: string;
  modelId: string;
  promptHash: string;
  responseHash: string;
  startedAt: string;
  completedAt: string;
  costUsdMinor?: string;
};

type RetrievalAttemptRef = {
  id: string;
  intent: string;
  evidenceSufficient: boolean;
  insufficiencyReason?: string;
  selectedEvidenceRefs: EvidenceRef[];
};
```

**Notes:**

- `AuditEvent.actorType ∈ "system" | "user" | "ai" | "integration" |
  "workflow"`.
- `AuditEvent.targetKind ∈ "company" | "customer" | "invoice" | "payment" |
  "bank_transaction" | "obligation" | "promise_to_pay" | "forecast" |
  "collection_action" | "approval" | "message_draft" | "integration" |
  "domain_event"`.
- `AuditEvent.before` and `AuditEvent.after` are `Record<string, JsonValue>`
  — UI renders them as a JSON diff.
- `correlationId` and `causationEventId` allow the UI to thread events into a
  causal tree.

### 6.3 States

- **Empty** — `events.length === 0`. Render: "No audit events for this
  scope." (Should be rare; every mutation produces an event.)
- **Loading** — timeline skeleton.
- **Error (retryable)** — retry panel inside the drawer.
- **Error (non-retryable)** — 401/403/410.
- **Partial-data** — model runs or retrieval attempts unavailable: render
  events but show inline "Model run details unavailable" placeholders.
- **Data** — vertical timeline grouped by date, then by `correlationId`
  cluster. Each event card shows actor (with icon by `actorType`), action,
  target, before/after diff (collapsed), evidence chips, and links to the
  associated model run / retrieval attempt if any.

### 6.4 User actions

| Action                          | Required role | Side effects                                                                                            |
|---------------------------------|---------------|---------------------------------------------------------------------------------------------------------|
| Expand event                    | `viewer`      | None.                                                                                                   |
| Open before/after diff          | `viewer`      | None.                                                                                                   |
| Open evidence ref               | `viewer`      | Resolves to the source object viewer.                                                                   |
| Open model run                  | `viewer`      | Side-side panel showing prompt hash, response hash, cost, latency. Does not show prompt body in v1.     |
| Open retrieval attempt          | `viewer`      | Shows the rewritten query, selected evidence, and `insufficiencyReason` if any.                         |
| Replay correlation chain        | `admin`       | Opens a per-`correlationId` view with all linked events on a graph.                                     |
| Export audit slice              | `admin`       | `GET /audit/export?...`. Generates a signed CSV/JSON export. Logged as a meta-audit event.              |
| Filter (actor, action, target)  | `viewer`      | Updates the scope and re-fetches.                                                                       |

**Blocked actions:**

- Cannot delete or edit audit events. The drawer is append-only.
- Cannot mutate operational state from the drawer (it is purely an inspector).

### 6.5 Approval flow

The Audit Drawer has no approval surface — it is read-only for non-admins
and write-restricted (export only) for admins. Exports are themselves
audit-logged with `actorType: "user", action: "audit.exported"`.

### 6.6 Audit/evidence surface

The Audit Drawer **is** the audit surface. Every screen's "View history" link
opens it pre-scoped. Specific behaviours:

- For an approval-related event chain, the drawer must render the full
  **draft → approver → final-content → delivery-result** sequence as a
  single cluster.
- For an AI-generated promise classification, the drawer must show the
  associated `RetrievalAttempt` (rewritten query, selected evidence,
  `evidenceSufficient`).
- For an integration sync event, the drawer must show the source provider,
  the cursor advanced from/to, and any errors.
- The before/after diff for `customer.relationship_tier_changed` must show
  the old and new tier as a coloured badge change rather than raw JSON.

### 6.7 Playwright acceptance scenarios

1. **Golden path: full approval chain rendered.**
   *Given* an approval that was edited and approved, then sent successfully.
   *When* the operator opens the Audit Drawer scoped to the approval ID.
   *Then* the timeline shows, in order: `approval.requested`,
   `approval.edited`, `approval.granted`, `external_message.sent`. Each event
   is on the same `correlationId` cluster.

2. **Approval-required path: export requires admin.**
   *Given* the current user is `operator`.
   *When* they look for an export button.
   *Then* the export action is not visible. Logging in as `admin` reveals
   the export button.

3. **Failure path: model run details unavailable.**
   *Given* an `AuditEvent` produced by an AI classifier whose model run
   record is missing (sidecar service outage).
   *When* the operator expands the event.
   *Then* a placeholder reads "Model run details unavailable — only the
   classification result is shown" and the rest of the event renders
   normally.

4. **Failure path: retrieval attempt with insufficient evidence.**
   *Given* an AI classification whose `RetrievalAttempt.evidenceSufficient
   === false`.
   *When* the operator expands the linked retrieval attempt.
   *Then* the panel shows the `insufficiencyReason` and a yellow banner
   "Confidence was lowered because evidence was insufficient."

5. **Filter and share.**
   *Given* a finance manager wants to share the audit chain for one promise
   with a colleague.
   *When* they filter by `targetKind: "promise_to_pay", targetId: P-42`
   and copy the URL.
   *Then* opening the URL in a fresh session (with auth) renders the same
   filtered view, no stale data.

---

## 7. Integration Health

### 7.1 Purpose

Make connector reliability visible. Operator must see, in under 60 seconds:
which integrations are healthy, which are stale, which need reconnection,
and what to do next. This screen is the linked target for every partial-data
banner elsewhere in the product.

### 7.2 Required data contract

```ts
// SEE GAP #4 — these types are not yet exported from @runwayops/domain.
// The UI receives them via the API gateway from the integrations workers.

type IntegrationConnectionView = {
  id: string;
  companyId: string;
  provider:
    | "xero" | "quickbooks" | "truelayer" | "yapily"
    | "gocardless" | "gmail" | "outlook" | "stripe";
  category: "accounting" | "bank_data" | "email" | "payments";
  status:
    | "connected"
    | "disconnected"
    | "reconnect_required"
    | "rate_limited"
    | "auth_expired"
    | "syncing"
    | "error";
  connectedAt: string;
  connectedByUserId?: string;
  lastSuccessfulSyncAt?: string;
  lastFailedSyncAt?: string;
  lastFailureReason?: string;
  tokenExpiresAt?: string;
  reconnectRequired: boolean;
  webhookStatus?: "active" | "inactive" | "failing";
  syncLagSeconds?: number;
  unmappedObjectCount?: number;
  duplicateCandidateCount?: number;
};

type IntegrationHealthScreenInputs = {
  connections: IntegrationConnectionView[];
  staleThresholdHours: number;                 // policy
  scopesByProvider: Record<string, string[]>;
  reconnectUrls: Record<string, string>;       // provider → OAuth init URL
};
```

### 7.3 States

- **Empty** — no connections. Render: "No integrations connected." Show
  CTA cards for Xero, bank, email, payments.
- **Loading** — card grid skeleton.
- **Error (retryable)** — single retry panel.
- **Error (non-retryable)** — 401/403/410.
- **Partial-data** — one connection's details fetch failed; render its card
  in a degraded "details unavailable" state but still surface its name and
  a "Retry details" affordance.
- **Data** — grid of connection cards grouped by category. Each card shows
  status pill, last sync, next sync, token expiry countdown, sync lag, and
  primary CTA (Reconnect / Sync now / View errors).

### 7.4 User actions

| Action                         | Required role | Side effects                                                                                                                                  |
|--------------------------------|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| Connect new integration        | `admin`       | Redirects to `reconnectUrls[provider]` for OAuth. On callback, creates an `IntegrationConnection`. Audit-logged.                              |
| Reconnect                      | `admin`       | Same OAuth flow, preserves the connection ID. Audit-logged.                                                                                   |
| Disconnect                     | `admin`       | Marks connection `status: "disconnected"`. Does **not** delete synced data. Audit-logged with confirmation modal.                             |
| Sync now                       | `operator`+   | Enqueues a Temporal sync workflow. Audit-logged.                                                                                              |
| View sync errors               | `viewer`+     | Opens audit drawer scoped to `targetKind: "integration", targetId: connection.id`.                                                            |
| View raw provider payload      | `admin`       | Opens a `source_object` viewer (read-only JSON). Sensitive — admin-only.                                                                      |
| Edit OAuth scopes              | `admin`       | Re-runs OAuth with the requested scope set. Audit-logged.                                                                                     |

**Blocked actions:**

- Non-admins cannot connect, reconnect, or disconnect (these change tenant
  data access). The "Sync now" button is allowed for operators.
- Cannot manually edit a `lastSuccessfulSyncAt` or other observed state.
  Health is computed.

### 7.5 Approval flow

Connection mutations (connect, reconnect, disconnect) require `admin`. A
disconnect operation triggers a confirmation modal warning that synced data
will be retained but no new data will arrive. Disconnects do not delete
historical evidence, so audit chains remain valid.

### 7.6 Audit/evidence surface

- Every connection card has a "View history" affordance opening the Audit
  Drawer filtered by `targetKind: "integration"`.
- Every sync produces an
  `audit_event{action: "integration.sync_completed" | "integration.sync_failed"}`
  with `before`/`after` showing the cursor advance and (on failure) the
  failure reason.
- Token refreshes are audit-logged but redacted (no token bodies).

### 7.7 Playwright acceptance scenarios

1. **Golden path: all connected, all healthy.**
   *Given* four healthy connections with `lastSuccessfulSyncAt` within
   `staleThresholdHours`.
   *When* the admin opens the screen.
   *Then* every card shows a green status pill and the last-sync time in
   relative terms ("4 minutes ago"). No banners.

2. **Approval-required path: disconnect requires admin + confirmation.**
   *Given* the current user is `operator`.
   *When* they look for a disconnect button.
   *Then* it is not visible. Logging in as admin shows the button; clicking
   it opens a confirmation modal warning about data retention.

3. **Failure path: Xero auth expired.**
   *Given* the Xero connection has `status: "auth_expired"` and
   `reconnectRequired: true`.
   *When* the admin opens the screen.
   *Then* the Xero card shows a red status pill, a primary "Reconnect Xero"
   CTA, and a sub-line "Last successful sync 2 days ago — forecast may be
   stale." Clicking Reconnect opens the OAuth URL.

4. **Failure path: sync errors visible.**
   *Given* a bank connection with `lastFailedSyncAt` more recent than
   `lastSuccessfulSyncAt` and `lastFailureReason: "rate_limited"`.
   *When* the admin clicks "View sync errors."
   *Then* the Audit Drawer opens scoped to that integration showing the
   failure event chain.

5. **Empty state.**
   *Given* a brand-new tenant with no connections.
   *When* the admin opens the screen.
   *Then* the empty illustration appears with four CTA cards labelled
   "Connect Xero", "Connect bank feed", "Connect Gmail", "Connect Stripe."
   The rest of the app shows a global read-only banner (see §X1).

---

## X1. Global states

These behaviours apply across every screen.

### X1.1 Auth loading

While the auth token is being validated on initial load, render a
single-screen splash with the RunwayOps wordmark. Do not render any tenant
data, even if cached.

### X1.2 Tenant switch

The user may belong to multiple `companyId`s. The tenant switcher is in the
top-right. Switching tenants:

- Drains all in-flight requests scoped to the previous tenant.
- Clears the per-tenant cache.
- Re-fetches the home screen (Daily Cash Actions) for the new tenant.
- Writes an `audit_event{actorType: "user", action: "tenant.switched"}` to
  the new tenant's audit log.

### X1.3 Integration-down banner

If any connection has `status ∈ {"disconnected", "auth_expired",
"reconnect_required"}`, every screen shows a thin top banner:

> "{provider} needs reconnection. Some data may be stale. **Open Integration
> Health** →"

The banner is dismissible per session, but reappears on next reload until
the connection is healthy. A banner cannot be dismissed if the integration
in question is **required** for the screen the operator is viewing (e.g.
Daily Cash Actions when accounting is disconnected).

### X1.4 Stale-data banner

If `forecast.generatedAt` or `connection.lastSuccessfulSyncAt` is older than
`staleThresholdHours` (default: 6 for forecast, 4 for accounting, 1 for
bank), every screen that depends on that data renders a yellow inline
banner naming the staleness and the underlying integration.

### X1.5 Read-only mode

When **no integrations are connected** (typical for a brand-new tenant or
sandbox), the entire app enters read-only mode:

- All "Approve / Send / Edit / Sync now / Connect" affordances are disabled.
- A persistent yellow banner at the top reads "Read-only mode — connect at
  least one integration to enable actions. **Open Integration Health** →"
- Any cached fixture data (e.g. seeded demo workspace) is clearly tagged
  with "DEMO" pills.
- The Approval Inbox shows a special illustration: "No integrations means no
  approvable actions yet."

### X1.6 Permission-denied

If the user attempts an action above their role, render an inline tooltip
naming the required role rather than a generic "permission denied". This
mirrors the role-required gating on the Approval Inbox and Customer Memory
screens.

### X1.7 Network offline

When the browser reports `navigator.onLine === false`:

- A persistent red banner reads "You are offline. Mutations will fail until
  connection is restored."
- All mutating affordances are disabled. Read-only views render from the
  most recent cache.

---

## X2. Approval policy reference

This section maps approval requirements to roles and links to the spec
sections that define them. The UI **must** enforce these gates client-side
(for affordance enablement) and the API **must** enforce them server-side
(for safety). Client-side enforcement is a UX courtesy, not a security
boundary.

### X2.1 Role definitions

| Role               | Capabilities                                                                                             |
|--------------------|---------------------------------------------------------------------------------------------------------|
| `viewer`           | Read all screens. Open evidence drawers. No mutations.                                                   |
| `operator`         | Viewer + create approval requests, edit drafts, defer actions, edit customer policy memory, sync now.    |
| `approver`         | Operator + approve/reject/edit standard external messages and supplier-timing approvals up to threshold. |
| `senior_approver`  | Approver + approve over-threshold amounts, change relationship tier, escalate, approve `accounting_writeback`. |
| `admin`            | All above + connect/disconnect integrations, view raw provider payloads, export audit slices, manage roles. |

### X2.2 Action-by-action approval matrix

Cross-reference: spec §7.2 (agentic boundary), §7.3, §23.1, §23.2;
plan §19.

| Action                                                              | Required approver role           | Always blocked? | Spec / plan ref         |
|---------------------------------------------------------------------|----------------------------------|-----------------|-------------------------|
| Send external customer email                                        | `approver`                       | —               | spec §23.2; plan §19.1  |
| Send external customer SMS                                          | `approver`                       | —               | spec §23.2              |
| Phone-task assignment (internal)                                    | `operator`                       | —               | plan §14.2              |
| Founder escalation message                                          | `senior_approver`                | —               | spec §14.4 (policy)     |
| Payment-plan proposal to customer                                   | `senior_approver`                | —               | spec §23.2              |
| Supplier-timing recommendation (read-only / draft only)             | `approver`                       | —               | spec §23.2; §6.5        |
| Send supplier message                                               | `senior_approver`                | —               | spec §23.2              |
| Accounting writeback (Xero/QuickBooks)                              | `senior_approver`                | —               | spec §23.2; plan §19    |
| Change relationship tier                                            | `senior_approver`                | —               | §5.4 above              |
| Manual promise reclassification / outcome override                  | `operator`                       | —               | §3.4 above              |
| Force forecast recompute                                            | `operator`                       | —               | §2.4 above              |
| Connect / reconnect / disconnect integration                        | `admin`                          | —               | §7.4 above              |
| View raw provider payload                                           | `admin`                          | —               | §7.4 above              |
| Audit export                                                        | `admin`                          | —               | §6.4 above              |
| **Initiate outbound payment / move money**                          | —                                | **Yes**         | spec §0, §5.4, §23.1    |
| **Autonomous send (no human in loop)**                              | —                                | **Yes**         | spec §7.3, §18.4        |
| **Autonomous supplier delay / negotiation**                         | —                                | —               | spec §5.4, §23.1        |
| **Autonomous AI voice call**                                        | —                                | **Yes**         | spec §3.3, §23.1        |
| **Direct ledger writes without approval**                           | —                                | **Yes**         | spec §7.3               |
| **Threaten legal action without senior_approver**                   | —                                | **Yes** (block) | spec §7.3, §14.4        |
| **Override approval policy**                                        | —                                | **Yes**         | spec §7.3               |
| **Delete data**                                                     | —                                | **Yes**         | spec §7.3               |
| **Decide access permissions** (programmatic role assignment)        | `admin` only                     | —               | spec §7.3, §23.4        |

### X2.3 Amount thresholds (defaults — configurable per company)

| Threshold                                                  | Default       | Effect                                                                  |
|------------------------------------------------------------|---------------|-------------------------------------------------------------------------|
| `senior_approver_amount_threshold`                         | £20,000       | Approvals where `expectedCashImpact ≥ threshold` require senior approver.|
| `legal_wording_blocks`                                     | enforced      | Drafts containing legal-threat phrases (regex set) become `severity: "block"` warnings until cleared by senior_approver. |
| `cfo_required_for_legal`                                   | enforced      | If a draft mentions legal escalation, only `senior_approver` (or higher) can approve.                                    |
| `relationship_tier_strategic_requires_senior`              | enforced      | Any external message to a `relationshipTier: "strategic"` customer requires senior_approver.                             |

### X2.4 Policy warning rendering

`PolicyWarning.severity` maps to UI as:

- `info` — gray pill, no gating.
- `warn` — yellow pill, Approve allowed but warning is required to be shown.
- `block` — red pill, Approve disabled until rule is cleared (cleared by
  manual edit removing the trigger, or by reassigning to a higher role
  that satisfies the rule).

---

## X3. Evidence and audit invariants

These invariants are global. The UI **must** assume them; the API
**must** enforce them. If any invariant is violated, the UI surfaces an
error rather than rendering misleading data.

### X3.1 Recommendation evidence invariant

> **Every recommendation must surface its evidence refs.**

Concretely:

- `RankedCollectionAction.evidenceRefs.length ≥ 1` (cash-engine guarantees
  this; the UI displays the chips).
- Every `PromiseToPay` has `evidenceRefs` (domain Zod schema enforces
  `requiredEvidenceRefsSchema`, min length 1).
- Every `CashForecast` has `evidenceRefs` (domain Zod schema enforces).
- Every `ApprovalRequest` has `evidenceRefs` (domain Zod schema enforces).
- If a recommendation arrives at the UI with empty evidence refs, the UI
  refuses to render the Approve / Send affordances and shows a red row-level
  error: "Evidence missing — cannot act on this recommendation. Open Audit
  Drawer for diagnosis."

### X3.2 Mutation audit invariant

> **Every mutation must produce an `AuditEvent`.**

Concretely:

- The UI never displays a state change without a corresponding event
  visible in the Audit Drawer.
- After a mutation, the UI optimistically updates and then reconciles with
  the server's emitted `AuditEvent`. A reconciliation timeout (default 10s)
  surfaces a toast: "Audit event not yet observed — refresh to verify."
- The UI never offers an "edit silently" mode. Even free-text fields like
  customer policy memory write before/after diffs.

### X3.3 External-action chain invariant

> **Every external action must show the full chain: draft → approver →
> final-content → delivery-result.**

Concretely:

- Draft creation produces `audit_event{action: "message_draft.created"}`
  linked to the operator (or AI) who created it.
- Approval request produces `approval.requested`.
- Approval decision produces one of `approval.granted | approval.rejected |
  approval.edited`. Edited decisions retain `editedPayload` containing the
  final content.
- Delivery produces `external_message.sent` (or the failure variant) with
  the final delivered content snapshotted.
- All four (or five, with edit) events share a `correlationId` and chain
  via `causationEventId`.
- The Approval Inbox card and the Audit Drawer must render this chain in
  full when expanded. If any link is missing, the chain is rendered with a
  visible gap and a "Missing audit link — investigate" affordance.

### X3.4 No-AI-mutation invariant

> **No LLM output mutates operational state directly.**

Concretely (UI-side responsibilities):

- Every mutation comes from an operator or approver action. Even AI-drafted
  promises and ranked actions are presented as **proposals** that require
  evidence.
- The UI never shows a "Send without review" affordance, regardless of
  policy.
- Where AI-generated content is shown alongside a human action (e.g. in the
  Approval Inbox), the AI-original is always retrievable and visually
  distinct from the human-edited final.

### X3.5 Read-only-over-canonical invariant

> **Cash arithmetic is never recomputed in the UI.**

Concretely:

- The UI does not re-derive `priorityScore`, `riskStatus`, `shortfallAmount`,
  `confidenceWeightedInflows`, or any other cash quantity. It renders what
  the cash engine produced.
- Sorting and filtering may reorder the existing data but never re-rank.
- If the operator wants a fresh ranking, they trigger a server-side
  recompute (audit-logged).

---

## Y. Contract gaps for the integrator

These are real or near-term gaps in `@runwayops/domain` and
`@runwayops/cash-engine` that the UI will hit. None of them block this
document; they need decisions before round 3 of UI implementation. The
integrator decides whether each lands in domain, cash-engine, or a sibling
package.

| #   | Gap                                                                                                             | Recommendation                                                                                                                                                              |
|-----|-----------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1   | Two parallel "action type" enums: `CollectionActionType` (domain: channel-flavoured, e.g. `email`) vs `CollectionActionKind` (cash-engine: intent-flavoured, e.g. `send_payment_reminder`). The UI needs both. | Treat them as orthogonal and rename. Domain → `actionChannel`. Cash-engine → `actionKind`. Embed both on `CollectionAction`. Or: model `kind` as the canonical and derive channel separately. |
| 2   | `CustomerPaymentStats` lives in cash-engine only. Customer Memory needs a domain-level `CustomerMemoryCard` covering structured stats + semantic memory + policy memory. | Add `customer-memory.ts` to `@runwayops/domain` exporting `CustomerMemoryCard`, `SemanticMemoryChunk`, `CustomerPolicyEntry`. Cash-engine continues to consume the structured stat sub-shape.  |
| 3   | No `MessageDraft` type. `RankedCollectionAction.draftMessageId` references it; Approval Inbox and Daily Cash Actions need its full shape (channel, tone, body, payment link, model run id, evidence). | Add `message-draft.ts` to `@runwayops/domain` with a Zod schema. Status enum mirrors the plan's draft lifecycle (`drafted | approval_requested | approved | edited | rejected | deferred | executed | failed | cancelled`). |
| 4   | No `IntegrationConnection` / `IntegrationHealth` schema in domain. Plan §14.2 requires a full Integration Health UI; the §11.5 tables exist but no exported types. | Add `integration.ts` to `@runwayops/domain` exporting `IntegrationConnection`, `SyncJob`, `WebhookEventLog`, with status enums.                                              |
| 5   | No `RetrievalAttempt` in domain. Spec §22.2 defines it; Audit Drawer needs it to render evidence-sufficiency.    | Add `retrieval.ts` to `@runwayops/domain` exporting `RetrievalAttempt` (reuse `EvidenceRef`).                                                                                |
| 6   | No `CommunicationThread` / `CommunicationMessage` in domain. Approval Inbox needs prior thread context; Promise Board's source-message evidence resolves to nothing. | Add `communication.ts` to `@runwayops/domain` with `CommunicationThread`, `CommunicationMessage`, `MessageParticipant`, plus `messageDirection` enum.                        |
| 7   | Two parallel `ForecastCashFlow` shapes between domain (`expectedDate`, has `direction`, `kind` includes `manual_adjustment`) and cash-engine (`date`, has `kind` including `supplier_bill`/`critical_obligation`). | Pick one. Recommend cash-engine as authoritative for the live forecast, with the domain Zod schema validating the wire shape on ingestion only. Document the intended drift. |
| 8   | No `CompanyPolicy` / `PolicyRule` type for company-wide policy memory ("never SMS strategic", "founder approval > £20k"). Spec §14.4 lists these; the UI needs them on the Approval Inbox. | Add `policy.ts` to `@runwayops/domain` exporting `CompanyPolicy`, `PolicyRule` with `severity`, `scope`, evidence.                                                            |
| 9   | No `SourceObject` type exported. Spec §15.2 defines it; "drill into raw provider payload" on Integration Health and Audit Drawer is undefined. | Add `source-object.ts` to `@runwayops/domain` exporting `SourceObject` matching the spec.                                                                                    |
| 10  | `RankedCollectionAction.actionId` is a composite string (`action:{companyId}:{invoiceId}:{kind}`), not a `CollectionAction.id`. Drilling from a ranked action into the stored action requires a server-side join the API must provide. | Either (a) cash-engine returns the persisted `CollectionAction.id` after a write step, or (b) the API provides a resolver `GET /collection-actions/by-rank/:actionId`. Recommend (a) — write the ranked action, then return the persisted ID. |
| 11  | `ObligationRisk.dependentInflowIds: string[]` resolves only against `forecast.expectedInflows` (also string-keyed by `id`). The Forecast screen drill-in needs that map to be present in every API response that ships an `ObligationRisk`. | Bundle `expectedInflowsById` alongside any forecast response. Document this in the API shape contract (plan §14.3).                                                          |
| 12  | `ApprovalDecision.editedPayload: JsonRecord` is unstructured. The Approval Inbox needs typed shapes per `subjectKind` so the UI can render diffs. | Tag `editedPayload` with a `kind` discriminator matching `ApprovalRequest.subjectKind`. Or: provide `ApprovalDecisionEditedPayload` as a discriminated union per subject kind. |

---

## Z. Open product questions

These decisions were not in scope for this worker; flagging for the
integrator to decide before round 3:

1. **Critical-Obligation Case Mode screen** — the master spec lists it (spec
   §6.4) and the implementation plan defers it to phase 5 (plan §20). It is
   **not in the seven screens above** because it was explicitly out of
   scope. Confirm whether the UI shell should reserve a route stub for it
   now (so navigation can grow) or treat it as a fully separate workstream.

2. **Collections Queue** — the master spec (§10.1) and implementation plan
   (§14.2) both list a "Collections Queue" screen distinct from Daily Cash
   Actions. The brief named seven screens that include "Daily Cash Actions"
   but not "Collections Queue." This document treats Collections Queue as a
   superset listing reachable from Daily Cash Actions ("View all"), not as
   a first-class screen. Confirm or add it.

3. **Admin / Policy Controls screen** — listed in spec §10.1 but not in the
   seven screens. Decisions like company-wide policy rules, role
   assignments, threshold configuration, and integration scopes need a
   home. Confirm whether Integration Health absorbs the integration-related
   admin surface and a separate Admin / Policy screen is added later, or
   whether it should be consolidated into Integration Health from day one.

4. **Tenant model in URL** — should `/companies/:companyId/...` be the URL
   structure (matching the API shape in plan §14.3), or should `companyId`
   live in a header/cookie and URLs stay tenant-implicit? Affects sharing
   audit-drawer URLs across users.

5. **Approval queue scoping** — should the Approval Inbox show only
   approvals where `assignedApproverId === currentUser.id` (Gmail-style),
   or should it show all approvals with a filter (Linear-style)? Default
   in this document: all visible, with a "Mine only" filter. Confirm.

6. **Real-time updates** — the Audit Drawer reconciliation invariant (§X3.2)
   assumes the UI either polls or subscribes. Confirm transport (SSE vs.
   WebSocket vs. polling). Affects how the optimistic-update toast logic
   is implemented.

7. **Currency display** — `Money.amountMinor: bigint`. Confirm rounding,
   grouping, and currency-symbol policy for non-base-currency display
   (e.g. an invoice in EUR for a GBP-based company). Related: forecast
   scenarios all assume `baseCurrency`.

8. **Demo/sandbox mode visual treatment** — when integrations are not
   connected and a demo workspace is loaded, what is the visual delta?
   Pills, watermarks, and disabled-mutation behaviour are described above
   but the brand decision is not made.

9. **Mobile** — the brief does not mention mobile. The screens above
   assume desktop. Confirm whether a mobile-responsive variant is in
   scope for round 3.

10. **i18n** — copy in this document is English (UK). The first market is
    UK B2B SMEs (spec §0). Confirm whether the UI must be i18n-ready from
    day one or English-only for v1.

---

## End of document.
