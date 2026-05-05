import {
  DEMO_CASE,
  buildForecastSequence,
  formatCurrency
} from "@/lib/forecast";
import type { CashflowForecast, RiskStatus } from "@/lib/types";

export type DemoPhase = "baseline" | "reply" | "bank";
export type WorkerStatus = "complete" | "running" | "queued" | "pending";

export const phaseOrder: Record<DemoPhase, number> = {
  baseline: 0,
  reply: 1,
  bank: 2
};

const forecasts = buildForecastSequence();

export const phaseForecasts: Record<DemoPhase, CashflowForecast> = {
  baseline: forecasts[0],
  reply: forecasts[1],
  bank: forecasts[2]
};

export const phaseSummary: Record<
  DemoPhase,
  {
    riskStatus: RiskStatus;
    cashLabel: string;
    projectedGapLabel: string;
    projectedGapDetail: string;
    forecastVersion: string;
    planVersion: string;
    supplierRecommendation: string;
    supplierDetail: string;
    caseStateLabel: string;
    headline: string;
  }
> = {
  baseline: {
    riskStatus: "high",
    cashLabel: formatCurrency(DEMO_CASE.cashToday),
    projectedGapLabel: formatCurrency(5200),
    projectedGapDetail: "if MotionPrint is paid and invoices slip",
    forecastVersion: "v1",
    planVersion: "v1",
    supplierRecommendation: "Full delay",
    supplierDetail: "Hold MotionPrint inside the 5-day no-penalty grace window.",
    caseStateLabel: "Case opened",
    headline: "Payroll risk is high until collections land or supplier timing changes."
  },
  reply: {
    riskStatus: "high",
    cashLabel: formatCurrency(DEMO_CASE.cashToday),
    projectedGapLabel: formatCurrency(2800),
    projectedGapDetail: "with MotionPrint held and Northstar unconfirmed",
    forecastVersion: "v2",
    planVersion: "v2",
    supplierRecommendation: "Full delay",
    supplierDetail: "Northstar reply is conditional, so the supplier hold remains firm.",
    caseStateLabel: "Reply classified",
    headline: "Northstar is helpful, but not guaranteed cash."
  },
  bank: {
    riskStatus: "watch",
    cashLabel: `${formatCurrency(DEMO_CASE.cashToday)} -> ${formatCurrency(
      DEMO_CASE.cashToday + DEMO_CASE.harbourRetainerAmount
    )}`,
    projectedGapLabel: formatCurrency(1600),
    projectedGapDetail: "if Northstar slips after Harbour Labs pays",
    forecastVersion: "v3",
    planVersion: "v3",
    supplierRecommendation: "Conditional hold",
    supplierDetail: "Release MotionPrint only after Friday morning cash confirmation.",
    caseStateLabel: "Live replanned",
    headline: "Risk moved to watch, not safe."
  }
};

export const commandFacts = {
  companyName: DEMO_CASE.companyName,
  caseRef: DEMO_CASE.caseRef,
  payrollDue: formatCurrency(DEMO_CASE.payrollDue),
  payrollDate: "Friday 8 May",
  timeToPayroll: "4 days",
  approvalsPending: 3,
  founder: "Emma Marlow",
  financeLead: "Jules Finch"
};

export const eventRows = [
  {
    id: "evt_scan_001",
    phase: "baseline",
    eventType: "scheduler.payroll_scan",
    label: "Payroll-risk scan found Friday shortfall",
    time: "09:00:02",
    change: "event_inbox +1"
  },
  {
    id: "evt_case_001",
    phase: "baseline",
    eventType: "case.opened",
    label: "PR-2026-0508 opened for Marlow & Finch",
    time: "09:01:00",
    change: "cases +1"
  },
  {
    id: "evt_forecast_001",
    phase: "baseline",
    eventType: "forecast.v1_created",
    label: "Baseline gap calculated at £5,200",
    time: "09:01:14",
    change: "cashflow_forecasts v1"
  },
  {
    id: "evt_drafts_001",
    phase: "baseline",
    eventType: "drafts.created",
    label: "Northstar, Blue Finch, and MotionPrint approvals queued",
    time: "09:01:32",
    change: "collection_drafts +3"
  },
  {
    id: "evt_plan_001",
    phase: "baseline",
    eventType: "payment_plan.v1_created",
    label: "MotionPrint full delay recommendation written",
    time: "09:01:48",
    change: "payment_run_plans v1"
  },
  {
    id: "evt_email_001",
    phase: "reply",
    eventType: "email.received",
    label: "Northstar: should be able to pay Friday after PO re-approval",
    time: "10:15:00",
    change: "event_inbox +1"
  },
  {
    id: "evt_trigger_001",
    phase: "reply",
    eventType: "atlas_trigger.fired",
    label: "Workflow woke from event_inbox",
    time: "10:15:03",
    change: "tasks +2"
  },
  {
    id: "evt_classified_001",
    phase: "reply",
    eventType: "reply.classified",
    label: "conditional_promise, confidence 0.48, guaranteed cash: no",
    time: "10:15:10",
    change: "retrieval_attempts +1"
  },
  {
    id: "evt_forecast_002",
    phase: "reply",
    eventType: "forecast.v2_created",
    label: "Risk remains high with scenario split preserved",
    time: "10:15:17",
    change: "cashflow_forecasts v2"
  },
  {
    id: "evt_bank_001",
    phase: "bank",
    eventType: "bank.transaction.posted",
    label: "Harbour Labs retainer posted",
    time: "10:22:04",
    change: "+£1,200"
  },
  {
    id: "evt_forecast_003",
    phase: "bank",
    eventType: "forecast.v3_created",
    label: "Cash now £9,600; risk high -> watch",
    time: "10:22:12",
    change: "cashflow_forecasts v3"
  },
  {
    id: "evt_plan_003",
    phase: "bank",
    eventType: "payment_plan.v3_created",
    label: "MotionPrint changed from full delay to conditional hold",
    time: "10:22:14",
    change: "payment_run_plans v3"
  },
  {
    id: "evt_briefing_001",
    phase: "bank",
    eventType: "briefing.generated",
    label: "Founder briefing generated from forecast v3 and plan v3",
    time: "10:22:18",
    change: "founder_briefings +1"
  },
  {
    id: "evt_memory_001",
    phase: "bank",
    eventType: "memory_card.written",
    label: "Northstar PO-dependent payment behaviour stored",
    time: "10:22:20",
    change: "memory_cards +1"
  }
] as const;

export const runwayTimeline = [
  {
    day: "Mon 4 May",
    title: "Case opened",
    amount: formatCurrency(DEMO_CASE.cashToday),
    detail: "Opening cash balance",
    phase: "baseline"
  },
  {
    day: "Thu 7 May",
    title: "MotionPrint due",
    amount: `-${formatCurrency(DEMO_CASE.supplierAmount)}`,
    detail: "MotionPrint has 5-day no-penalty grace terms",
    phase: "baseline"
  },
  {
    day: "Fri 8 May",
    title: "Payroll due",
    amount: `-${formatCurrency(DEMO_CASE.payrollDue)}`,
    detail: "Non-deferrable payroll obligation",
    phase: "baseline"
  },
  {
    day: "Fri 8 May",
    title: "Northstar conditional",
    amount: `+${formatCurrency(DEMO_CASE.northstarInvoiceAmount)}`,
    detail: "Depends on explicit PO/payment confirmation",
    phase: "reply"
  },
  {
    day: "Wed 6 May",
    title: "Harbour Labs posted",
    amount: `+${formatCurrency(DEMO_CASE.harbourRetainerAmount)}`,
    detail: "Open-Banking-style bank transaction event",
    phase: "bank"
  }
] as const;

export const invoicePriority = [
  {
    customer: "Northstar Studio",
    invoice: "INV-1042",
    amount: formatCurrency(DEMO_CASE.northstarInvoiceAmount),
    age: "18 days overdue",
    reason: "Highest payroll leverage; PO-dependent payer",
    action: "Ask for explicit PO/payment confirmation",
    behaviour: "Usually pays after a second nudge — worth chasing first"
  },
  {
    customer: "Blue Finch Ltd",
    invoice: "INV-1048",
    amount: formatCurrency(2200),
    age: "7 days overdue",
    reason: "Backup collection target; ignores friendly nudges",
    action: "Use formal finance-team wording with invoice attached",
    behaviour: "Reliable, just slow — a firmer reminder usually works"
  },
  {
    customer: "Ember & Co",
    invoice: "INV-0996",
    amount: formatCurrency(6500),
    age: "31 days overdue",
    reason: "Long-tail risk; not load-bearing this week",
    action: "Personal note from founder once payroll clears",
    behaviour: "Slow payer — may need a personal note from you"
  }
] as const;

type WhatChangedItem = {
  label: string;
  tone: "amber" | "muted";
};

export const whatChangedByPhase: Record<DemoPhase, ReadonlyArray<WhatChangedItem>> = {
  baseline: [
    { label: "Northstar still hasn't paid · 18 days late", tone: "amber" },
    { label: "Blue Finch reminder due", tone: "amber" },
    { label: "MotionPrint bill arrives Thursday", tone: "amber" },
    { label: "Payroll runs Friday morning", tone: "amber" }
  ],
  reply: [
    { label: "Northstar replied — promise is conditional on PO", tone: "amber" },
    { label: "Forecast v2 saved · risk still HIGH", tone: "amber" },
    { label: "Blue Finch reminder still pending", tone: "muted" },
    { label: "MotionPrint bill arrives Thursday", tone: "muted" }
  ],
  bank: [
    { label: "Harbour Labs paid £1,200 retainer", tone: "amber" },
    { label: "Risk eased to WATCH · forecast v3 saved", tone: "amber" },
    { label: "MotionPrint moved from full delay to conditional hold", tone: "amber" },
    { label: "Founder briefing ready · memory written", tone: "muted" }
  ]
};

export const yourPlanByPhase: Record<DemoPhase, { title: string; body: string; cta: string }> = {
  baseline: {
    title: "Your plan",
    body:
      "If you approve the three drafts on the right, payroll clears Friday assuming Northstar pays. If they don't, we'll need a backup plan — I'll watch and let you know.",
    cta: "Why I'm recommending this"
  },
  reply: {
    title: "Your plan",
    body:
      "Northstar's reply is helpful but conditional, so I'm keeping payroll at high risk until the PO is confirmed. Approve the follow-up email and stay holding MotionPrint.",
    cta: "Why I'm not marking this safe"
  },
  bank: {
    title: "Your plan",
    body:
      "Harbour Labs landed £1,200, so risk is now WATCH — not safe. If you keep MotionPrint on conditional hold and Northstar pays Friday, you'll finish with £800 after both bills. I'll keep watching.",
    cta: "Why WATCH and not SAFE"
  }
};

export const headlineFacts = {
  shortBy: formatCurrency(5200),
  greeting: "Good morning, Emma",
  approvalsCopy: "3 actions ready for you"
};

export type AgentSummary = {
  name: string;
  status: WorkerStatus;
  summary: string;
};

export const agentSummaryByPhase: Record<DemoPhase, ReadonlyArray<AgentSummary>> = {
  baseline: [
    { name: "Event Router", status: "complete", summary: "Opened the case from this morning's scan." },
    { name: "Forecast Agent", status: "complete", summary: "Worked out the £5,200 Friday gap." },
    { name: "Customer Memory", status: "complete", summary: "Picked Northstar as the first call to make." },
    { name: "Collections Agent", status: "complete", summary: "Drafted the customer reminders." },
    { name: "Payment Run Agent", status: "complete", summary: "Recommended delaying MotionPrint." },
    { name: "Audit & Learning", status: "queued", summary: "Will write the briefing once events land." }
  ],
  reply: [
    { name: "Event Router", status: "complete", summary: "Routed Northstar's reply into the case." },
    { name: "Forecast Agent", status: "complete", summary: "Saved forecast v2 — risk still HIGH." },
    { name: "Customer Memory", status: "complete", summary: "Flagged the reply as conditional." },
    { name: "Collections Agent", status: "complete", summary: "Refined the Northstar follow-up." },
    { name: "Payment Run Agent", status: "queued", summary: "Holding MotionPrint plan until cash lands." },
    { name: "Audit & Learning", status: "queued", summary: "Briefing waits on the bank event." }
  ],
  bank: [
    { name: "Event Router", status: "complete", summary: "Routed Harbour Labs' bank transaction." },
    { name: "Forecast Agent", status: "complete", summary: "Saved forecast v3 — risk eased to WATCH." },
    { name: "Customer Memory", status: "complete", summary: "Kept the conditional flag on Northstar." },
    { name: "Collections Agent", status: "complete", summary: "Drafts ready for your approval." },
    { name: "Payment Run Agent", status: "complete", summary: "Switched supplier to conditional hold." },
    { name: "Audit & Learning", status: "complete", summary: "Briefing and memory written." }
  ]
};

export type MongoCounter = {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
};

export type MongoStateSnapshot = {
  status: "connected" | "syncing";
  message: string;
  counters: ReadonlyArray<MongoCounter>;
};

export const mongoStateByPhase: Record<DemoPhase, MongoStateSnapshot> = {
  baseline: {
    status: "connected",
    message: "Atlas is durably storing this case so nothing is lost.",
    counters: [
      { label: "Active case", value: "1", hint: "PR-2026-0508" },
      { label: "Events on timeline", value: "5" },
      { label: "Pending approvals", value: "3" },
      { label: "Forecast versions", value: "v1", hint: "1 saved" },
      { label: "Plan versions", value: "v1", hint: "1 saved" },
      { label: "Memory written", value: "0" }
    ]
  },
  reply: {
    status: "connected",
    message: "Atlas saved Northstar's reply and the new forecast.",
    counters: [
      { label: "Active case", value: "1", hint: "PR-2026-0508" },
      { label: "Events on timeline", value: "9" },
      { label: "Pending approvals", value: "3" },
      { label: "Forecast versions", value: "v2", hint: "2 saved" },
      { label: "Plan versions", value: "v2", hint: "2 saved" },
      { label: "Memory written", value: "0", hint: "queued" }
    ]
  },
  bank: {
    status: "connected",
    message: "Atlas saved the bank event, the new plan, and the briefing.",
    counters: [
      { label: "Active case", value: "1", hint: "PR-2026-0508" },
      { label: "Events on timeline", value: "14" },
      { label: "Pending approvals", value: "3" },
      { label: "Forecast versions", value: "v3", hint: "3 saved" },
      { label: "Plan versions", value: "v3", hint: "3 saved" },
      { label: "Memory written", value: "1", hint: "Northstar PO rule", highlight: true }
    ]
  }
};

export type AuditTrailItem = {
  collection: string;
  count: string;
  english: string;
};

export const auditTrailByPhase: Record<DemoPhase, ReadonlyArray<AuditTrailItem>> = {
  baseline: [
    { collection: "event_inbox", count: "1 event", english: "Morning scan that opened this case." },
    { collection: "agent_runs", count: "5 steps", english: "Five agents worked through the baseline." },
    { collection: "retrieval_attempts", count: "1 search", english: "Memory looked up Northstar's payment behaviour." },
    { collection: "cashflow_forecasts", count: "v1", english: "Initial forecast — £5,200 short on Friday." },
    { collection: "payment_run_plans", count: "v1", english: "First plan — delay MotionPrint by 5 days." },
    { collection: "decision_log", count: "1 entry", english: "Why the supplier delay is the right call." },
    { collection: "memory_cards", count: "0 written", english: "Will be written after the case settles." }
  ],
  reply: [
    { collection: "event_inbox", count: "2 events", english: "Northstar's reply joined the morning scan." },
    { collection: "agent_runs", count: "9 steps", english: "Memory, Forecast, and Collections re-ran." },
    { collection: "retrieval_attempts", count: "2 searches", english: "Hybrid search saw the conditional promise." },
    { collection: "cashflow_forecasts", count: "v2", english: "Risk stayed HIGH — the reply isn't guaranteed cash." },
    { collection: "payment_run_plans", count: "v2", english: "Plan unchanged — MotionPrint stays held." },
    { collection: "decision_log", count: "2 entries", english: "Why the reply doesn't move risk." },
    { collection: "memory_cards", count: "0 written", english: "Queued until the case settles." }
  ],
  bank: [
    { collection: "event_inbox", count: "3 events", english: "Bank transaction joined the timeline." },
    { collection: "agent_runs", count: "14 steps", english: "All six agents ran — Audit closed the loop." },
    { collection: "retrieval_attempts", count: "2 searches", english: "Memory reused for the new forecast." },
    { collection: "cashflow_forecasts", count: "v3", english: "Risk eased to WATCH after Harbour Labs paid." },
    { collection: "payment_run_plans", count: "v3", english: "Plan switched to conditional hold on MotionPrint." },
    { collection: "decision_log", count: "3 entries", english: "Why WATCH is the right risk level — not SAFE." },
    { collection: "memory_cards", count: "1 written", english: "Northstar PO-conditional rule saved for next case." }
  ]
};

export const approvalQueue = [
  {
    title: "Northstar confirmation email",
    owner: "Emma Marlow",
    status: "pending human approval",
    due: "Today",
    collection: "collection_drafts"
  },
  {
    title: "Blue Finch formal reminder",
    owner: "Jules Finch",
    status: "pending human approval",
    due: "Today",
    collection: "collection_drafts"
  },
  {
    title: "MotionPrint conditional hold",
    owner: "Emma Marlow",
    status: "pending human approval",
    due: "Before Thursday",
    collection: "tasks"
  }
] as const;

export type OutreachChannel = "email" | "phone" | "both";

type DraftRow = {
  title: string;
  subtitle: string;
  status: string;
  channel: OutreachChannel;
  whyChannel: string;
  body: string;
  voiceScript: string;
  evidence: string;
};

export const draftRows: ReadonlyArray<DraftRow> = [
  {
    title: "Northstar — second reminder with PO",
    subtitle: "INV-1042 / PO-7781",
    status: "pending approval",
    channel: "both",
    whyChannel:
      "Northstar replies to written PO references and a quick call usually closes the loop the same day.",
    body:
      "Hi Jess, following up on invoice £4,800 (18 days overdue). We've treated the original PO as confirmation of work completed. Appreciate your help getting this over the line.",
    voiceScript:
      "Hi Jess, it's Emma at Marlow & Finch. Just calling about INV-1042 — can you confirm the PO is back on track for Friday?",
    evidence: "Based on what's worked with Northstar before."
  },
  {
    title: "Blue Finch — firmer finance-team reminder",
    subtitle: "INV-1048",
    status: "pending approval",
    channel: "email",
    whyChannel:
      "Blue Finch ignores friendly nudges; a formal finance-team email with the invoice attached has cleared bills before.",
    body:
      "Dear Accounts Payable, invoice £2,200 (7 days overdue). Please confirm payment timeline or let us know if anything's changed. Thanks.",
    voiceScript:
      "Hi, calling about INV-1048 from Marlow & Finch. We're chasing payment timeline — please call us back at your earliest.",
    evidence: "Written in a firmer finance-team tone."
  },
  {
    title: "MotionPrint — request 5-day delay",
    subtitle: "MotionPrint / £2,400",
    status: "pending approval",
    channel: "phone",
    whyChannel:
      "Personal call to Alex preserves the relationship while invoking the written 5-day grace period.",
    body:
      "Hi Alex, would you be open to a 5-day deferral on this week's payment of £2,400? We can use the grace period in our terms. Thanks for the flexibility.",
    voiceScript:
      "Hi Alex, Emma here. Quick one — we'd like to use the 5-day grace on this week's £2,400 invoice. Can we line that up?",
    evidence: "Uses the grace period already in your terms."
  }
];

export const workerRows: Record<
  DemoPhase,
  Array<{
    name: string;
    status: WorkerStatus;
    runId: string;
    detail: string;
    writes: string;
  }>
> = {
  baseline: [
    {
      name: "Event Router",
      status: "complete",
      runId: "run_router_001",
      detail: "Opened payroll-risk case from scheduled scan",
      writes: "events, tasks"
    },
    {
      name: "Forecast Agent",
      status: "complete",
      runId: "run_forecast_001",
      detail: "Computed deterministic forecast v1",
      writes: "cashflow_forecasts"
    },
    {
      name: "Customer Memory Agent",
      status: "complete",
      runId: "run_memory_001",
      detail: "Ranked Northstar and Blue Finch evidence",
      writes: "retrieval_attempts"
    },
    {
      name: "Collections Agent",
      status: "complete",
      runId: "run_collections_001",
      detail: "Prepared two customer drafts",
      writes: "collection_drafts"
    },
    {
      name: "Payment Run Agent",
      status: "complete",
      runId: "run_payments_001",
      detail: "Recommended full MotionPrint delay",
      writes: "payment_run_plans"
    },
    {
      name: "Audit / Learning Agent",
      status: "queued",
      runId: "run_audit_queued",
      detail: "Waiting for live replanning evidence",
      writes: "decision_log"
    }
  ],
  reply: [
    {
      name: "Event Router",
      status: "complete",
      runId: "run_router_002",
      detail: "Routed Northstar reply into case tasks",
      writes: "events, tasks"
    },
    {
      name: "Forecast Agent",
      status: "complete",
      runId: "run_forecast_002",
      detail: "Generated forecast v2; risk stayed high",
      writes: "cashflow_forecasts"
    },
    {
      name: "Customer Memory Agent",
      status: "complete",
      runId: "run_memory_002",
      detail: "Classified conditional promise at 0.48 confidence",
      writes: "retrieval_attempts"
    },
    {
      name: "Collections Agent",
      status: "complete",
      runId: "run_collections_002",
      detail: "Revised Northstar confirmation draft",
      writes: "collection_drafts"
    },
    {
      name: "Payment Run Agent",
      status: "queued",
      runId: "run_payments_queued",
      detail: "Holding MotionPrint recommendation until bank event",
      writes: "payment_run_plans"
    },
    {
      name: "Audit / Learning Agent",
      status: "queued",
      runId: "run_audit_queued",
      detail: "Decision log prepared, briefing not generated yet",
      writes: "decision_log"
    }
  ],
  bank: [
    {
      name: "Event Router",
      status: "complete",
      runId: "run_router_003",
      detail: "Routed Harbour Labs bank transaction",
      writes: "events, tasks"
    },
    {
      name: "Forecast Agent",
      status: "complete",
      runId: "run_forecast_003",
      detail: "Generated forecast v3; high -> watch",
      writes: "cashflow_forecasts"
    },
    {
      name: "Customer Memory Agent",
      status: "complete",
      runId: "run_memory_002",
      detail: "Preserved Northstar conditional classification",
      writes: "retrieval_attempts"
    },
    {
      name: "Collections Agent",
      status: "complete",
      runId: "run_collections_003",
      detail: "Kept approval-ready drafts pending",
      writes: "collection_drafts"
    },
    {
      name: "Payment Run Agent",
      status: "complete",
      runId: "run_payments_003",
      detail: "Changed MotionPrint to conditional hold",
      writes: "payment_run_plans"
    },
    {
      name: "Audit / Learning Agent",
      status: "complete",
      runId: "run_audit_006",
      detail: "Wrote briefing, decision log, memory card",
      writes: "decision_log, founder_briefings, memory_cards"
    }
  ]
};

const atlasRowsByPhase: Record<
  DemoPhase,
  Array<{
    collection: string;
    documentId: string;
    change: string;
    why: string;
    timestamp: string;
  }>
> = {
  baseline: [
    {
      collection: "event_inbox",
      documentId: "evt_scan_payroll_001",
      change: "+1",
      why: "Wakeup source for scheduled payroll scan",
      timestamp: "09:00:02"
    },
    {
      collection: "events",
      documentId: "event_case_0508_004",
      change: "+4",
      why: "Append-only case timeline started",
      timestamp: "09:01:48"
    },
    {
      collection: "tasks",
      documentId: "task_approve_supplier_x_hold",
      change: "+3",
      why: "Human approval queue created",
      timestamp: "09:01:49"
    },
    {
      collection: "agent_runs",
      documentId: "run_payments_001",
      change: "+5",
      why: "Worker trace proves coordination",
      timestamp: "09:01:51"
    },
    {
      collection: "retrieval_attempts",
      documentId: "ret_baseline_priority_001",
      change: "+1",
      why: "Invoice and memory evidence ranked",
      timestamp: "09:01:26"
    },
    {
      collection: "memory_chunks",
      documentId: "chunk_northstar_po_memory",
      change: "seeded",
      why: "Adaptive retrieval substrate",
      timestamp: "09:00:00"
    },
    {
      collection: "cashflow_forecasts",
      documentId: "forecast_case_0508_v1",
      change: "v1",
      why: "Baseline shortfall is £5,200",
      timestamp: "09:01:14"
    },
    {
      collection: "payment_run_plans",
      documentId: "plan_case_0508_v1",
      change: "v1",
      why: "MotionPrint full delay recommendation",
      timestamp: "09:01:48"
    },
    {
      collection: "collection_drafts",
      documentId: "draft_northstar_confirm_001",
      change: "+3",
      why: "Approval-ready actions prepared",
      timestamp: "09:01:32"
    },
    {
      collection: "decision_log",
      documentId: "decision_case_0508_001",
      change: "+1",
      why: "Why MotionPrint hold is recommended",
      timestamp: "09:01:56"
    },
    {
      collection: "founder_briefings",
      documentId: "briefing_case_0508_v3",
      change: "queued",
      why: "Generated after forecast v3",
      timestamp: "--"
    },
    {
      collection: "memory_cards",
      documentId: "mem_northstar_payment_behaviour_seed",
      change: "seeded",
      why: "Prior Northstar behaviour available",
      timestamp: "09:00:00"
    },
    {
      collection: "artifacts",
      documentId: "artifact_founder_audio_v3",
      change: "queued",
      why: "Audio metadata waits for briefing",
      timestamp: "--"
    }
  ],
  reply: [
    {
      collection: "event_inbox",
      documentId: "evt_customer_a_reply_001",
      change: "+2 total",
      why: "Northstar reply inserted idempotently",
      timestamp: "10:15:00"
    },
    {
      collection: "events",
      documentId: "event_case_0508_009",
      change: "+5",
      why: "Email, trigger, classification, forecast events",
      timestamp: "10:15:17"
    },
    {
      collection: "tasks",
      documentId: "task_classify_northstar_reply",
      change: "+2",
      why: "Classification and confirmation tasks",
      timestamp: "10:15:03"
    },
    {
      collection: "agent_runs",
      documentId: "run_memory_002",
      change: "+4",
      why: "Router, memory, forecast, collections workers ran",
      timestamp: "10:15:18"
    },
    {
      collection: "retrieval_attempts",
      documentId: "ret_customer_a_reply_001",
      change: "+1",
      why: "Hybrid search used invoice, thread, history, memory",
      timestamp: "10:15:10"
    },
    {
      collection: "memory_chunks",
      documentId: "chunk_northstar_po_memory",
      change: "read",
      why: "PO-dependent promise evidence used",
      timestamp: "10:15:09"
    },
    {
      collection: "cashflow_forecasts",
      documentId: "forecast_case_0508_v2",
      change: "v1 -> v2",
      why: "Risk stays high after conditional reply",
      timestamp: "10:15:17"
    },
    {
      collection: "payment_run_plans",
      documentId: "plan_case_0508_v2",
      change: "v1 -> v2",
      why: "MotionPrint full delay remains",
      timestamp: "10:15:19"
    },
    {
      collection: "collection_drafts",
      documentId: "draft_northstar_confirm_002",
      change: "+1",
      why: "Ask for explicit PO/payment confirmation",
      timestamp: "10:15:21"
    },
    {
      collection: "decision_log",
      documentId: "decision_case_0508_002",
      change: "+1",
      why: "Not guaranteed cash at confidence 0.48",
      timestamp: "10:15:23"
    },
    {
      collection: "founder_briefings",
      documentId: "briefing_case_0508_v3",
      change: "queued",
      why: "Generated after bank replanning",
      timestamp: "--"
    },
    {
      collection: "memory_cards",
      documentId: "mem_northstar_payment_behaviour_seed",
      change: "pending write",
      why: "New memory waits for final case outcome",
      timestamp: "--"
    },
    {
      collection: "artifacts",
      documentId: "artifact_founder_audio_v3",
      change: "queued",
      why: "Audio metadata waits for briefing",
      timestamp: "--"
    }
  ],
  bank: [
    {
      collection: "event_inbox",
      documentId: "evt_bank_harbour_001",
      change: "+3 total",
      why: "Timed bank event woke the workflow",
      timestamp: "10:22:04"
    },
    {
      collection: "events",
      documentId: "event_case_0508_014",
      change: "+5",
      why: "Bank, forecast, plan, briefing, memory events",
      timestamp: "10:22:20"
    },
    {
      collection: "tasks",
      documentId: "task_approve_supplier_x_hold",
      change: "updated",
      why: "Supplier approval changed to conditional hold",
      timestamp: "10:22:15"
    },
    {
      collection: "agent_runs",
      documentId: "run_audit_006",
      change: "+6",
      why: "All six workers coordinated through durable state",
      timestamp: "10:22:21"
    },
    {
      collection: "retrieval_attempts",
      documentId: "ret_customer_a_reply_001",
      change: "reused",
      why: "Northstar uncertainty retained in scenario split",
      timestamp: "10:22:12"
    },
    {
      collection: "memory_chunks",
      documentId: "chunk_northstar_po_memory",
      change: "read",
      why: "Memory influenced the final briefing",
      timestamp: "10:22:18"
    },
    {
      collection: "cashflow_forecasts",
      documentId: "forecast_case_0508_v3",
      change: "v2 -> v3",
      why: "Risk high -> watch after +£1,200",
      timestamp: "10:22:12"
    },
    {
      collection: "payment_run_plans",
      documentId: "plan_case_0508_v3",
      change: "v2 -> v3",
      why: "MotionPrint full delay -> conditional hold",
      timestamp: "10:22:14"
    },
    {
      collection: "collection_drafts",
      documentId: "draft_northstar_confirm_002",
      change: "unchanged",
      why: "Drafts remain pending human approval",
      timestamp: "10:22:16"
    },
    {
      collection: "decision_log",
      documentId: "decision_case_0508_003",
      change: "+1",
      why: "Explains why watch is not safe",
      timestamp: "10:22:16"
    },
    {
      collection: "founder_briefings",
      documentId: "briefing_case_0508_v3",
      change: "+1",
      why: "Founder action briefing generated",
      timestamp: "10:22:18"
    },
    {
      collection: "memory_cards",
      documentId: "mem_northstar_po_conditional_promises",
      change: "+1",
      why: "Future cases inherit Northstar rule",
      timestamp: "10:22:20"
    },
    {
      collection: "artifacts",
      documentId: "artifact_founder_audio_v3",
      change: "+1",
      why: "S3/cached audio metadata stored",
      timestamp: "10:22:22"
    }
  ]
};

export function getAtlasRows(phase: DemoPhase) {
  return atlasRowsByPhase[phase];
}

export const auditQuestions = [
  {
    question: "What changed?",
    answer:
      "Harbour Labs posted a £1,200 retainer, lifting cash from £8,400 to £9,600 before payroll."
  },
  {
    question: "Why did risk move HIGH -> WATCH?",
    answer:
      "The worst visible shortfall moved from £2,800 to £1,600 when MotionPrint is held, and the Northstar-pay scenario now leaves £800 after MotionPrint."
  },
  {
    question: "Why is it not SAFE?",
    answer:
      "Northstar still depends on PO re-approval. The system preserves the slip scenario instead of counting conditional language as guaranteed cash."
  },
  {
    question: "Why did MotionPrint change?",
    answer:
      "The extra £1,200 makes a conditional hold viable, but release still waits for Friday morning cash confirmation."
  },
  {
    question: "Which evidence was used?",
    answer:
      "INV-1042, the Northstar email thread, payment history, prior PO-dependent memory, MotionPrint grace terms, and the Harbour Labs bank transaction."
  },
  {
    question: "What needs approval?",
    answer:
      "The Northstar confirmation email, Blue Finch formal reminder, and MotionPrint conditional hold remain pending human approval."
  }
] as const;

export const retrievalEvidence = [
  "INV-1042 exact invoice match",
  "Northstar PO email thread",
  "Payment history: late but responsive",
  "Memory card: PO-dependent promises",
  "MotionPrint 5-day grace terms"
] as const;

export const founderBriefing = {
  title: "Founder briefing",
  source: "Generated from forecast v3 and payment plan v3",
  audioKey: "s3://runwayops-demo-artifacts/briefings/case_payroll_2026_05_08_v3.mp3",
  duration: "00:37",
  transcript:
    "Payroll risk is now watch, not cleared. Harbour Labs paid £1,200. Northstar says they should be able to pay Friday, but payment depends on PO re-approval. Approve the Northstar confirmation email, hold MotionPrint until Friday morning, and keep chasing Blue Finch. If Northstar slips, payroll remains short by £1,600."
} as const;

export const memoryCard = {
  id: "mem_northstar_po_conditional_promises",
  title: "Northstar PO-dependent promises",
  body:
    "Northstar promises are conditional unless PO confirmation is explicit. Use direct finance-team wording with PO reference. Do not treat \"should be able to pay\" as guaranteed cash.",
  preview: [
    "Treat \"should be able to pay\" as conditional",
    "Require explicit PO/payment confirmation",
    "Use direct finance-team wording with PO reference"
  ]
} as const;

