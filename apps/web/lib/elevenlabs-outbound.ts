import { randomUUID } from "node:crypto";
import type { Collection, Db, Document } from "mongodb";

import { getMongoDb } from "./mongodb";

const { maskPhoneNumber, normalizePhoneNumber } = require("../../../scripts/lib/phone") as {
  maskPhoneNumber(phoneNumber: string): string;
  normalizePhoneNumber(input: string, defaultCountry?: string): string;
};

type OutboundCallRequest = {
  send?: boolean;
  toNumber?: unknown;
  customerName?: unknown;
  customerId?: unknown;
  customerEmail?: unknown;
  invoiceNumber?: unknown;
  invoiceId?: unknown;
  amountGbp?: unknown;
  purpose?: unknown;
  collectionDraftId?: unknown;
  approvalTaskId?: unknown;
  approvedBy?: unknown;
};

type ElevenLabsConfig = {
  apiKey: string;
  agentId: string;
  agentPhoneNumberId: string;
};

type OutreachContext = {
  requestId: string;
  companyId: string;
  caseId: string;
  send: boolean;
  toNumber: string;
  maskedToNumber: string;
  customerName: string;
  customerId?: string;
  customerEmail?: string;
  invoiceNumber: string;
  invoiceId?: string;
  amountGbp: number;
  purpose: string;
  purposeSource: string;
  collectionDraftId?: string;
  approvalTaskId?: string;
  approvedBy?: string;
};

type OutreachRecommendation = {
  recommendedChannel: "phone" | "email";
  reason: string;
  evidenceStrength: "strong" | "limited" | "missing";
  emailDraft?: {
    to?: string;
    subject: string;
    body: string;
  };
};

type ElevenLabsResponse = {
  conversation_id?: string;
  conversationId?: string;
  callSid?: string;
  call_sid?: string;
  twilio_call_sid?: string;
};

type StringIdDocument = Document & { _id: string };

type OutboundCallResult = {
  ok: true;
  dryRun: boolean;
  maskedToNumber: string;
  conversationId?: string;
  callSid?: string;
  recommendedChannel: OutreachRecommendation["recommendedChannel"];
  recommendationReason: string;
  purposeSource: string;
};

type VoiceCallOutcomeRequest = {
  conversationId?: unknown;
  callSid?: unknown;
  customerId?: unknown;
  customerName?: unknown;
  invoiceId?: unknown;
  invoiceNumber?: unknown;
  amountGbp?: unknown;
  callAnswered?: unknown;
  outcomeStatus?: unknown;
  paymentTiming?: unknown;
  blockers?: unknown;
  summary?: unknown;
  transcriptSummary?: unknown;
  type?: unknown;
  data?: unknown;
};

type VoiceCallOutcomeResult = {
  ok: true;
  conversationId: string;
  callSid?: string;
  outcomeStatus: string;
  callAnswered: boolean;
};

type ResolvedVoiceCallOutcome = {
  conversationId: string;
  callSid?: string;
  customerId?: string;
  customerName?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amountGbp?: number;
  callAnswered: boolean;
  outcomeStatus: string;
  paymentTiming?: string;
  blockers?: string;
  summary?: string;
  transcriptSummary?: string;
};

const DEFAULT_COMPANY_ID = "cmp_marlow_finch";
const DEFAULT_CASE_ID = "case_payroll_2026_05_08";

class RequestValidationError extends Error {
  status = 400;
}

function documents(db: Db, collectionName: string): Collection<StringIdDocument> {
  return db.collection<StringIdDocument>(collectionName);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RequestValidationError(`Missing required field: ${field}`);
  }

  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asAmountGbp(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RequestValidationError("Missing required field: amountGbp");
  }

  return amount;
}

function getElevenLabsConfig(): ElevenLabsConfig {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID ?? process.env.ELEVEN_LABS_AGENT_ID;
  const agentPhoneNumberId =
    process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID ?? process.env.ELEVEN_LABS_AGENT_PHONE_NUMBER_ID;

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  if (!agentId) {
    throw new Error("Missing ELEVENLABS_AGENT_ID or ELEVEN_LABS_AGENT_ID");
  }

  if (!agentPhoneNumberId) {
    throw new Error("Missing ELEVENLABS_AGENT_PHONE_NUMBER_ID or ELEVEN_LABS_AGENT_PHONE_NUMBER_ID");
  }

  return { apiKey, agentId, agentPhoneNumberId };
}

async function resolveCollectionsAgentPurpose(
  db: Db,
  input: {
    explicitPurpose?: string;
    collectionDraftId?: string;
    customerId?: string;
    invoiceId?: string;
    invoiceNumber: string;
  }
): Promise<{ purpose: string; purposeSource: string }> {
  if (input.explicitPurpose) {
    return {
      purpose: input.explicitPurpose,
      purposeSource: "collections_agent_request"
    };
  }

  const draftQuery: Document = input.collectionDraftId
    ? { _id: input.collectionDraftId }
    : {
        ...(input.customerId ? { customer_id: input.customerId } : {}),
        ...(input.invoiceId ? { invoice_id: input.invoiceId } : {}),
        status: "approval_required"
      };

  const draft = await documents(db, "collection_drafts").findOne(draftQuery, {
    sort: { created_at: -1, _id: 1 }
  });

  if (!draft) {
    throw new RequestValidationError("Missing required field: purpose");
  }

  const draftPurpose =
    optionalString(draft.voice_call_purpose) ??
    optionalString(draft.call_purpose) ??
    optionalString(draft.body);

  if (!draftPurpose) {
    throw new RequestValidationError("Missing required field: purpose");
  }

  return {
    purpose: `Confirm payment timing using the collections-agent context: ${draftPurpose}`,
    purposeSource: String(draft._id ?? "collection_drafts")
  };
}

async function buildContext(db: Db, body: OutboundCallRequest): Promise<OutreachContext> {
  const toNumber = normalizePhoneNumber(asString(body.toNumber, "toNumber"));
  const invoiceNumber = asString(body.invoiceNumber, "invoiceNumber");
  const explicitPurpose = optionalString(body.purpose);
  const customerId = optionalString(body.customerId);
  const collectionDraftId = optionalString(body.collectionDraftId);
  const invoiceId = optionalString(body.invoiceId);
  const amountGbp = asAmountGbp(body.amountGbp);
  const { purpose, purposeSource } = await resolveCollectionsAgentPurpose(db, {
    explicitPurpose,
    collectionDraftId,
    customerId,
    invoiceId,
    invoiceNumber
  });

  return {
    requestId: `voice_${Date.now()}_${randomUUID().slice(0, 8)}`,
    companyId: DEFAULT_COMPANY_ID,
    caseId: DEFAULT_CASE_ID,
    send: body.send === true,
    toNumber,
    maskedToNumber: maskPhoneNumber(toNumber),
    customerName: asString(body.customerName, "customerName"),
    customerId,
    customerEmail: optionalString(body.customerEmail),
    invoiceNumber,
    invoiceId,
    amountGbp,
    purpose,
    purposeSource,
    collectionDraftId,
    approvalTaskId: optionalString(body.approvalTaskId),
    approvedBy: optionalString(body.approvedBy)
  };
}

function buildFirstMessage(context: OutreachContext): string {
  return [
    `Hello, this is a RunwayOps demo call for ${context.customerName}.`,
    `I am calling about payment timing for invoice ${context.invoiceNumber}.`,
    "Is now an okay time for a brief call?"
  ].join(" ");
}

function buildEmailDraft(context: OutreachContext): OutreachRecommendation["emailDraft"] {
  return {
    to: context.customerEmail,
    subject: `Payment timing for ${context.invoiceNumber}`,
    body: [
      `Hi ${context.customerName},`,
      "",
      `Could you confirm payment timing for ${context.invoiceNumber} for GBP ${context.amountGbp}?`,
      "If anything is blocking payment, please let us know what is needed to unblock it.",
      "",
      "Thanks"
    ].join("\n")
  };
}

async function recommendChannel(db: Db, context: OutreachContext): Promise<OutreachRecommendation> {
  const customer = context.customerId
    ? await documents(db, "customers").findOne({ _id: context.customerId })
    : await documents(db, "customers").findOne({ name: context.customerName });
  const profile = customer?.contact_response_profile as
    | {
        phone_pickup_rate?: number;
        email_reply_rate?: number;
        evidence_count?: number;
      }
    | undefined;
  const preferredChannels = Array.isArray(customer?.preferred_contact_channels)
    ? customer.preferred_contact_channels.map(String)
    : [];
  const phoneAllowed = customer?.phone_contact_consent !== false;
  const phonePickupRate = Number(profile?.phone_pickup_rate ?? NaN);
  const emailReplyRate = Number(profile?.email_reply_rate ?? NaN);

  if (customer?._id && (!profile || typeof profile.evidence_count !== "number")) {
    await documents(db, "customers").updateOne(
      { _id: customer._id },
      {
        $set: {
          "contact_response_profile.status": "needs_more_signal",
          "contact_response_profile.last_evaluated_at": new Date().toISOString(),
          "contact_response_profile.phone_e164_masked": context.maskedToNumber,
          ...(context.customerEmail ? { "contact_response_profile.email": context.customerEmail } : {})
        }
      }
    );
  }

  if (!phoneAllowed) {
    return {
      recommendedChannel: "email",
      reason: "Customer profile does not allow phone contact.",
      evidenceStrength: "strong",
      emailDraft: buildEmailDraft(context)
    };
  }

  if (Number.isFinite(phonePickupRate) && Number.isFinite(emailReplyRate)) {
    if (phonePickupRate > emailReplyRate + 0.1) {
      return {
        recommendedChannel: "phone",
        reason: "Historical contact pattern shows stronger phone pickup than email reply.",
        evidenceStrength: "strong"
      };
    }

    return {
      recommendedChannel: "email",
      reason: "Historical contact pattern shows email is at least as responsive as phone.",
      evidenceStrength: "strong",
      emailDraft: buildEmailDraft(context)
    };
  }

  if (preferredChannels.includes("email") && !preferredChannels.includes("phone")) {
    return {
      recommendedChannel: "email",
      reason: "Customer profile prefers email and lacks phone-response evidence.",
      evidenceStrength: "limited",
      emailDraft: buildEmailDraft(context)
    };
  }

  return {
    recommendedChannel: "phone",
    reason: "Phone is allowed, but response-pattern evidence is incomplete; human approval is required.",
    evidenceStrength: "missing"
  };
}

function buildPayload(config: ElevenLabsConfig, context: OutreachContext) {
  return {
    agent_id: config.agentId,
    agent_phone_number_id: config.agentPhoneNumberId,
    to_number: context.toNumber,
    conversation_initiation_client_data: {
      type: "conversation_initiation_client_data",
      dynamic_variables: {
        customer_name: context.customerName,
        customer_id: context.customerId,
        invoice_number: context.invoiceNumber,
        invoice_id: context.invoiceId,
        amount_gbp: String(context.amountGbp),
        call_purpose: context.purpose,
        runwayops_demo_call: "true"
      },
      conversation_config_override: {
        agent: {
          first_message: buildFirstMessage(context),
          language: "en"
        }
      }
    },
    call_recording_enabled: false
  };
}

async function fetchElevenLabsConversation(conversationId: string): Promise<Document> {
  const config = getElevenLabsConfig();
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
    headers: {
      "xi-api-key": config.apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs conversation lookup failed: HTTP ${response.status}`);
  }

  return (await response.json()) as Document;
}

async function submitToElevenLabs(
  config: ElevenLabsConfig,
  context: OutreachContext
): Promise<{ conversationId?: string; callSid?: string }> {
  const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": config.apiKey
    },
    body: JSON.stringify(buildPayload(config, context))
  });

  const responseText = await response.text();
  let body: ElevenLabsResponse = {};

  try {
    body = JSON.parse(responseText) as ElevenLabsResponse;
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new Error(`ElevenLabs outbound call failed: HTTP ${response.status}`);
  }

  return {
    conversationId: body.conversation_id ?? body.conversationId,
    callSid: body.callSid ?? body.call_sid ?? body.twilio_call_sid
  };
}

function baseEvent(context: OutreachContext, eventType: string, recommendation: OutreachRecommendation): StringIdDocument {
  const now = new Date().toISOString();

  return {
    _id: `${context.requestId}_${eventType.replace(/\W/g, "_")}`,
    event_key: `${eventType}:${context.requestId}`,
    event_type: eventType,
    company_id: context.companyId,
    case_id: context.caseId,
    source: "api.voice.outbound-call",
    occurred_at: now,
    payload: {
      masked_to_number: context.maskedToNumber,
      customer_id: context.customerId,
      customer_name: context.customerName,
      customer_email: context.customerEmail,
      invoice_id: context.invoiceId,
      invoice_number: context.invoiceNumber,
      amount_gbp: context.amountGbp,
      purpose: context.purpose,
      purpose_source: context.purposeSource,
      collection_draft_id: context.collectionDraftId,
      approval_task_id: context.approvalTaskId,
      approved_by: context.approvedBy,
      recommended_channel: recommendation.recommendedChannel,
      recommendation_reason: recommendation.reason,
      evidence_strength: recommendation.evidenceStrength,
      human_approval_required: true
    }
  };
}

async function writeTrace(
  db: Db,
  context: OutreachContext,
  recommendation: OutreachRecommendation,
  result: { conversationId?: string; callSid?: string }
) {
  const now = new Date().toISOString();
  const events: StringIdDocument[] = [baseEvent(context, "voice_call.recommended", recommendation)];

  if (context.send) {
    events.push(baseEvent(context, "voice_call.approved", recommendation));
    events.push({
      ...baseEvent(context, "voice_call.submitted", recommendation),
      payload: {
        ...baseEvent(context, "voice_call.submitted", recommendation).payload,
        conversation_id: result.conversationId,
        call_sid: result.callSid
      }
    });
  }

  await documents(db, "events").insertMany(events, { ordered: true });
  await documents(db, "agent_runs").insertOne({
    _id: `${context.requestId}_voice_outreach_agent`,
    agent_id: "voice_outreach_agent",
    agent_name: "Voice Outreach Agent",
    company_id: context.companyId,
    case_id: context.caseId,
    status: context.send ? "completed" : "dry_run",
    started_at: now,
    completed_at: now,
    input: {
      masked_to_number: context.maskedToNumber,
      customer_id: context.customerId,
      customer_name: context.customerName,
      invoice_number: context.invoiceNumber,
      amount_gbp: context.amountGbp,
      purpose_source: context.purposeSource
    },
    output: {
      dry_run: !context.send,
      recommended_channel: recommendation.recommendedChannel,
      recommendation_reason: recommendation.reason,
      conversation_id: result.conversationId,
      call_sid: result.callSid
    }
  });
  await documents(db, "decision_log").insertOne({
    _id: `${context.requestId}_human_approved_voice_action`,
    company_id: context.companyId,
    case_id: context.caseId,
    decision_type: "human-approved outbound voice action",
    summary: context.send
      ? `Human-approved outbound voice action submitted for ${context.customerName} ${context.invoiceNumber}.`
      : `Outbound voice action recommended for ${context.customerName} ${context.invoiceNumber}; no call placed.`,
    created_at: now,
    human_approval_required: true,
    approved: context.send,
    approved_by: context.approvedBy,
    masked_to_number: context.maskedToNumber,
    recommended_channel: recommendation.recommendedChannel,
    recommendation_reason: recommendation.reason
  });
  await documents(db, "artifacts").insertOne({
    _id: `${context.requestId}_voice_call_metadata`,
    company_id: context.companyId,
    case_id: context.caseId,
    artifact_type: "voice_call_metadata",
    created_at: now,
    dry_run: !context.send,
    masked_to_number: context.maskedToNumber,
    conversation_id: result.conversationId,
    call_sid: result.callSid,
    provider: "elevenlabs",
    collection_draft_id: context.collectionDraftId,
    approval_task_id: context.approvalTaskId
  });

  if (context.send && context.approvalTaskId) {
    await documents(db, "tasks").updateOne(
      { _id: context.approvalTaskId },
      {
        $set: {
          status: "approved_executed",
          approved_by: context.approvedBy,
          executed_at: now,
          execution_artifact_id: `${context.requestId}_voice_call_metadata`
        }
      }
    );
  }
}

export function outboundCallErrorStatus(error: unknown): number {
  return error instanceof RequestValidationError ? error.status : 500;
}

export function outboundCallErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function submitApprovedOutboundCall(body: OutboundCallRequest): Promise<OutboundCallResult> {
  const db = await getMongoDb();
  const config = getElevenLabsConfig();
  const context = await buildContext(db, body);
  const recommendation = await recommendChannel(db, context);

  if (context.send && !context.approvedBy && !context.approvalTaskId) {
    throw new RequestValidationError("Approved sends require approvedBy or approvalTaskId");
  }

  const callResult = context.send ? await submitToElevenLabs(config, context) : {};

  await writeTrace(db, context, recommendation, callResult);

  return {
    ok: true,
    dryRun: !context.send,
    maskedToNumber: context.maskedToNumber,
    conversationId: callResult.conversationId,
    callSid: callResult.callSid,
    recommendedChannel: recommendation.recommendedChannel,
    recommendationReason: recommendation.reason,
    purposeSource: context.purposeSource
  };
}

function dataObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function nestedObject(value: unknown, key: string): Record<string, unknown> {
  return dataObject(dataObject(value)[key]);
}

function nestedString(value: unknown, ...path: string[]): string | undefined {
  let current: unknown = value;

  for (const key of path) {
    current = dataObject(current)[key];
  }

  return optionalString(current);
}

function nestedNumber(value: unknown, ...path: string[]): number | undefined {
  let current: unknown = value;

  for (const key of path) {
    current = dataObject(current)[key];
  }

  return typeof current === "number" && Number.isFinite(current) ? current : undefined;
}

function transcriptSummaryFromConversation(conversation: Document): string | undefined {
  return nestedString(conversation, "analysis", "transcript_summary");
}

function outcomeFromConversation(conversation: Document): ResolvedVoiceCallOutcome {
  const metadata = dataObject(conversation.metadata);
  const acceptedAt = nestedNumber(conversation, "metadata", "accepted_time_unix_secs");
  const durationSecs = nestedNumber(conversation, "metadata", "call_duration_secs") ?? 0;
  const analysis = dataObject(conversation.analysis);
  const transcript = Array.isArray(conversation.transcript) ? conversation.transcript : [];
  const callAnswered = Boolean(acceptedAt) || durationSecs > 0 || transcript.length > 0;
  const failureReason =
    nestedString(conversation, "metadata", "termination_reason") ||
    nestedString(conversation, "metadata", "error", "message");
  const callSid = nestedString(conversation, "metadata", "phone_call", "call_sid");
  const conversationId = asString(conversation.conversation_id, "conversationId");
  const dynamicVariables = nestedObject(conversation, "conversation_initiation_client_data");
  const variables = dataObject(dynamicVariables.dynamic_variables);

  return {
    conversationId,
    callSid,
    customerId: optionalString(variables.customer_id),
    customerName: optionalString(variables.customer_name),
    invoiceId: optionalString(variables.invoice_id),
    invoiceNumber: optionalString(variables.invoice_number),
    amountGbp: typeof variables.amount_gbp === "string" ? Number(variables.amount_gbp) : undefined,
    callAnswered,
    outcomeStatus:
      optionalString(analysis.call_successful) ??
      (callAnswered ? "completed" : failureReason || "no_answer"),
    transcriptSummary: transcriptSummaryFromConversation(conversation),
    summary: transcriptSummaryFromConversation(conversation) ?? (callAnswered ? "Call completed." : "Call was not answered."),
    paymentTiming: nestedString(analysis, "data_collection_results", "payment_timing", "value"),
    blockers: nestedString(analysis, "data_collection_results", "blockers", "value")
  };
}

function outcomeFromWebhook(body: VoiceCallOutcomeRequest): ResolvedVoiceCallOutcome | null {
  const data = dataObject(body.data);

  if (body.type === "call_initiation_failure") {
    return {
      conversationId: asString(data.conversation_id, "conversationId"),
      callSid: nestedString(data, "metadata", "body", "CallSid"),
      callAnswered: false,
      outcomeStatus: optionalString(data.failure_reason) ?? "call_initiation_failure",
      summary: `Call initiation failed: ${optionalString(data.failure_reason) ?? "unknown"}.`
    };
  }

  if (body.type === "post_call_transcription") {
    return outcomeFromConversation(data as Document);
  }

  return null;
}

async function resolveOutcomeInput(body: VoiceCallOutcomeRequest): Promise<ResolvedVoiceCallOutcome> {
  const webhookOutcome = outcomeFromWebhook(body);

  if (webhookOutcome) {
    return webhookOutcome;
  }

  const conversationId = asString(body.conversationId, "conversationId");
  const providerConversation = await fetchElevenLabsConversation(conversationId);
  const providerOutcome = outcomeFromConversation(providerConversation);

  return {
    ...providerOutcome,
    callSid: optionalString(body.callSid) ?? providerOutcome.callSid,
    customerId: optionalString(body.customerId) ?? providerOutcome.customerId,
    customerName: optionalString(body.customerName) ?? providerOutcome.customerName,
    invoiceId: optionalString(body.invoiceId) ?? providerOutcome.invoiceId,
    invoiceNumber: optionalString(body.invoiceNumber) ?? providerOutcome.invoiceNumber,
    amountGbp: body.amountGbp ? asAmountGbp(body.amountGbp) : providerOutcome.amountGbp,
    callAnswered:
      typeof body.callAnswered === "boolean" ? body.callAnswered : providerOutcome.callAnswered,
    outcomeStatus: optionalString(body.outcomeStatus) ?? providerOutcome.outcomeStatus,
    paymentTiming: optionalString(body.paymentTiming) ?? providerOutcome.paymentTiming,
    blockers: optionalString(body.blockers) ?? providerOutcome.blockers,
    summary: optionalString(body.summary) ?? providerOutcome.summary,
    transcriptSummary: optionalString(body.transcriptSummary) ?? providerOutcome.transcriptSummary
  };
}

export async function recordVoiceCallOutcome(body: VoiceCallOutcomeRequest): Promise<VoiceCallOutcomeResult> {
  const db = await getMongoDb();
  const outcome = await resolveOutcomeInput(body);
  const artifact = await documents(db, "artifacts").findOne({ conversation_id: outcome.conversationId });
  const now = new Date().toISOString();
  const requestId = `voice_outcome_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const companyId = optionalString(artifact?.company_id) ?? DEFAULT_COMPANY_ID;
  const caseId = optionalString(artifact?.case_id) ?? DEFAULT_CASE_ID;
  const customerId = optionalString(outcome.customerId) ?? optionalString(artifact?.customer_id);
  const invoiceId = optionalString(outcome.invoiceId) ?? optionalString(artifact?.invoice_id);
  const invoiceNumber = optionalString(outcome.invoiceNumber) ?? optionalString(artifact?.invoice_number);
  const callAnswered = outcome.callAnswered === true;
  const outcomeStatus = optionalString(outcome.outcomeStatus) ?? (callAnswered ? "completed" : "no_answer");
  const eventType = callAnswered ? "voice_call.completed" : "voice_call.no_answer";

  await documents(db, "events").insertOne({
    _id: `${requestId}_${eventType.replace(/\W/g, "_")}`,
    event_key: `${eventType}:${outcome.conversationId}:${requestId}`,
    event_type: eventType,
    company_id: companyId,
    case_id: caseId,
    source: "api.voice.call-outcome",
    occurred_at: now,
    payload: {
      masked_to_number: optionalString(artifact?.masked_to_number),
      customer_id: customerId,
      customer_name: optionalString(outcome.customerName),
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      conversation_id: outcome.conversationId,
      call_sid: optionalString(outcome.callSid),
      outcome_status: outcomeStatus,
      call_answered: callAnswered,
      payment_timing: optionalString(outcome.paymentTiming),
      blockers: optionalString(outcome.blockers),
      summary: optionalString(outcome.summary),
      transcript_summary: optionalString(outcome.transcriptSummary)
    }
  });

  await documents(db, "decision_log").insertOne({
    _id: `${requestId}_voice_call_outcome`,
    company_id: companyId,
    case_id: caseId,
    decision_type: "voice_call_outcome_captured",
    summary: optionalString(outcome.summary) ?? `Voice call outcome captured: ${outcomeStatus}.`,
    created_at: now,
    conversation_id: outcome.conversationId,
    call_sid: optionalString(outcome.callSid),
    outcome_status: outcomeStatus,
    payment_timing: optionalString(outcome.paymentTiming),
    blockers: optionalString(outcome.blockers)
  });

  await documents(db, "artifacts").updateOne(
    { conversation_id: outcome.conversationId },
    {
      $set: {
        outcome_status: outcomeStatus,
        call_answered: callAnswered,
        outcome_captured_at: now,
        payment_timing: optionalString(outcome.paymentTiming),
        blockers: optionalString(outcome.blockers),
        outcome_summary: optionalString(outcome.summary)
      }
    }
  );

  if (customerId) {
    await documents(db, "customers").updateOne(
      { _id: customerId },
      {
        $set: {
          "last_voice_outreach.conversation_id": outcome.conversationId,
          "last_voice_outreach.call_sid": optionalString(outcome.callSid),
          "last_voice_outreach.outcome_status": outcomeStatus,
          "last_voice_outreach.call_answered": callAnswered,
          "last_voice_outreach.payment_timing": optionalString(outcome.paymentTiming),
          "last_voice_outreach.blockers": optionalString(outcome.blockers),
          "last_voice_outreach.summary": optionalString(outcome.summary),
          "last_voice_outreach.updated_at": now,
          "contact_response_profile.last_voice_outcome": outcomeStatus,
          "contact_response_profile.last_voice_outcome_at": now
        }
      }
    );
  }

  if (customerId && callAnswered && (outcome.paymentTiming || outcome.blockers || outcome.summary)) {
    await documents(db, "memory_cards").insertOne({
      _id: `${requestId}_voice_memory`,
      company_id: companyId,
      customer_id: customerId,
      case_id: caseId,
      memory_type: "voice_call_outcome",
      summary: optionalString(outcome.summary) ?? "Voice call completed.",
      payment_timing: optionalString(outcome.paymentTiming),
      blockers: optionalString(outcome.blockers),
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      created_at: now
    });
  }

  return {
    ok: true,
    conversationId: outcome.conversationId,
    callSid: optionalString(outcome.callSid),
    outcomeStatus,
    callAnswered
  };
}
