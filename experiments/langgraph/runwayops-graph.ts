import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";

type RiskLevel = "HIGH" | "WATCH" | "SAFE";
type EventType = "customer.email_reply" | "bank.transaction.posted";
type AgentStatus = "completed" | "skipped";

type EventDocument = {
  _id: string;
  event_key: string;
  company_id: string;
  case_id: string;
  event_type: EventType;
  source: string;
  received_at: string;
  payload: Record<string, unknown>;
};

type WritePlanItem = {
  collection:
    | "events"
    | "tasks"
    | "retrieval_attempts"
    | "agent_runs"
    | "cashflow_forecasts"
    | "payment_run_plans"
    | "decision_log"
    | "founder_briefings"
    | "memory_cards";
  operation: "insertOne" | "updateOne";
  document: Record<string, unknown>;
  why: string;
};

type RouteIntent =
  | "handle_customer_reply"
  | "handle_bank_transaction"
  | "skip_customer_memory"
  | "skip_collections";

type CaseSnapshot = {
  riskLevel: RiskLevel;
  currentCashGbp: number;
  payrollDueGbp: number;
  supplierBillGbp: number;
  northstarInvoiceGbp: number;
  forecastVersion: number;
  paymentPlanVersion: number;
};

type AgentRunInput = {
  event: EventDocument;
  agentId: string;
  agentName: string;
  status?: AgentStatus;
  summary: string;
  output?: Record<string, unknown>;
};

const BASELINE_CASE: CaseSnapshot = {
  riskLevel: "HIGH",
  currentCashGbp: 8400,
  payrollDueGbp: 11200,
  supplierBillGbp: 2400,
  northstarInvoiceGbp: 4800,
  forecastVersion: 1,
  paymentPlanVersion: 1,
};

const NorthstarReplyEvent: EventDocument = {
  _id: "inbox_northstar_reply_0504",
  event_key: "email:reply:northstar:inv_1042:conditional_po",
  company_id: "cmp_marlow_finch",
  case_id: "case_payroll_2026_05_08",
  event_type: "customer.email_reply",
  source: "demo_button",
  received_at: "2026-05-04T10:05:00.000+01:00",
  payload: {
    customer_id: "cust_northstar",
    invoice_id: "inv_1042",
    message: "Should be able to pay Friday once the PO is re-approved.",
  },
};

const HarbourLabsBankEvent: EventDocument = {
  _id: "inbox_harbour_retainer_0504",
  event_key: "bank:transaction:harbour_labs_retainer:1200",
  company_id: "cmp_marlow_finch",
  case_id: "case_payroll_2026_05_08",
  event_type: "bank.transaction.posted",
  source: "eventbridge_or_local_timer",
  received_at: "2026-05-04T10:05:45.000+01:00",
  payload: {
    transaction_id: "txn_harbour_labs_0504",
    counterparty: "Harbour Labs",
    amount_gbp: 1200,
  },
};

const RunwayOpsState = Annotation.Root({
  event: Annotation<EventDocument>(),
  caseSnapshot: Annotation<CaseSnapshot>({
    reducer: (_left, right) => right,
    default: () => BASELINE_CASE,
  }),
  routeIntents: Annotation<RouteIntent[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  classification: Annotation<string | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  classificationConfidence: Annotation<number | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
  forecastVersion: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 1,
  }),
  paymentPlanVersion: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 1,
  }),
  riskLevel: Annotation<RiskLevel>({
    reducer: (_left, right) => right,
    default: () => "HIGH",
  }),
  writePlan: Annotation<WritePlanItem[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

type RunwayOpsStateType = typeof RunwayOpsState.State;

function agentRun({ event, agentId, agentName, status = "completed", summary, output = {} }: AgentRunInput): WritePlanItem {
  return {
    collection: "agent_runs",
    operation: "insertOne",
    document: {
      _id: `run_${agentId}_${event._id}`,
      agent_id: agentId,
      agent_name: agentName,
      company_id: event.company_id,
      case_id: event.case_id,
      event_id: event._id,
      status,
      started_at: event.received_at,
      completed_at: event.received_at,
      summary,
      output,
      langsmith_trace_url: null,
    },
    why: `${agentName} execution trace for MongoDB Atlas Live State and LangSmith correlation.`,
  };
}

function task(event: EventDocument, taskType: string, assignedAgent: string, status = "queued"): WritePlanItem {
  return {
    collection: "tasks",
    operation: "insertOne",
    document: {
      _id: `task_${assignedAgent}_${event._id}`,
      company_id: event.company_id,
      case_id: event.case_id,
      event_id: event._id,
      task_type: taskType,
      assigned_agent: assignedAgent,
      status,
      created_at: event.received_at,
    },
    why: "Durable work item that production workers can claim, retry, and audit.",
  };
}

async function eventRouter(state: RunwayOpsStateType) {
  const { event } = state;
  const routeIntents: RouteIntent[] =
    event.event_type === "customer.email_reply"
      ? ["handle_customer_reply"]
      : ["skip_customer_memory", "skip_collections", "handle_bank_transaction"];

  const downstreamTasks =
    event.event_type === "customer.email_reply"
      ? [
          task(event, "retrieve_customer_memory", "customer_memory_agent"),
          task(event, "recompute_forecast", "forecast_agent"),
          task(event, "draft_collections_action", "collections_agent"),
          task(event, "revise_payment_plan", "payment_run_agent"),
          task(event, "write_audit_and_memory", "audit_learning_agent"),
        ]
      : [
          task(event, "recompute_forecast", "forecast_agent"),
          task(event, "revise_payment_plan", "payment_run_agent"),
          task(event, "write_audit_and_memory", "audit_learning_agent"),
        ];

  return {
    routeIntents,
    writePlan: [
      {
        collection: "events",
        operation: "insertOne",
        document: {
          _id: `evt_${event._id}`,
          event_key: event.event_key,
          company_id: event.company_id,
          case_id: event.case_id,
          event_type: event.event_type,
          occurred_at: event.received_at,
          source: event.source,
          payload: event.payload,
        },
        why: "Canonical immutable event copied from event_inbox.",
      },
      ...downstreamTasks,
      agentRun({
        event,
        agentId: "event_router",
        agentName: "Event Router",
        summary: `Classified ${event.event_type} and routed downstream workers.`,
        output: { routeIntents, downstreamTaskCount: downstreamTasks.length },
      }),
    ],
  };
}

async function customerMemoryAgent(state: RunwayOpsStateType) {
  const { event, routeIntents } = state;

  if (!routeIntents.includes("handle_customer_reply")) {
    return {
      writePlan: [
        agentRun({
          event,
          agentId: "customer_memory_agent",
          agentName: "Customer Memory Agent",
          status: "skipped",
          summary: "No customer reply evidence retrieval needed for this event.",
        }),
      ],
    };
  }

  const classification = "conditional_promise";
  const confidence = 0.48;

  return {
    classification,
    classificationConfidence: confidence,
    writePlan: [
      {
        collection: "retrieval_attempts",
        operation: "insertOne",
        document: {
          _id: `retrieval_${event._id}`,
          company_id: event.company_id,
          case_id: event.case_id,
          event_id: event._id,
          original_query: "Northstar should be able to pay Friday once PO is re-approved",
          rewritten_query: "Northstar INV-1042 PO re-approved Friday payment history conditional promise",
          strategy: "hybrid_keyword_vector_ready",
          top_evidence_ids: ["chunk_northstar_po_memory", "thread_northstar_inv_1042", "payhist_northstar"],
          classification,
          confidence,
          sufficient: true,
        },
        why: "Proof of adaptive retrieval and evidence sufficiency judgement.",
      },
      agentRun({
        event,
        agentId: "customer_memory_agent",
        agentName: "Customer Memory Agent",
        summary: "Retrieved Northstar evidence and interpreted reply as conditional, not guaranteed cash.",
        output: { classification, confidence, guaranteedCash: false },
      }),
    ],
  };
}

async function forecastAgent(state: RunwayOpsStateType) {
  const { event, caseSnapshot, classification } = state;
  const isBankEvent = event.event_type === "bank.transaction.posted";
  const cashAfterBankEvent =
    caseSnapshot.currentCashGbp + (isBankEvent ? Number(event.payload.amount_gbp || 0) : 0);
  const forecastVersion = isBankEvent ? 3 : 2;
  const riskLevel: RiskLevel = isBankEvent ? "WATCH" : "HIGH";

  const scenarios = isBankEvent
    ? [
        {
          name: "northstar_slips_supplier_held",
          calculation: `${cashAfterBankEvent} - ${caseSnapshot.payrollDueGbp}`,
          friday_position_gbp: cashAfterBankEvent - caseSnapshot.payrollDueGbp,
        },
        {
          name: "northstar_pays_supplier_after_payroll",
          calculation: `${cashAfterBankEvent} + ${caseSnapshot.northstarInvoiceGbp} - ${caseSnapshot.payrollDueGbp} - ${caseSnapshot.supplierBillGbp}`,
          friday_position_gbp:
            cashAfterBankEvent +
            caseSnapshot.northstarInvoiceGbp -
            caseSnapshot.payrollDueGbp -
            caseSnapshot.supplierBillGbp,
        },
      ]
    : [
        {
          name: "northstar_pays_supplier_held",
          calculation: `${cashAfterBankEvent} + ${caseSnapshot.northstarInvoiceGbp} - ${caseSnapshot.payrollDueGbp}`,
          friday_position_gbp: cashAfterBankEvent + caseSnapshot.northstarInvoiceGbp - caseSnapshot.payrollDueGbp,
          risk_note: `${classification} is not guaranteed cash, so overall risk remains HIGH.`,
        },
        {
          name: "northstar_slips_supplier_held",
          calculation: `${cashAfterBankEvent} - ${caseSnapshot.payrollDueGbp}`,
          friday_position_gbp: cashAfterBankEvent - caseSnapshot.payrollDueGbp,
        },
      ];

  return {
    forecastVersion,
    riskLevel,
    caseSnapshot: {
      ...caseSnapshot,
      riskLevel,
      currentCashGbp: cashAfterBankEvent,
      forecastVersion,
    },
    writePlan: [
      {
        collection: "cashflow_forecasts",
        operation: "insertOne",
        document: {
          _id: `forecast_case_0508_v${forecastVersion}`,
          company_id: event.company_id,
          case_id: event.case_id,
          event_id: event._id,
          version: forecastVersion,
          risk_level: riskLevel,
          current_cash_gbp: cashAfterBankEvent,
          scenarios,
        },
        why: "Deterministic cash truth; no LLM arithmetic.",
      },
      agentRun({
        event,
        agentId: "forecast_agent",
        agentName: "Forecast Agent",
        summary: `Computed forecast v${forecastVersion}; risk is ${riskLevel}.`,
        output: { forecastVersion, riskLevel, scenarios },
      }),
    ],
  };
}

async function collectionsAgent(state: RunwayOpsStateType) {
  const { event, routeIntents } = state;

  if (routeIntents.includes("skip_collections")) {
    return {
      writePlan: [
        agentRun({
          event,
          agentId: "collections_agent",
          agentName: "Collections Agent",
          status: "skipped",
          summary: "No customer-facing draft required for this bank transaction.",
        }),
      ],
    };
  }

  return {
    writePlan: [
      task(event, "approve_northstar_confirmation_email", "human_founder", "approval_required"),
      agentRun({
        event,
        agentId: "collections_agent",
        agentName: "Collections Agent",
        summary: "Drafted approval-ready Northstar confirmation action.",
        output: {
          draft_id: "draft_northstar_confirmation_v2",
          subject: "Please confirm PO approval and Friday payment for INV-1042",
          requiresHumanApproval: true,
        },
      }),
    ],
  };
}

async function paymentRunAgent(state: RunwayOpsStateType) {
  const { event, forecastVersion, riskLevel } = state;
  const paymentPlanVersion = event.event_type === "bank.transaction.posted" ? 3 : 2;
  const recommendation =
    event.event_type === "bank.transaction.posted"
      ? "conditional_hold_until_customer_a_payment_clears"
      : "continue_full_delay_until_explicit_payment_confirmation";

  return {
    paymentPlanVersion,
    caseSnapshot: {
      ...state.caseSnapshot,
      paymentPlanVersion,
    },
    writePlan: [
      {
        collection: "payment_run_plans",
        operation: "insertOne",
        document: {
          _id: `payment_plan_case_0508_v${paymentPlanVersion}`,
          company_id: event.company_id,
          case_id: event.case_id,
          event_id: event._id,
          version: paymentPlanVersion,
          forecast_version: forecastVersion,
          risk_level: riskLevel,
          recommendation,
          supplier_bill_id: "bill_motionprint_0507",
          human_approval_required: true,
        },
        why: "Supplier timing recommendation remains human-approved and payroll-risk aware.",
      },
      {
        collection: "decision_log",
        operation: "insertOne",
        document: {
          _id: `decision_payment_run_${event._id}`,
          company_id: event.company_id,
          case_id: event.case_id,
          event_id: event._id,
          decision_type: "payment_run_recommendation",
          summary: `MotionPrint recommendation is ${recommendation}.`,
          risk_after: riskLevel,
        },
        why: "Auditable explanation of the supplier payment timing change.",
      },
      agentRun({
        event,
        agentId: "payment_run_agent",
        agentName: "Payment Run Agent",
        summary: `Created payment plan v${paymentPlanVersion}: ${recommendation}.`,
        output: { paymentPlanVersion, recommendation, humanApprovalRequired: true },
      }),
    ],
  };
}

async function auditLearningAgent(state: RunwayOpsStateType) {
  const { event, forecastVersion, paymentPlanVersion, riskLevel, classification } = state;
  const isBankEvent = event.event_type === "bank.transaction.posted";

  return {
    writePlan: [
      {
        collection: "decision_log",
        operation: "insertOne",
        document: {
          _id: `decision_audit_${event._id}`,
          company_id: event.company_id,
          case_id: event.case_id,
          event_id: event._id,
          decision_type: isBankEvent ? "forecast_replan" : "customer_reply_classification",
          summary: isBankEvent
            ? "Harbour Labs retainer moved overall risk from HIGH to WATCH, not SAFE."
            : "Northstar reply is a conditional promise; payroll remains HIGH risk until PO/payment release is explicit.",
          risk_after: riskLevel,
          forecast_version: forecastVersion,
          payment_plan_version: paymentPlanVersion,
        },
        why: "Founder-facing and judge-facing reason trail.",
      },
      {
        collection: "founder_briefings",
        operation: "insertOne",
        document: {
          _id: `briefing_${event._id}`,
          company_id: event.company_id,
          case_id: event.case_id,
          event_id: event._id,
          status: isBankEvent ? "generated" : "queued",
          transcript: isBankEvent
            ? "Cash is now GBP 9,600 after the Harbour Labs retainer. If Northstar pays Friday and MotionPrint is held until after payroll, GBP 800 remains. If Northstar slips, Friday remains short by GBP 1,600."
            : "Northstar's reply is conditional. Ask for explicit PO approval and payment release confirmation before treating the receipt as likely.",
        },
        why: "Briefing artifact metadata; audio generation happens later through ElevenLabs.",
      },
      {
        collection: "memory_cards",
        operation: isBankEvent ? "insertOne" : "updateOne",
        document: {
          _id: "mem_northstar_po_conditional_after_case",
          company_id: event.company_id,
          case_id: event.case_id,
          customer_id: "cust_northstar",
          classification: classification || "not_applicable",
          summary: "Northstar promises are conditional unless PO confirmation is explicit.",
          next_case_preview:
            "Future payroll-risk cases should ask Northstar for explicit PO approval and payment release confirmation before treating receipts as likely.",
        },
        why: "Learning loop that changes future retrieval and drafting behaviour.",
      },
      agentRun({
        event,
        agentId: "audit_learning_agent",
        agentName: "Audit / Learning Agent",
        summary: "Wrote decision explanation, founder briefing, and memory-card write plan.",
        output: { forecastVersion, paymentPlanVersion, riskLevel },
      }),
    ],
  };
}

function buildGraph() {
  return new StateGraph(RunwayOpsState)
    .addNode("eventRouter", eventRouter)
    .addNode("customerMemoryAgent", customerMemoryAgent)
    .addNode("forecastAgent", forecastAgent)
    .addNode("collectionsAgent", collectionsAgent)
    .addNode("paymentRunAgent", paymentRunAgent)
    .addNode("auditLearningAgent", auditLearningAgent)
    .addEdge(START, "eventRouter")
    .addEdge("eventRouter", "customerMemoryAgent")
    .addEdge("customerMemoryAgent", "forecastAgent")
    .addEdge("forecastAgent", "collectionsAgent")
    .addEdge("collectionsAgent", "paymentRunAgent")
    .addEdge("paymentRunAgent", "auditLearningAgent")
    .addEdge("auditLearningAgent", END)
    .compile({
      checkpointer: new MemorySaver(),
    });
}

function summarizeWritePlan(writePlan: WritePlanItem[]) {
  return writePlan.reduce<Record<string, number>>((summary, item) => {
    summary[item.collection] = (summary[item.collection] || 0) + 1;
    return summary;
  }, {});
}

async function runScenario(name: string, event: EventDocument) {
  const graph = buildGraph();
  const result = await graph.invoke(
    {
      event,
      caseSnapshot: BASELINE_CASE,
      riskLevel: BASELINE_CASE.riskLevel,
      forecastVersion: BASELINE_CASE.forecastVersion,
      paymentPlanVersion: BASELINE_CASE.paymentPlanVersion,
      writePlan: [],
    },
    {
      configurable: {
        thread_id: event.case_id,
      },
    },
  );

  console.log(`\n=== ${name} ===`);
  console.log(`thread_id=${event.case_id}`);
  console.log(`classification=${result.classification || "n/a"}`);
  console.log(`risk=${result.riskLevel}`);
  console.log(`forecastVersion=${result.forecastVersion}`);
  console.log(`paymentPlanVersion=${result.paymentPlanVersion}`);
  console.log("writePlanSummary=", JSON.stringify(summarizeWritePlan(result.writePlan), null, 2));
  console.log("writePlan=", JSON.stringify(result.writePlan, null, 2));
}

await runScenario("Run 1: Northstar ambiguous reply", NorthstarReplyEvent);
await runScenario("Run 2: Harbour Labs bank event", HarbourLabsBankEvent);
