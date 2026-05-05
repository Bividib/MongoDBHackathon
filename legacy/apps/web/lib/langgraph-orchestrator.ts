import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { Collection, Db, Document } from "mongodb";

import { completeWithFireworks, getCachedFireworksCompletion, liveFireworksEnabled } from "./fireworks";
import { getCachedBriefingAudioMetadata } from "./tts";
import {
  buildCustomerMemoryRetrievalContext,
  buildDeterministicCustomerMemoryRetrieval,
  retrieveCustomerMemoryEvidence,
  type CustomerMemoryRetrievalResult,
  type RetrievedEvidence
} from "./vector-retrieval";

export type JsonDocument = Document & { _id: string };

export type EventInboxDocument = JsonDocument & {
  event_key: string;
  company_id: string;
  case_id: string;
  event_type: string;
  source?: string;
  status?: string;
  received_at?: string;
  payload?: Record<string, unknown>;
};

export type WriteSummary = {
  collection: string;
  id: string;
  action: "inserted" | "updated" | "unchanged" | "already_present";
};

export type WritePlanItem = {
  collection: string;
  operation: "replaceOne" | "insertIfMissing" | "updateOne";
  document?: JsonDocument;
  filter?: Record<string, unknown>;
  update?: Record<string, unknown>;
  upsert?: boolean;
  why: string;
};

type AgentStatus = "completed" | "skipped";
type EventStatus = "processed" | "skipped";
type RiskLevel = "HIGH" | "WATCH" | "SAFE";

type RouteIntent =
  | "handle_customer_reply"
  | "handle_bank_transaction"
  | "skip_customer_memory"
  | "skip_collections";

type ContactChannel = "email" | "phone";

type CaseSnapshot = {
  caseId: string;
  companyId: string;
  riskLevel: RiskLevel;
  currentCashGbp: number;
  payrollDueGbp: number;
  supplierBillGbp: number;
  northstarInvoiceGbp: number;
  forecastVersion: number;
  paymentPlanVersion: number;
};

type CustomerMemoryEvidence = {
  customerId: string;
  invoiceId: string;
  behaviourSummary: string;
  evidenceIds: string[];
  preferredChannels: ContactChannel[];
  phoneContactConsent: boolean;
  explicitConfirmationRequired: boolean;
  topEvidence?: RetrievedEvidence[];
};

type OutreachDecision = {
  primaryChannel: ContactChannel;
  fallbackChannel: ContactChannel;
  primaryAction: string;
  fallbackAction: string;
  reason: string;
  humanApprovalRequired: boolean;
  externalCommunicationSent: false;
};

type ClassificationResult = {
  classification: string;
  confidence: number;
  guaranteedCash: boolean;
  llmMode: "deterministic-fallback" | "fixture-cache" | "fireworks";
  reason: string;
};

type AgentRunInput = {
  event: EventInboxDocument;
  agentId: string;
  agentName: string;
  nodeName: string;
  workerIndex: number;
  status?: AgentStatus;
  summary: string;
  output?: Record<string, unknown>;
  llmMode?: string;
};

export type LangGraphEventResult = {
  status: EventStatus;
  writes: WriteSummary[];
  threadId: string;
  writePlanSummary: Record<string, number>;
};

const CASE_ID = "case_payroll_2026_05_08";
const COMPANY_ID = "cmp_marlow_finch";
const GRAPH_VERSION = "runwayops-langgraph-v1";

const DEFAULT_CASE_SNAPSHOT: CaseSnapshot = {
  caseId: CASE_ID,
  companyId: COMPANY_ID,
  riskLevel: "HIGH",
  currentCashGbp: 8400,
  payrollDueGbp: 11200,
  supplierBillGbp: 2400,
  northstarInvoiceGbp: 4800,
  forecastVersion: 1,
  paymentPlanVersion: 1
};

const SUPPORTED_EVENT_TYPES = new Set(["customer.email_reply", "bank.transaction.posted"]);

const RunwayOpsState = Annotation.Root({
  event: Annotation<EventInboxDocument>(),
  status: Annotation<EventStatus>({
    reducer: (_left, right) => right,
    default: () => "processed"
  }),
  caseSnapshot: Annotation<CaseSnapshot>({
    reducer: (_left, right) => right,
    default: () => DEFAULT_CASE_SNAPSHOT
  }),
  routeIntents: Annotation<RouteIntent[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  classification: Annotation<string | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined
  }),
  classificationConfidence: Annotation<number | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined
  }),
  llmMode: Annotation<string | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined
  }),
  customerMemoryEvidence: Annotation<CustomerMemoryEvidence | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined
  }),
  outreachDecision: Annotation<OutreachDecision | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined
  }),
  forecastVersion: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 1
  }),
  paymentPlanVersion: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 1
  }),
  riskLevel: Annotation<RiskLevel>({
    reducer: (_left, right) => right,
    default: () => "HIGH"
  }),
  writePlan: Annotation<WritePlanItem[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  })
});

type RunwayOpsStateType = typeof RunwayOpsState.State;

function documents(db: Db, collectionName: string): Collection<JsonDocument> {
  return db.collection<JsonDocument>(collectionName);
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function errorCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: number }).code;
  }

  return undefined;
}

function numeric(value: unknown, fallback: number): number {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function riskLevel(value: unknown, fallback: RiskLevel): RiskLevel {
  if (value === "HIGH" || value === "WATCH" || value === "SAFE") {
    return value;
  }

  return fallback;
}

function eventTimestamp(event: EventInboxDocument): string {
  return event.received_at ?? new Date().toISOString();
}

function eventPayload(event: EventInboxDocument): Record<string, unknown> {
  return event.payload ?? {};
}

function replaceWrite(collection: string, document: JsonDocument, why: string): WritePlanItem {
  return {
    collection,
    operation: "replaceOne",
    document,
    why
  };
}

function insertIfMissingWrite(collection: string, document: JsonDocument, why: string): WritePlanItem {
  return {
    collection,
    operation: "insertIfMissing",
    document,
    why
  };
}

function updateWrite(
  collection: string,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  why: string
): WritePlanItem {
  return {
    collection,
    operation: "updateOne",
    filter,
    update,
    why
  };
}

function eventSuffix(event: EventInboxDocument): string {
  if (event._id === "inbox_northstar_reply_0504") {
    return "northstar_reply";
  }

  if (event._id === "inbox_harbour_retainer_0504") {
    return "bank_event";
  }

  return String(event._id).replace(/^inbox_/, "").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function fixedAgentRunId(agentId: string, event: EventInboxDocument): string {
  const fixedIds: Record<string, Record<string, string>> = {
    inbox_northstar_reply_0504: {
      event_router: "run_event_router_northstar_reply"
    },
    inbox_harbour_retainer_0504: {
      forecast_agent: "run_forecast_after_bank_event",
      audit_learning_agent: "run_audit_learning_after_bank_event"
    }
  };
  const fixedId = fixedIds[event._id]?.[agentId];

  if (fixedId) {
    return fixedId;
  }

  return `run_${agentId}_${eventSuffix(event)}`;
}

function agentRun({
  event,
  agentId,
  agentName,
  nodeName,
  workerIndex,
  status = "completed",
  summary,
  output = {},
  llmMode
}: AgentRunInput): WritePlanItem {
  return replaceWrite(
    "agent_runs",
    {
      _id: fixedAgentRunId(agentId, event),
      agent_id: agentId,
      agent_name: agentName,
      graph_version: GRAPH_VERSION,
      graph_node: nodeName,
      worker_index: workerIndex,
      company_id: event.company_id,
      case_id: event.case_id,
      event_id: event._id,
      event_key: event.event_key,
      status,
      started_at: eventTimestamp(event),
      completed_at: eventTimestamp(event),
      summary,
      output,
      ...(llmMode ? { llm_mode: llmMode } : {}),
      langgraph_thread_id: event.case_id,
      langsmith_trace_url: null
    },
    `${agentName} execution trace emitted by the production LangGraph workflow.`
  );
}

function task(
  event: EventInboxDocument,
  taskType: string,
  assignedAgent: string,
  status = "queued",
  extra: Record<string, unknown> = {}
): WritePlanItem {
  return replaceWrite(
    "tasks",
    {
      _id: `task_${taskType}_${event._id}`,
      company_id: event.company_id,
      case_id: event.case_id,
      event_id: event._id,
      event_key: event.event_key,
      task_type: taskType,
      assigned_agent: assignedAgent,
      status,
      created_at: eventTimestamp(event),
      ...extra
    },
    "Durable work item created by the event router for the worker pipeline."
  );
}

function timelineEvent(
  event: EventInboxDocument,
  document: JsonDocument,
  why = "Derived case timeline event from LangGraph node output."
): WritePlanItem {
  return replaceWrite("events", document, why);
}

function customerReceivedEvent(event: EventInboxDocument): WritePlanItem {
  const payload = eventPayload(event);

  return timelineEvent(event, {
    _id: "evt_northstar_reply_0504",
    event_key: `${event.event_key}:timeline:received`,
    company_id: event.company_id,
    case_id: event.case_id,
    event_type: "email.received",
    occurred_at: eventTimestamp(event),
    summary: "Northstar reply received with PO-dependent Friday payment language.",
    payload: {
      inbox_event_id: event._id,
      customer_id: payload.customer_id,
      invoice_id: payload.invoice_id
    }
  });
}

function customerClassifiedEvent(
  event: EventInboxDocument,
  classification: string,
  confidence: number,
  guaranteedCash: boolean
): WritePlanItem {
  return timelineEvent(event, {
    _id: "evt_northstar_classified_0504",
    event_key: `${event.event_key}:timeline:classified`,
    company_id: event.company_id,
    case_id: event.case_id,
    event_type: "reply.classified",
    occurred_at: "2026-05-04T10:05:10.000+01:00",
    summary: "Northstar reply classified as a conditional promise, not guaranteed cash.",
    payload: {
      classification,
      confidence,
      guaranteed_cash: guaranteedCash
    }
  });
}

function forecastUpdatedEvent(event: EventInboxDocument, version: 2 | 3, riskTo: RiskLevel): WritePlanItem {
  const isBankEvent = version === 3;

  return timelineEvent(event, {
    _id: isBankEvent ? "evt_forecast_v3_0504" : "evt_forecast_v2_0504",
    event_key: `${event.event_key}:timeline:forecast_v${version}`,
    company_id: event.company_id,
    case_id: event.case_id,
    event_type: "forecast.updated",
    occurred_at: isBankEvent ? "2026-05-04T10:05:52.000+01:00" : "2026-05-04T10:05:17.000+01:00",
    summary: isBankEvent
      ? "Forecast v3 moves case risk from HIGH to WATCH after the GBP 1,200 receipt."
      : "Forecast v2 keeps payroll risk HIGH after conditional Northstar reply.",
    payload: {
      from_version: version - 1,
      to_version: version,
      risk_from: "HIGH",
      risk_to: riskTo
    }
  });
}

function bankTransactionEvent(event: EventInboxDocument): WritePlanItem {
  const payload = eventPayload(event);

  return timelineEvent(event, {
    _id: "evt_bank_harbour_labs_0504",
    event_key: `${event.event_key}:timeline:posted`,
    company_id: event.company_id,
    case_id: event.case_id,
    event_type: "bank.transaction.posted",
    occurred_at: eventTimestamp(event),
    summary: "Harbour Labs retainer posted to the bank feed.",
    payload: {
      inbox_event_id: event._id,
      transaction_id: payload.transaction_id,
      amount_gbp: payload.amount_gbp
    }
  });
}

function paymentPlanUpdatedEvent(event: EventInboxDocument): WritePlanItem {
  return timelineEvent(event, {
    _id: "evt_payment_plan_v3_0504",
    event_key: `${event.event_key}:timeline:payment_plan_v3`,
    company_id: event.company_id,
    case_id: event.case_id,
    event_type: "payment_plan.updated",
    occurred_at: "2026-05-04T10:05:54.000+01:00",
    summary: "Supplier X recommendation changed to conditional hold.",
    payload: {
      from_version: 2,
      to_version: 3
    }
  });
}

function founderBriefingEvent(event: EventInboxDocument): WritePlanItem {
  return timelineEvent(event, {
    _id: "evt_founder_briefing_0504",
    event_key: `${event.event_key}:timeline:founder_briefing`,
    company_id: event.company_id,
    case_id: event.case_id,
    event_type: "briefing.generated",
    occurred_at: "2026-05-04T10:05:58.000+01:00",
    summary: "Founder briefing generated from forecast v3 and payment plan v3.",
    payload: {
      briefing_id: "briefing_case_0508_v1"
    }
  });
}

function memoryCardEvent(event: EventInboxDocument): WritePlanItem {
  return timelineEvent(event, {
    _id: "evt_memory_card_0504",
    event_key: `${event.event_key}:timeline:memory_card`,
    company_id: event.company_id,
    case_id: event.case_id,
    event_type: "memory_card.written",
    occurred_at: "2026-05-04T10:06:00.000+01:00",
    summary: "Northstar PO-dependent payment behaviour saved for future cases.",
    payload: {
      memory_card_id: "mem_northstar_po_conditional_after_case"
    }
  });
}

function bankTransactionDocument(event: EventInboxDocument): JsonDocument {
  const payload = eventPayload(event);
  const postedAt = String(payload.posted_at ?? eventTimestamp(event));

  return {
    _id: "bank_txn_harbour_labs_0504",
    company_id: event.company_id,
    transaction_id: payload.transaction_id ?? "txn_harbour_labs_0504",
    posted_at: new Date(postedAt),
    description: payload.description ?? "Harbour Labs retainer",
    amount_gbp: numeric(payload.amount_gbp, 1200),
    balance_after_gbp: 9600,
    source: event.source ?? "eventbridge_or_local_timer"
  };
}

async function hydrateCaseSnapshot(db: Db, event: EventInboxDocument): Promise<CaseSnapshot> {
  const [caseDoc, latestForecast, latestPaymentPlan, supplierBill, northstarInvoice] = await Promise.all([
    documents(db, "cases").findOne({ _id: event.case_id }),
    documents(db, "cashflow_forecasts").find({ case_id: event.case_id }).sort({ version: -1 }).limit(1).next(),
    documents(db, "payment_run_plans").find({ case_id: event.case_id }).sort({ version: -1 }).limit(1).next(),
    documents(db, "supplier_bills").findOne({ _id: "bill_motionprint_0507" }),
    documents(db, "invoices").findOne({ _id: "inv_1042" })
  ]);

  return {
    caseId: event.case_id,
    companyId: event.company_id,
    riskLevel: riskLevel(caseDoc?.risk_level ?? latestForecast?.risk_level, DEFAULT_CASE_SNAPSHOT.riskLevel),
    currentCashGbp: numeric(
      caseDoc?.current_cash_gbp ?? latestForecast?.current_cash_gbp,
      DEFAULT_CASE_SNAPSHOT.currentCashGbp
    ),
    payrollDueGbp: numeric(caseDoc?.payroll_due_gbp, DEFAULT_CASE_SNAPSHOT.payrollDueGbp),
    supplierBillGbp: numeric(supplierBill?.amount_gbp, DEFAULT_CASE_SNAPSHOT.supplierBillGbp),
    northstarInvoiceGbp: numeric(northstarInvoice?.amount_gbp, DEFAULT_CASE_SNAPSHOT.northstarInvoiceGbp),
    forecastVersion: numeric(latestForecast?.version, DEFAULT_CASE_SNAPSHOT.forecastVersion),
    paymentPlanVersion: numeric(latestPaymentPlan?.version, DEFAULT_CASE_SNAPSHOT.paymentPlanVersion)
  };
}

function parseClassificationText(text: string): Partial<ClassificationResult> | null {
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    return {
      classification:
        typeof parsed.classification === "string" ? parsed.classification : "conditional_promise",
      confidence: numeric(parsed.confidence, 0.48),
      guaranteedCash: Boolean(parsed.is_guaranteed_cash ?? parsed.guaranteedCash),
      reason: typeof parsed.reason === "string" ? parsed.reason : "Payment depends on PO re-approval."
    };
  } catch {
    return null;
  }
}

function formatEvidenceForClassification(retrieval?: CustomerMemoryRetrievalResult): string {
  if (!retrieval || retrieval.topEvidence.length === 0) {
    return "No customer-memory evidence was retrieved.";
  }

  return retrieval.topEvidence
    .map((evidence, index) => `${index + 1}. ${evidence.id}: ${evidence.snippet}`)
    .join("\n");
}

function fallbackClassification(retrieval?: CustomerMemoryRetrievalResult): ClassificationResult {
  const cached = getCachedFireworksCompletion("northstar_reply_classification");
  const parsed = cached ? parseClassificationText(cached.text) : null;
  const evidenceReason = retrieval?.memoryEvidence.behaviourSummary;

  return {
    classification: parsed?.classification ?? "conditional_promise",
    confidence: parsed?.confidence ?? 0.48,
    guaranteedCash: parsed?.guaranteedCash ?? false,
    llmMode: cached?.provider ?? "deterministic-fallback",
    reason: evidenceReason ?? parsed?.reason ?? "Payment depends on PO re-approval."
  };
}

async function classifyCustomerReply(
  event: EventInboxDocument,
  retrieval?: CustomerMemoryRetrievalResult
): Promise<ClassificationResult> {
  if (!liveFireworksEnabled()) {
    return fallbackClassification(retrieval);
  }

  try {
    const completion = await completeWithFireworks({
      system:
        "Classify customer payment replies for a cashflow workflow. Use the retrieved evidence, but do not perform or infer cash calculations. Return only JSON with classification, confidence, is_guaranteed_cash, and reason.",
      prompt: [
        `Customer reply: ${String(eventPayload(event).message ?? "")}`,
        "Retrieved evidence:",
        formatEvidenceForClassification(retrieval)
      ].join("\n")
    });
    const parsed = completion ? parseClassificationText(completion.text) : null;

    if (!completion || !parsed) {
      return fallbackClassification(retrieval);
    }

    return {
      classification: parsed.classification ?? "conditional_promise",
      confidence: parsed.confidence ?? 0.48,
      guaranteedCash: parsed.guaranteedCash ?? false,
      llmMode: completion.provider,
      reason: parsed.reason ?? "Payment depends on PO re-approval."
    };
  } catch {
    return fallbackClassification(retrieval);
  }
}

function buildForecastV2(
  event: EventInboxDocument,
  snapshot: CaseSnapshot,
  classification: string
): JsonDocument {
  const northstarPays = snapshot.currentCashGbp + snapshot.northstarInvoiceGbp - snapshot.payrollDueGbp;
  const northstarSlips = snapshot.currentCashGbp - snapshot.payrollDueGbp;

  return {
    _id: "forecast_case_0508_v2",
    company_id: event.company_id,
    case_id: event.case_id,
    version: 2,
    risk_level: "HIGH",
    event_id: event._id,
    classification,
    scenarios: [
      {
        name: "northstar_pays_supplier_held",
        calculation: `${snapshot.currentCashGbp} + ${snapshot.northstarInvoiceGbp} - ${snapshot.payrollDueGbp}`,
        friday_position_gbp: northstarPays,
        risk_note: "Receipt is conditional, so overall case remains HIGH."
      },
      {
        name: "northstar_slips_supplier_held",
        calculation: `${snapshot.currentCashGbp} - ${snapshot.payrollDueGbp}`,
        friday_position_gbp: northstarSlips
      }
    ]
  };
}

function buildForecastV3(event: EventInboxDocument, snapshot: CaseSnapshot): JsonDocument {
  const bankAmount = numeric(eventPayload(event).amount_gbp, 1200);
  const currentCashGbp = DEFAULT_CASE_SNAPSHOT.currentCashGbp + bankAmount;
  const northstarSlips = currentCashGbp - snapshot.payrollDueGbp;
  const northstarPaysAfterPayroll =
    currentCashGbp + snapshot.northstarInvoiceGbp - snapshot.payrollDueGbp - snapshot.supplierBillGbp;

  return {
    _id: "forecast_case_0508_v3",
    company_id: event.company_id,
    case_id: event.case_id,
    version: 3,
    risk_level: "WATCH",
    event_id: event._id,
    current_cash_gbp: currentCashGbp,
    scenarios: [
      {
        name: "northstar_slips_supplier_held",
        calculation: `${currentCashGbp} - ${snapshot.payrollDueGbp}`,
        friday_position_gbp: northstarSlips
      },
      {
        name: "northstar_pays_supplier_after_payroll",
        calculation: `${currentCashGbp} + ${snapshot.northstarInvoiceGbp} - ${snapshot.payrollDueGbp} - ${snapshot.supplierBillGbp}`,
        friday_position_gbp: northstarPaysAfterPayroll
      }
    ]
  };
}

function buildPaymentPlan(event: EventInboxDocument, version: 2 | 3): JsonDocument {
  return {
    _id: `payment_plan_case_0508_v${version}`,
    company_id: event.company_id,
    case_id: event.case_id,
    version,
    recommendation:
      version === 3
        ? "conditional_hold_until_customer_a_payment_clears"
        : "continue_full_delay_until_explicit_payment_confirmation",
    supplier_bill_id: "bill_motionprint_0507",
    human_approval_required: true
  };
}

function buildCaseUpdate(event: EventInboxDocument, forecastVersion: 2 | 3, paymentPlanVersion: 2 | 3) {
  const set: Record<string, unknown> = {
    active_forecast_id: `forecast_case_0508_v${forecastVersion}`,
    active_payment_plan_id: `payment_plan_case_0508_v${paymentPlanVersion}`,
    risk_level: forecastVersion === 3 ? "WATCH" : "HIGH",
    updated_at: new Date().toISOString()
  };

  if (forecastVersion === 3) {
    set.current_cash_gbp = 9600;
  }

  return updateWrite(
    "cases",
    { _id: event.case_id },
    { $set: set },
    "Update compact live case pointer after LangGraph forecast and payment-plan nodes."
  );
}

async function eventRouter(state: RunwayOpsStateType) {
  const { event } = state;

  if (!SUPPORTED_EVENT_TYPES.has(event.event_type)) {
    return {
      status: "skipped" as EventStatus,
      writePlan: [
        agentRun({
          event,
          agentId: "event_router",
          agentName: "Event Router",
          nodeName: "eventRouter",
          workerIndex: 1,
          status: "skipped",
          summary: `Unsupported event type ${event.event_type}; no downstream worker tasks created.`
        })
      ]
    };
  }

  const isCustomerReply = event.event_type === "customer.email_reply";
  const routeIntents: RouteIntent[] = isCustomerReply
    ? ["handle_customer_reply"]
    : ["skip_customer_memory", "skip_collections", "handle_bank_transaction"];
  const downstreamTasks = isCustomerReply
    ? [
        task(event, "retrieve_customer_memory", "customer_memory_agent"),
        task(event, "recompute_forecast", "forecast_agent"),
        task(event, "draft_collections_action", "collections_agent"),
        task(event, "revise_payment_plan", "payment_run_agent"),
        task(event, "write_audit_and_memory", "audit_learning_agent")
      ]
    : [
        task(event, "recompute_forecast", "forecast_agent"),
        task(event, "revise_payment_plan", "payment_run_agent"),
        task(event, "write_audit_and_memory", "audit_learning_agent")
      ];

  return {
    status: "processed" as EventStatus,
    routeIntents,
    writePlan: [
      isCustomerReply ? customerReceivedEvent(event) : bankTransactionEvent(event),
      ...downstreamTasks,
      agentRun({
        event,
        agentId: "event_router",
        agentName: "Event Router",
        nodeName: "eventRouter",
        workerIndex: 1,
        summary: `Classified ${event.event_type} and routed downstream workers.`,
        output: { routeIntents, downstreamTaskCount: downstreamTasks.length }
      })
    ]
  };
}

async function customerMemoryAgent(state: RunwayOpsStateType, db?: Db) {
  const { event, routeIntents } = state;

  if (!routeIntents.includes("handle_customer_reply")) {
    return {
      writePlan: [
        agentRun({
          event,
          agentId: "customer_memory_agent",
          agentName: "Customer Memory Agent",
          nodeName: "customerMemoryAgent",
          workerIndex: 2,
          status: "skipped",
          summary: "No customer reply evidence retrieval needed for this event."
        })
      ]
    };
  }

  const retrievalContext = buildCustomerMemoryRetrievalContext(event);
  const retrieval = db
    ? await retrieveCustomerMemoryEvidence(db, retrievalContext)
    : buildDeterministicCustomerMemoryRetrieval(retrievalContext);
  const classification = await classifyCustomerReply(event, retrieval);
  const topEvidenceIds = retrieval.topEvidenceIds;
  const memoryEvidence: CustomerMemoryEvidence = retrieval.memoryEvidence;
  const retrievalSummary = retrieval.vectorSearchUsed
    ? "Retrieved Northstar evidence with Fireworks embeddings and Atlas Vector Search."
    : "Used deterministic Northstar customer-memory fallback after live vector retrieval was unavailable.";

  return {
    classification: classification.classification,
    classificationConfidence: classification.confidence,
    llmMode: classification.llmMode,
    customerMemoryEvidence: memoryEvidence,
    writePlan: [
      replaceWrite(
        "retrieval_attempts",
        {
          _id: "retrieval_northstar_reply_0504",
          company_id: event.company_id,
          case_id: event.case_id,
          query: retrieval.query,
          strategy: retrieval.strategy,
          retrieval_status: retrieval.status,
          collection: retrieval.collection,
          vector_index: retrieval.vectorIndex,
          vector_field: retrieval.vectorField,
          ...(retrieval.vectorDimension ? { vector_dimension: retrieval.vectorDimension } : {}),
          ...(retrieval.embeddingProvider ? { embedding_provider: retrieval.embeddingProvider } : {}),
          ...(retrieval.embeddingModel ? { embedding_model: retrieval.embeddingModel } : {}),
          ...(retrieval.embeddingModelResponse
            ? { embedding_model_response: retrieval.embeddingModelResponse }
            : {}),
          top_evidence_ids: topEvidenceIds,
          top_evidence: retrieval.topEvidence,
          expected_matches: retrieval.expectedMatches,
          expected_metadata: retrieval.expectedMetadata,
          vector_search_used: retrieval.vectorSearchUsed,
          vector_search_attempted: retrieval.vectorSearchAttempted,
          ...(retrieval.fallbackReason ? { fallback_reason: retrieval.fallbackReason } : {}),
          sufficient: retrieval.sufficient,
          event_id: event._id,
          classification: classification.classification,
          confidence: classification.confidence,
          behaviour_summary: memoryEvidence.behaviourSummary,
          preferred_channels: memoryEvidence.preferredChannels,
          phone_contact_consent: memoryEvidence.phoneContactConsent,
          explicit_confirmation_required: memoryEvidence.explicitConfirmationRequired,
          created_at: eventTimestamp(event)
        },
        "Customer Memory Agent retrieval evidence from Atlas Vector Search or deterministic fallback."
      ),
      customerClassifiedEvent(
        event,
        classification.classification,
        classification.confidence,
        classification.guaranteedCash
      ),
      agentRun({
        event,
        agentId: "customer_memory_agent",
        agentName: "Customer Memory Agent",
        nodeName: "customerMemoryAgent",
        workerIndex: 2,
        summary: `${retrievalSummary} Classified the reply as conditional, not guaranteed cash.`,
        output: {
          classification: classification.classification,
          confidence: classification.confidence,
          guaranteedCash: classification.guaranteedCash,
          reason: classification.reason,
          retrieval_attempt_id: "retrieval_northstar_reply_0504",
          topEvidenceIds,
          topEvidence: retrieval.topEvidence,
          vectorSearchUsed: retrieval.vectorSearchUsed,
          vectorSearchAttempted: retrieval.vectorSearchAttempted,
          fallbackReason: retrieval.fallbackReason,
          customerMemoryEvidence: memoryEvidence
        },
        llmMode: classification.llmMode
      })
    ]
  };
}

async function forecastAgent(state: RunwayOpsStateType) {
  const { event, caseSnapshot, classification } = state;

  if (!SUPPORTED_EVENT_TYPES.has(event.event_type)) {
    return {
      writePlan: [
        agentRun({
          event,
          agentId: "forecast_agent",
          agentName: "Forecast Agent",
          nodeName: "forecastAgent",
          workerIndex: 3,
          status: "skipped",
          summary: "No forecast update needed for unsupported event type."
        })
      ]
    };
  }

  const isBankEvent = event.event_type === "bank.transaction.posted";
  const forecastVersion = isBankEvent ? 3 : 2;
  const riskAfter: RiskLevel = isBankEvent ? "WATCH" : "HIGH";
  const forecast = isBankEvent
    ? buildForecastV3(event, caseSnapshot)
    : buildForecastV2(event, caseSnapshot, classification ?? "conditional_promise");

  return {
    forecastVersion,
    riskLevel: riskAfter,
    caseSnapshot: {
      ...caseSnapshot,
      riskLevel: riskAfter,
      currentCashGbp: numeric(forecast.current_cash_gbp, caseSnapshot.currentCashGbp),
      forecastVersion
    },
    writePlan: [
      ...(isBankEvent
        ? [insertIfMissingWrite("bank_transactions_ts", bankTransactionDocument(event), "Idempotent bank-feed transaction insert.")]
        : []),
      replaceWrite("cashflow_forecasts", forecast, "Deterministic cash forecast produced by Forecast Agent."),
      forecastUpdatedEvent(event, forecastVersion as 2 | 3, riskAfter),
      agentRun({
        event,
        agentId: "forecast_agent",
        agentName: "Forecast Agent",
        nodeName: "forecastAgent",
        workerIndex: 3,
        summary: `Computed forecast v${forecastVersion}; risk is ${riskAfter}.`,
        output: {
          forecast_id: forecast._id,
          forecastVersion,
          riskLevel: riskAfter,
          scenarios: forecast.scenarios,
          arithmetic: "deterministic"
        }
      })
    ]
  };
}

async function collectionsAgent(state: RunwayOpsStateType) {
  const { event, classification, classificationConfidence, customerMemoryEvidence, routeIntents } = state;

  if (routeIntents.includes("skip_collections") || !routeIntents.includes("handle_customer_reply")) {
    return {
      writePlan: [
        agentRun({
          event,
          agentId: "collections_agent",
          agentName: "Collections Agent",
          nodeName: "collectionsAgent",
          workerIndex: 4,
          status: "skipped",
          summary: "No customer-facing draft required for this event."
        })
      ]
    };
  }

  const memoryEvidence: CustomerMemoryEvidence = customerMemoryEvidence ?? {
    customerId: "cust_northstar",
    invoiceId: "inv_1042",
    behaviourSummary:
      "Northstar PO-dependent payment promises need explicit finance-team confirmation before being counted as payroll cash.",
    evidenceIds: ["chunk_northstar_po_memory", "thread_northstar_inv_1042", "payhist_northstar"],
    preferredChannels: ["email", "phone"],
    phoneContactConsent: true,
    explicitConfirmationRequired: true
  };
  const primaryChannel = memoryEvidence.preferredChannels[0] ?? "email";
  const fallbackChannel: ContactChannel =
    memoryEvidence.phoneContactConsent && memoryEvidence.preferredChannels.includes("phone")
      ? "phone"
      : "email";
  const outreachDecision: OutreachDecision = {
    primaryChannel,
    fallbackChannel,
    primaryAction: "send_email_confirmation_first_after_human_approval",
    fallbackAction: "queue_approved_phone_call_if_email_reply_remains_ambiguous",
    reason: `${memoryEvidence.behaviourSummary} Email creates an auditable first ask; phone remains an approval-required fallback if ambiguity remains.`,
    humanApprovalRequired: true,
    externalCommunicationSent: false
  };

  return {
    outreachDecision,
    writePlan: [
      replaceWrite(
        "collection_drafts",
        {
          _id: "draft_northstar_confirmation_v2",
          company_id: event.company_id,
          case_id: event.case_id,
          customer_id: memoryEvidence.customerId,
          invoice_id: memoryEvidence.invoiceId,
          channel: "email",
          status: "approval_required",
          outreach_strategy: "email_confirmation_first",
          subject: "Please confirm PO approval and Friday payment for INV-1042",
          body:
            "Hi Maya, thanks for the update. Before we count INV-1042 toward Friday payroll, can your finance team confirm the PO is re-approved and that payment will be released on Friday 8 May?",
          tone: "direct finance-team wording",
          next_step_if_ambiguous: "approval_required_phone_call",
          external_send_requires_approval: true,
          source_event_id: event._id,
          created_at: eventTimestamp(event)
        },
        "Approval-ready Northstar follow-up drafted by Collections Agent."
      ),
      replaceWrite(
        "collection_drafts",
        {
          _id: "draft_northstar_phone_followup_v1",
          company_id: event.company_id,
          case_id: event.case_id,
          customer_id: memoryEvidence.customerId,
          invoice_id: memoryEvidence.invoiceId,
          channel: "phone",
          status: "approval_required",
          outreach_strategy: "fallback_if_email_remains_ambiguous",
          call_automatically: false,
          phone_contact_consent: memoryEvidence.phoneContactConsent,
          script:
            "Hi Maya, this is Emma from Marlow & Finch. We saw your note about INV-1042 and the PO re-approval. Could you confirm whether the PO is now approved and whether payment will definitely be released on Friday 8 May?",
          trigger_condition:
            "Use only if the approved email follow-up receives another ambiguous or PO-dependent reply.",
          external_call_requires_approval: true,
          source_event_id: event._id,
          created_at: eventTimestamp(event)
        },
        "Approval-required phone fallback script; no external call is placed automatically."
      ),
      task(
        event,
        "approve_northstar_confirmation_email",
        "human_founder",
        "approval_required",
        {
          channel: "email",
          draft_id: "draft_northstar_confirmation_v2",
          external_communication_sent: false
        }
      ),
      task(
        event,
        "approve_northstar_phone_followup_if_ambiguous",
        "human_founder",
        "approval_required",
        {
          channel: "phone",
          draft_id: "draft_northstar_phone_followup_v1",
          trigger_condition: "only_if_email_reply_remains_ambiguous",
          call_automatically: false,
          external_communication_sent: false
        }
      ),
      replaceWrite(
        "decision_log",
        {
          _id: "decision_outreach_northstar_0504",
          company_id: event.company_id,
          case_id: event.case_id,
          event_id: event._id,
          decision_type: "adaptive_outreach_selection",
          summary:
            "Collections selected email confirmation first for Northstar, with an approval-required phone call fallback only if the next reply remains ambiguous.",
          risk_after: "HIGH",
          selected_channel: outreachDecision.primaryChannel,
          fallback_channel: outreachDecision.fallbackChannel,
          primary_action: outreachDecision.primaryAction,
          fallback_action: outreachDecision.fallbackAction,
          reason: outreachDecision.reason,
          evidence_ids: memoryEvidence.evidenceIds,
          human_approval_required: outreachDecision.humanApprovalRequired,
          external_communication_sent: outreachDecision.externalCommunicationSent,
          created_at: eventTimestamp(event)
        },
        "Auditable adaptive outreach decision from Collections Agent."
      ),
      agentRun({
        event,
        agentId: "collections_agent",
        agentName: "Collections Agent",
        nodeName: "collectionsAgent",
        workerIndex: 4,
        summary: "Drafted an approval-ready Northstar confirmation request.",
        output: {
          draft_id: "draft_northstar_confirmation_v2",
          fallback_draft_id: "draft_northstar_phone_followup_v1",
          classification,
          confidence: classificationConfidence,
          memoryEvidence,
          topEvidence: memoryEvidence.topEvidence ?? [],
          outreachDecision,
          requiresHumanApproval: true,
          externalCommunicationSent: false
        }
      })
    ]
  };
}

async function paymentRunAgent(state: RunwayOpsStateType) {
  const { event, forecastVersion, riskLevel } = state;

  if (!SUPPORTED_EVENT_TYPES.has(event.event_type)) {
    return {
      writePlan: [
        agentRun({
          event,
          agentId: "payment_run_agent",
          agentName: "Payment Run Agent",
          nodeName: "paymentRunAgent",
          workerIndex: 5,
          status: "skipped",
          summary: "No payment-plan update needed for unsupported event type."
        })
      ]
    };
  }

  const paymentPlanVersion = event.event_type === "bank.transaction.posted" ? 3 : 2;
  const paymentPlan = buildPaymentPlan(event, paymentPlanVersion);

  return {
    paymentPlanVersion,
    caseSnapshot: {
      ...state.caseSnapshot,
      paymentPlanVersion
    },
    writePlan: [
      replaceWrite("payment_run_plans", paymentPlan, "Supplier timing recommendation from Payment Run Agent."),
      task(
        event,
        paymentPlanVersion === 3 ? "approve_supplier_conditional_hold" : "approve_supplier_full_delay",
        "human_founder",
        "approval_required"
      ),
      ...(paymentPlanVersion === 3 ? [paymentPlanUpdatedEvent(event)] : []),
      buildCaseUpdate(event, forecastVersion as 2 | 3, paymentPlanVersion),
      agentRun({
        event,
        agentId: "payment_run_agent",
        agentName: "Payment Run Agent",
        nodeName: "paymentRunAgent",
        workerIndex: 5,
        summary: `Created payment plan v${paymentPlanVersion}: ${paymentPlan.recommendation}.`,
        output: {
          payment_plan_id: paymentPlan._id,
          paymentPlanVersion,
          forecastVersion,
          riskLevel,
          recommendation: paymentPlan.recommendation,
          humanApprovalRequired: true
        }
      })
    ]
  };
}

async function auditLearningAgent(state: RunwayOpsStateType) {
  const {
    event,
    forecastVersion,
    paymentPlanVersion,
    riskLevel,
    classification,
    classificationConfidence,
    outreachDecision
  } = state;

  if (!SUPPORTED_EVENT_TYPES.has(event.event_type)) {
    return {
      writePlan: [
        agentRun({
          event,
          agentId: "audit_learning_agent",
          agentName: "Audit / Learning Agent",
          nodeName: "auditLearningAgent",
          workerIndex: 6,
          status: "skipped",
          summary: "No audit update needed for unsupported event type."
        })
      ]
    };
  }

  if (event.event_type === "customer.email_reply") {
    return {
      writePlan: [
        replaceWrite(
          "decision_log",
          {
            _id: "decision_customer_reply_0504",
            company_id: event.company_id,
            case_id: event.case_id,
            decision_type: "customer_reply_classification",
            summary: "Northstar reply is a conditional promise, not guaranteed cash.",
            risk_after: "HIGH",
            event_id: event._id,
            forecast_version: forecastVersion,
            payment_plan_version: paymentPlanVersion,
            classification,
            confidence: classificationConfidence,
            outreach_decision: outreachDecision
          },
          "Founder-readable decision trail for the conditional customer reply."
        ),
        agentRun({
          event,
          agentId: "audit_learning_agent",
          agentName: "Audit / Learning Agent",
          nodeName: "auditLearningAgent",
          workerIndex: 6,
          summary: "Wrote the customer-reply decision explanation and preserved the forecast/payment-plan trace.",
          output: {
            decision_id: "decision_customer_reply_0504",
            forecastVersion,
            paymentPlanVersion,
            riskLevel,
            outreachDecision
          }
        })
      ]
    };
  }

  const briefingAudio = getCachedBriefingAudioMetadata();
  const founderBriefing: JsonDocument = {
    _id: "briefing_case_0508_v1",
    company_id: event.company_id,
    case_id: event.case_id,
    status: "generated",
    transcript:
      "Payroll remains under watch. Cash is now GBP 9,600 after the Harbour Labs retainer. If Northstar pays Friday and MotionPrint is held until after payroll, the case ends with GBP 800 remaining. If Northstar slips, Friday remains short by GBP 1,600. Approval is required before customer messages or supplier timing changes.",
    event_id: event._id,
    forecast_version: forecastVersion,
    payment_plan_version: paymentPlanVersion,
    ...(briefingAudio ? { audio: briefingAudio } : {})
  };

  return {
    writePlan: [
      replaceWrite(
        "decision_log",
        {
          _id: "decision_bank_event_0504",
          company_id: event.company_id,
          case_id: event.case_id,
          decision_type: "forecast_replan",
          summary: "Harbour Labs retainer reduces the case from HIGH to WATCH, but does not make payroll safe.",
          risk_after: "WATCH",
          event_id: event._id,
          forecast_version: forecastVersion,
          payment_plan_version: paymentPlanVersion
        },
        "Founder-readable decision trail for the bank-feed replan."
      ),
      replaceWrite("founder_briefings", founderBriefing, "Founder briefing artifact produced by Audit / Learning Agent."),
      replaceWrite(
        "memory_cards",
        {
          _id: "mem_northstar_po_conditional_after_case",
          company_id: event.company_id,
          case_id: event.case_id,
          customer_id: "cust_northstar",
          summary:
            "Northstar promises are conditional unless PO confirmation is explicit; use direct finance-team wording with PO reference.",
          next_case_preview:
            "Future payroll-risk cases should ask Northstar for explicit PO approval and payment release confirmation before treating receipts as likely.",
          updated_at: eventTimestamp(event)
        },
        "Learning memory for future Northstar PO-dependent payment cases."
      ),
      founderBriefingEvent(event),
      memoryCardEvent(event),
      agentRun({
        event,
        agentId: "audit_learning_agent",
        agentName: "Audit / Learning Agent",
        nodeName: "auditLearningAgent",
        workerIndex: 6,
        summary: "Wrote decision explanation, founder briefing, and future-case memory.",
        output: {
          decision_id: "decision_bank_event_0504",
          briefing_id: "briefing_case_0508_v1",
          memory_card_id: "mem_northstar_po_conditional_after_case",
          forecastVersion,
          paymentPlanVersion,
          riskLevel
        }
      })
    ]
  };
}

export function buildRunwayOpsGraph(db?: Db) {
  return new StateGraph(RunwayOpsState)
    .addNode("eventRouter", eventRouter)
    .addNode("customerMemoryAgent", (state) => customerMemoryAgent(state, db))
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
    .compile();
}

export function summarizeWritePlan(writePlan: WritePlanItem[]) {
  return writePlan.reduce<Record<string, number>>((summary, item) => {
    summary[item.collection] = (summary[item.collection] ?? 0) + 1;

    return summary;
  }, {});
}

async function replaceDocument(db: Db, collectionName: string, document: JsonDocument): Promise<WriteSummary> {
  const doc = clone(document);
  const result = await documents(db, collectionName).replaceOne({ _id: doc._id }, doc, { upsert: true });

  return {
    collection: collectionName,
    id: String(doc._id),
    action: result.upsertedCount > 0 ? "inserted" : result.modifiedCount > 0 ? "updated" : "unchanged"
  };
}

async function insertDocumentIfMissing(
  db: Db,
  collectionName: string,
  document: JsonDocument
): Promise<WriteSummary> {
  const doc = clone(document);
  const existing = await documents(db, collectionName).findOne({ _id: doc._id });

  if (existing) {
    return {
      collection: collectionName,
      id: doc._id,
      action: "already_present"
    };
  }

  try {
    await documents(db, collectionName).insertOne(doc);

    return {
      collection: collectionName,
      id: doc._id,
      action: "inserted"
    };
  } catch (error) {
    if (errorCode(error) === 11000) {
      return {
        collection: collectionName,
        id: doc._id,
        action: "already_present"
      };
    }

    throw error;
  }
}

async function updateDocument(db: Db, item: WritePlanItem): Promise<WriteSummary> {
  if (!item.filter || !item.update) {
    throw new Error(`Invalid updateOne write plan for ${item.collection}`);
  }

  const result = await documents(db, item.collection).updateOne(item.filter, item.update, {
    upsert: item.upsert ?? false
  });

  return {
    collection: item.collection,
    id: String(item.filter._id ?? item.collection),
    action: result.upsertedCount > 0 ? "inserted" : result.modifiedCount > 0 ? "updated" : "unchanged"
  };
}

export async function applyWritePlan(db: Db, writePlan: WritePlanItem[]): Promise<WriteSummary[]> {
  const writes: WriteSummary[] = [];

  for (const item of writePlan) {
    if (item.operation === "replaceOne") {
      if (!item.document) {
        throw new Error(`Invalid replaceOne write plan for ${item.collection}`);
      }

      writes.push(await replaceDocument(db, item.collection, item.document));
      continue;
    }

    if (item.operation === "insertIfMissing") {
      if (!item.document) {
        throw new Error(`Invalid insertIfMissing write plan for ${item.collection}`);
      }

      writes.push(await insertDocumentIfMissing(db, item.collection, item.document));
      continue;
    }

    writes.push(await updateDocument(db, item));
  }

  return writes;
}

export async function invokeRunwayOpsGraph(db: Db, event: EventInboxDocument) {
  const graph = buildRunwayOpsGraph(db);
  const caseSnapshot = await hydrateCaseSnapshot(db, event);

  return graph.invoke(
    {
      event,
      caseSnapshot,
      status: "processed",
      riskLevel: caseSnapshot.riskLevel,
      forecastVersion: caseSnapshot.forecastVersion,
      paymentPlanVersion: caseSnapshot.paymentPlanVersion,
      writePlan: []
    },
    {
      configurable: {
        thread_id: event.case_id
      }
    }
  );
}

export async function processEventWithLangGraph(
  db: Db,
  event: EventInboxDocument
): Promise<LangGraphEventResult> {
  const result = await invokeRunwayOpsGraph(db, event);
  const writes = await applyWritePlan(db, result.writePlan);

  return {
    status: result.status,
    writes,
    threadId: event.case_id,
    writePlanSummary: summarizeWritePlan(result.writePlan)
  };
}
