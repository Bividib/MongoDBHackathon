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

function buildAgentPrompt(context: OutreachContext): string {
  return [
    "You are calling on behalf of RunwayOps for a controlled demo/test call.",
    "If asked, say this is a controlled RunwayOps demo/test call.",
    "",
    "Purpose of the call:",
    context.purpose,
    "",
    "Important boundaries:",
    "- Do not claim to be a lawyer, debt collector, accountant, bank, or regulated financial adviser.",
    "- Do not threaten penalties, legal action, credit consequences, or service suspension.",
    "- Ask only for payment timing confirmation and whether any blocker exists.",
    "- Do not take card details, bank details, or payments.",
    "- If the person says this is inconvenient, apologise and end the call politely.",
    "",
    "Context:",
    `- Customer/contact: ${context.customerName}`,
    `- Invoice: ${context.invoiceNumber}`,
    `- Amount: GBP ${context.amountGbp}`
  ].join("\n");
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
          prompt: {
            prompt: buildAgentPrompt(context)
          },
          first_message: buildFirstMessage(context),
          language: "en"
        }
      }
    },
    call_recording_enabled: false
  };
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
