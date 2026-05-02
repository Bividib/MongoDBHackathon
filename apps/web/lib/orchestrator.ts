import type { Collection, Db, Document } from "mongodb";

import agentRunsExpected from "../../../data/expected_outputs/agent_runs_expected.json";
import decisionLogExpected from "../../../data/expected_outputs/decision_log_expected.json";
import forecastV1Fixture from "../../../data/expected_outputs/forecast_v1_baseline.json";
import forecastV2Fixture from "../../../data/expected_outputs/forecast_v2_after_customer_a_reply.json";
import forecastV3Fixture from "../../../data/expected_outputs/forecast_v3_after_harbour_labs_retainer.json";
import founderBriefingExpected from "../../../data/expected_outputs/founder_briefing_expected.json";
import memoryCardExpected from "../../../data/expected_outputs/memory_card_expected.json";
import paymentPlanV2Fixture from "../../../data/expected_outputs/payment_plan_v2_after_customer_reply.json";
import paymentPlanV3Fixture from "../../../data/expected_outputs/payment_plan_v3_after_bank_transaction.json";
import retrievalAttemptsExpected from "../../../data/expected_outputs/retrieval_attempts_expected.json";
import customerReplyEventFixture from "../../../data/events/02_customer_a_conditional_reply.json";
import bankTransactionEventFixture from "../../../data/events/03_harbour_labs_retainer_posted.json";
import baselineCaseEventsFixture from "../../../data/fixtures/baseline_case_events.json";
import baselineCaseFixture from "../../../data/fixtures/baseline_payroll_case.json";
import baselineCollectionDraftsFixture from "../../../data/fixtures/baseline_collection_drafts.json";
import { getCachedFireworksCompletion } from "./fireworks";
import { getMongoDb } from "./mongodb";
import { getCachedBriefingAudioMetadata } from "./tts";

type JsonDocument = Document & { _id: string };

type EventInboxDocument = JsonDocument & {
  event_key: string;
  company_id: string;
  case_id: string;
  event_type: string;
  source?: string;
  status?: string;
  received_at?: string;
  payload?: Record<string, unknown>;
};

type WriteSummary = {
  collection: string;
  id: string;
  action: "inserted" | "updated" | "unchanged" | "already_present";
};

type ProcessedEventSummary = {
  eventId: string;
  eventKey: string;
  eventType: string;
  status: "processed" | "skipped";
  writes: WriteSummary[];
};

export type OrchestrationResult = {
  processed: ProcessedEventSummary[];
  pendingCount: number;
};

const CASE_ID = "case_payroll_2026_05_08";
const COMPANY_ID = "cmp_marlow_finch";
const PROCESSABLE_STATUSES = ["pending", "new"];

export const demoCollections = [
  "companies",
  "users",
  "customers",
  "invoices",
  "customer_payment_history",
  "supplier_bills",
  "supplier_terms",
  "payroll_obligations",
  "recurring_payments",
  "bank_transactions_ts",
  "email_threads",
  "source_files",
  "memory_chunks",
  "memory_cards",
  "past_cash_squeeze_cases",
  "cases",
  "events",
  "event_inbox",
  "collection_drafts",
  "payment_run_plans",
  "cashflow_forecasts",
  "decision_log",
  "founder_briefings",
  "retrieval_attempts",
  "agent_runs",
  "tasks",
  "artifacts",
  "checkpoints",
  "agent_scratch",
  "retrieval_cache"
] as const;

let indexesEnsured = false;

function documents(db: Db, collectionName: string): Collection<JsonDocument> {
  return db.collection<JsonDocument>(collectionName);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function eventTimestamp(event: EventInboxDocument): string {
  return event.received_at ?? new Date().toISOString();
}

function errorCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: number }).code;
  }

  return undefined;
}

async function collectionExists(db: Db, collectionName: string): Promise<boolean> {
  return db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
}

async function ensureBankTransactionsCollection(db: Db) {
  if (await collectionExists(db, "bank_transactions_ts")) {
    return;
  }

  try {
    await db.createCollection("bank_transactions_ts", {
      timeseries: {
        timeField: "posted_at",
        metaField: "company_id",
        granularity: "minutes"
      }
    });
  } catch (error) {
    if (errorCode(error) !== 48) {
      throw error;
    }
  }
}

export async function ensureOrchestratorIndexes(db: Db) {
  if (indexesEnsured) {
    return;
  }

  await ensureBankTransactionsCollection(db);
  await Promise.all([
    db.collection("event_inbox").createIndex({ event_key: 1 }, { unique: true }),
    db.collection("event_inbox").createIndex({ status: 1, received_at: 1 }),
    db.collection("events").createIndex({ event_key: 1 }, { unique: true }),
    db.collection("events").createIndex({ case_id: 1, occurred_at: -1 }),
    db.collection("cashflow_forecasts").createIndex({ case_id: 1, version: -1 }),
    db.collection("payment_run_plans").createIndex({ case_id: 1, version: -1 }),
    db.collection("decision_log").createIndex({ case_id: 1, created_at: -1 }),
    db.collection("founder_briefings").createIndex({ case_id: 1, created_at: -1 }),
    db.collection("memory_cards").createIndex({ company_id: 1, customer_id: 1, created_at: -1 }),
    db.collection("retrieval_attempts").createIndex({ company_id: 1, case_id: 1, created_at: -1 }),
    db.collection("agent_runs").createIndex({ company_id: 1, case_id: 1, started_at: -1 })
  ]);

  indexesEnsured = true;
}

async function replaceDocument(
  db: Db,
  collectionName: string,
  document: JsonDocument
): Promise<WriteSummary> {
  const doc = clone(document);
  const result = await documents(db, collectionName).replaceOne(
    { _id: doc._id },
    doc,
    { upsert: true }
  );

  return {
    collection: collectionName,
    id: String(doc._id),
    action: result.upsertedCount > 0 ? "inserted" : result.modifiedCount > 0 ? "updated" : "unchanged"
  };
}

async function insertTimeSeriesDocumentIfMissing(
  db: Db,
  collectionName: string,
  document: JsonDocument
): Promise<WriteSummary> {
  const existing = await documents(db, collectionName).findOne({ _id: document._id });

  if (existing) {
    return {
      collection: collectionName,
      id: document._id,
      action: "already_present"
    };
  }

  try {
    await documents(db, collectionName).insertOne(document);

    return {
      collection: collectionName,
      id: document._id,
      action: "inserted"
    };
  } catch (error) {
    if (errorCode(error) === 11000) {
      return {
        collection: collectionName,
        id: document._id,
        action: "already_present"
      };
    }

    throw error;
  }
}

async function upsertMany(
  db: Db,
  collectionName: string,
  documents: JsonDocument[]
): Promise<WriteSummary[]> {
  const writes: WriteSummary[] = [];

  for (const document of documents) {
    writes.push(await replaceDocument(db, collectionName, document));
  }

  return writes;
}

async function insertEventFixture(event: EventInboxDocument) {
  const db = await getMongoDb();
  await ensureOrchestratorIndexes(db);

  const fixture = clone(event);
  const result = await documents(db, "event_inbox").updateOne(
    { event_key: fixture.event_key },
    {
      $setOnInsert: fixture
    },
    { upsert: true }
  );
  const storedEvent = await documents(db, "event_inbox").findOne({
    event_key: fixture.event_key
  });

  return {
    inserted: result.upsertedCount > 0,
    event: storedEvent ?? fixture
  };
}

export async function insertCustomerReplyEvent() {
  return insertEventFixture(customerReplyEventFixture as EventInboxDocument);
}

export async function insertBankTransactionEvent() {
  return insertEventFixture(bankTransactionEventFixture as EventInboxDocument);
}

function buildCustomerReplyTimeline(event: EventInboxDocument): JsonDocument[] {
  const timestamp = eventTimestamp(event);

  return [
    {
      _id: "evt_northstar_reply_0504",
      event_key: `${event.event_key}:timeline:received`,
      company_id: event.company_id,
      case_id: event.case_id,
      event_type: "email.received",
      occurred_at: timestamp,
      summary: "Northstar reply received with PO-dependent Friday payment language.",
      payload: {
        inbox_event_id: event._id,
        customer_id: event.payload?.customer_id,
        invoice_id: event.payload?.invoice_id
      }
    },
    {
      _id: "evt_northstar_classified_0504",
      event_key: `${event.event_key}:timeline:classified`,
      company_id: event.company_id,
      case_id: event.case_id,
      event_type: "reply.classified",
      occurred_at: "2026-05-04T10:05:10.000+01:00",
      summary: "Northstar reply classified as a conditional promise, not guaranteed cash.",
      payload: {
        classification: "conditional_promise",
        confidence: 0.48,
        guaranteed_cash: false
      }
    },
    {
      _id: "evt_forecast_v2_0504",
      event_key: `${event.event_key}:timeline:forecast_v2`,
      company_id: event.company_id,
      case_id: event.case_id,
      event_type: "forecast.updated",
      occurred_at: "2026-05-04T10:05:17.000+01:00",
      summary: "Forecast v2 keeps payroll risk HIGH after conditional Northstar reply.",
      payload: {
        from_version: 1,
        to_version: 2,
        risk_from: "HIGH",
        risk_to: "HIGH"
      }
    }
  ];
}

function buildBankTimeline(event: EventInboxDocument): JsonDocument[] {
  const timestamp = eventTimestamp(event);

  return [
    {
      _id: "evt_bank_harbour_labs_0504",
      event_key: `${event.event_key}:timeline:posted`,
      company_id: event.company_id,
      case_id: event.case_id,
      event_type: "bank.transaction.posted",
      occurred_at: timestamp,
      summary: "Harbour Labs retainer posted to the bank feed.",
      payload: {
        inbox_event_id: event._id,
        transaction_id: event.payload?.transaction_id,
        amount_gbp: event.payload?.amount_gbp
      }
    },
    {
      _id: "evt_forecast_v3_0504",
      event_key: `${event.event_key}:timeline:forecast_v3`,
      company_id: event.company_id,
      case_id: event.case_id,
      event_type: "forecast.updated",
      occurred_at: "2026-05-04T10:05:52.000+01:00",
      summary: "Forecast v3 moves case risk from HIGH to WATCH after the GBP 1,200 receipt.",
      payload: {
        from_version: 2,
        to_version: 3,
        risk_from: "HIGH",
        risk_to: "WATCH"
      }
    },
    {
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
    },
    {
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
    },
    {
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
    }
  ];
}

function buildBankTransactionDocument(event: EventInboxDocument): JsonDocument {
  const postedAt = String(event.payload?.posted_at ?? event.received_at ?? new Date().toISOString());

  return {
    _id: "bank_txn_harbour_labs_0504",
    company_id: event.company_id,
    transaction_id: event.payload?.transaction_id ?? "txn_harbour_labs_0504",
    posted_at: new Date(postedAt),
    description: event.payload?.description ?? "Harbour Labs retainer",
    amount_gbp: event.payload?.amount_gbp ?? 1200,
    balance_after_gbp: 9600,
    source: event.source ?? "eventbridge_or_local_timer"
  };
}

async function updateCasePointer(
  db: Db,
  values: {
    activeForecastId: string;
    activePaymentPlanId: string;
    riskLevel: "HIGH" | "WATCH";
    currentCashGbp?: number;
  }
): Promise<WriteSummary> {
  const set: Record<string, unknown> = {
    active_forecast_id: values.activeForecastId,
    active_payment_plan_id: values.activePaymentPlanId,
    risk_level: values.riskLevel,
    updated_at: new Date().toISOString()
  };

  if (values.currentCashGbp !== undefined) {
    set.current_cash_gbp = values.currentCashGbp;
  }

  const result = await documents(db, "cases").updateOne({ _id: CASE_ID }, { $set: set });

  return {
    collection: "cases",
    id: CASE_ID,
    action: result.modifiedCount > 0 ? "updated" : "unchanged"
  };
}

async function processCustomerReply(db: Db, event: EventInboxDocument): Promise<WriteSummary[]> {
  const writes: WriteSummary[] = [];
  const cachedClassification = getCachedFireworksCompletion("northstar_reply_classification");

  writes.push(
    ...(await upsertMany(
      db,
      "retrieval_attempts",
      asArray(retrievalAttemptsExpected as JsonDocument[])
    ))
  );
  writes.push(
    ...(await upsertMany(db, "agent_runs", [
      {
        ...(agentRunsExpected as JsonDocument[])[0],
        company_id: event.company_id,
        case_id: event.case_id,
        event_id: event._id,
        llm_mode: cachedClassification?.provider ?? "fixture-cache"
      }
    ]))
  );
  writes.push(await replaceDocument(db, "cashflow_forecasts", forecastV2Fixture as JsonDocument));
  writes.push(await replaceDocument(db, "payment_run_plans", paymentPlanV2Fixture as JsonDocument));
  writes.push(await replaceDocument(db, "decision_log", (decisionLogExpected as JsonDocument[])[0]));
  writes.push(...(await upsertMany(db, "events", buildCustomerReplyTimeline(event))));
  writes.push(
    await updateCasePointer(db, {
      activeForecastId: "forecast_case_0508_v2",
      activePaymentPlanId: "payment_plan_case_0508_v2",
      riskLevel: "HIGH"
    })
  );

  return writes;
}

async function processBankTransaction(db: Db, event: EventInboxDocument): Promise<WriteSummary[]> {
  const writes: WriteSummary[] = [];
  const briefingAudio = getCachedBriefingAudioMetadata();
  const briefing = {
    ...(founderBriefingExpected as JsonDocument),
    ...(briefingAudio ? { audio: briefingAudio } : {})
  };

  writes.push(
    await insertTimeSeriesDocumentIfMissing(
      db,
      "bank_transactions_ts",
      buildBankTransactionDocument(event)
    )
  );
  writes.push(
    ...(await upsertMany(
      db,
      "agent_runs",
      (agentRunsExpected as JsonDocument[]).slice(1).map((run) => ({
        ...run,
        company_id: event.company_id,
        case_id: event.case_id,
        event_id: event._id,
        llm_mode: "fixture-cache"
      }))
    ))
  );
  writes.push(await replaceDocument(db, "cashflow_forecasts", forecastV3Fixture as JsonDocument));
  writes.push(await replaceDocument(db, "payment_run_plans", paymentPlanV3Fixture as JsonDocument));
  writes.push(await replaceDocument(db, "decision_log", (decisionLogExpected as JsonDocument[])[1]));
  writes.push(await replaceDocument(db, "founder_briefings", briefing));
  writes.push(await replaceDocument(db, "memory_cards", memoryCardExpected as JsonDocument));
  writes.push(...(await upsertMany(db, "events", buildBankTimeline(event))));
  writes.push(
    await updateCasePointer(db, {
      activeForecastId: "forecast_case_0508_v3",
      activePaymentPlanId: "payment_plan_case_0508_v3",
      riskLevel: "WATCH",
      currentCashGbp: 9600
    })
  );

  return writes;
}

async function processEvent(db: Db, event: EventInboxDocument): Promise<ProcessedEventSummary> {
  let writes: WriteSummary[] = [];
  let status: ProcessedEventSummary["status"] = "processed";

  if (event.event_type === "customer.email_reply") {
    writes = await processCustomerReply(db, event);
  } else if (event.event_type === "bank.transaction.posted") {
    writes = await processBankTransaction(db, event);
  } else {
    status = "skipped";
  }

  return {
    eventId: event._id,
    eventKey: event.event_key,
    eventType: event.event_type,
    status,
    writes
  };
}

export async function processPendingEventInbox(): Promise<OrchestrationResult> {
  const db = await getMongoDb();
  await ensureOrchestratorIndexes(db);

  const pendingEvents = (await documents(db, "event_inbox")
    .find({ status: { $in: PROCESSABLE_STATUSES } })
    .sort({ received_at: 1, _id: 1 })
    .toArray()) as EventInboxDocument[];
  const processed: ProcessedEventSummary[] = [];

  for (const event of pendingEvents) {
    const claimResult = await documents(db, "event_inbox").updateOne(
      {
        _id: event._id,
        status: { $in: PROCESSABLE_STATUSES }
      },
      {
        $set: {
          status: "processing",
          processing_started_at: new Date().toISOString()
        }
      }
    );

    if (claimResult.modifiedCount === 0) {
      continue;
    }

    try {
      const summary = await processEvent(db, event);

      await documents(db, "event_inbox").updateOne(
        { _id: event._id },
        {
          $set: {
            status: summary.status === "processed" ? "processed" : "skipped",
            processed_at: new Date().toISOString(),
            result: {
              event_type: event.event_type,
              writes: summary.writes
            }
          },
          $unset: {
            processing_error: ""
          }
        }
      );

      processed.push(summary);
    } catch (error) {
      await documents(db, "event_inbox").updateOne(
        { _id: event._id },
        {
          $set: {
            status: "failed",
            processing_error: error instanceof Error ? error.message : String(error),
            processed_at: new Date().toISOString()
          }
        }
      );

      throw error;
    }
  }

  const pendingCount = await documents(db, "event_inbox").countDocuments({
    status: { $in: PROCESSABLE_STATUSES }
  });

  return {
    processed,
    pendingCount
  };
}

function feedTimestamp(document: Record<string, unknown>): string {
  return String(
    document.occurred_at ??
      document.ts ??
      document.received_at ??
      document.processed_at ??
      document.updated_at ??
      ""
  );
}

export async function getCaseState() {
  const db = await getMongoDb();
  await ensureOrchestratorIndexes(db);

  const [
    caseDoc,
    forecasts,
    paymentPlans,
    drafts,
    events,
    eventInbox,
    retrievalAttempts,
    agentRuns,
    decisionLog,
    founderBriefings,
    memoryCards
  ] = await Promise.all([
    documents(db, "cases").findOne({ _id: CASE_ID }),
    documents(db, "cashflow_forecasts").find({ case_id: CASE_ID }).sort({ version: 1 }).toArray(),
    documents(db, "payment_run_plans").find({ case_id: CASE_ID }).sort({ version: 1 }).toArray(),
    documents(db, "collection_drafts").find({ case_id: CASE_ID }).sort({ _id: 1 }).toArray(),
    documents(db, "events").find({ case_id: CASE_ID }).sort({ occurred_at: 1, _id: 1 }).toArray(),
    documents(db, "event_inbox").find({ case_id: CASE_ID }).sort({ received_at: 1, _id: 1 }).toArray(),
    documents(db, "retrieval_attempts").find({ case_id: CASE_ID }).sort({ created_at: 1, _id: 1 }).toArray(),
    documents(db, "agent_runs").find({ case_id: CASE_ID }).sort({ started_at: 1, _id: 1 }).toArray(),
    documents(db, "decision_log").find({ case_id: CASE_ID }).sort({ created_at: 1, _id: 1 }).toArray(),
    documents(db, "founder_briefings").find({ case_id: CASE_ID }).sort({ created_at: 1, _id: 1 }).toArray(),
    documents(db, "memory_cards").find({ company_id: COMPANY_ID }).sort({ created_at: 1, _id: 1 }).toArray()
  ]);

  const collectionCounts = Object.fromEntries(
    await Promise.all(
      demoCollections.map(async (collectionName) => {
        const count = await db.collection(collectionName).countDocuments();

        return [collectionName, count] as const;
      })
    )
  );
  const liveCase = caseDoc ?? clone(baselineCaseFixture);
  const liveForecasts = forecasts.length > 0 ? forecasts : [clone(forecastV1Fixture)];
  const liveDrafts = drafts.length > 0 ? drafts : clone(baselineCollectionDraftsFixture);
  const liveEvents = events.length > 0 ? events : clone(baselineCaseEventsFixture);
  const activeForecastId = String(liveCase.active_forecast_id ?? "");
  const activePaymentPlanId = String(liveCase.active_payment_plan_id ?? "");
  const latestForecast =
    liveForecasts.find((forecast) => forecast._id === activeForecastId) ??
    liveForecasts[liveForecasts.length - 1];
  const latestPaymentPlan =
    paymentPlans.find((plan) => plan._id === activePaymentPlanId) ??
    paymentPlans[paymentPlans.length - 1] ??
    null;
  const eventFeed = [
    ...liveEvents.map((event) => ({
      source_collection: "events",
      ...event
    })),
    ...eventInbox.map((event) => ({
      source_collection: "event_inbox",
      ...event
    }))
  ].sort((a, b) => feedTimestamp(a).localeCompare(feedTimestamp(b)));

  return {
    baselineCase: clone(baselineCaseFixture),
    case: liveCase,
    forecast: latestForecast,
    forecasts: liveForecasts,
    paymentPlan: latestPaymentPlan,
    paymentPlans,
    drafts: liveDrafts,
    eventFeed,
    events: liveEvents,
    eventInbox,
    retrievalAttempts,
    agentRuns,
    decisionLog,
    founderBriefings,
    memoryCards,
    collectionCounts,
    generatedAt: new Date().toISOString()
  };
}
