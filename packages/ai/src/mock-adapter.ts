import type { ModelRouter } from "./model-router.js";
import {
  ActionRecommendationInputSchema,
  ActionRecommendationSchema,
  AuditExplanationSchema,
  AuditInputSchema,
  DraftMessageInputSchema,
  EvidenceSummaryInputSchema,
  EvidenceSummarySchema,
  MessageDraftSchema,
  PromiseExtractionInputSchema,
  PromiseExtractionSchema,
  ReplyClassificationInputSchema,
  ReplyClassificationSchema,
  type ActionRecommendation,
  type ActionRecommendationInput,
  type AuditExplanation,
  type AuditInput,
  type DraftMessageInput,
  type EvidenceRef,
  type EvidenceSummary,
  type EvidenceSummaryInput,
  type MessageDraft,
  type PromiseExtraction,
  type PromiseExtractionInput,
  type PromiseType,
  type RecommendedAction,
  type ReplyClassification,
  type ReplyClassificationInput,
  type ReplyClassificationName,
  type SafetyFlag,
} from "./schemas/index.js";
import {
  containsForbiddenOutboundAction,
  detectPromptInjectionSignals,
  mergeSafetyFlags,
  validateEvidenceRefs,
} from "./validators/index.js";

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export class MockModelRouter implements ModelRouter {
  async classifyReply(rawInput: ReplyClassificationInput): Promise<ReplyClassification> {
    const input = ReplyClassificationInputSchema.parse(rawInput);
    const text = input.customer_reply;
    const safetyFlags = detectPromptInjectionSignals(text);
    const classification = classifyText(text);
    const amount = extractAmount(text);
    const promisedDate = extractPromisedDate(text, input.today);
    const evidenceRefs = selectEvidenceRefs(input.evidence_refs, "communication_message");
    const recommendedAction = recommendedActionForClassification(classification, safetyFlags);

    const output = ReplyClassificationSchema.parse({
      classification,
      confidence: confidenceForClassification(classification, safetyFlags),
      evidence_refs: evidenceRefs,
      recommended_action: recommendedAction,
      requires_approval: true,
      risk_reason: riskReasonForClassification(classification, safetyFlags),
      uncertainty_reason: uncertaintyForClassification(classification, promisedDate),
      safety_flags: safetyFlags,
      promised_date: promisedDate,
      amount_minor: amount?.amount_minor ?? null,
      currency: amount?.currency ?? null,
      condition_text: classification === "conditional_promise" ? extractConditionText(text) : null,
      dispute_reason: classification === "dispute" ? text.trim().slice(0, 240) : null,
    });

    validateEvidenceRefs(output.evidence_refs, input.evidence_refs);
    return output;
  }

  async extractPromise(rawInput: PromiseExtractionInput): Promise<PromiseExtraction> {
    const input = PromiseExtractionInputSchema.parse(rawInput);
    const classification = input.reply_classification ?? classifyText(input.customer_reply);
    const safetyFlags = detectPromptInjectionSignals(input.customer_reply);
    const amount = extractAmount(input.customer_reply);
    const promisedDate = extractPromisedDate(input.customer_reply, input.today);
    const promiseType = promiseTypeForClassification(classification);
    const hasPromise = promiseType !== null;
    const evidenceRefs = selectEvidenceRefs(input.evidence_refs, "communication_message");

    const output = PromiseExtractionSchema.parse({
      classification: hasPromise ? "promise_extracted" : safetyFlags.length > 0 ? "needs_review" : "no_promise",
      has_promise: hasPromise,
      promise_type: promiseType,
      amount_promised_minor: amount?.amount_minor ?? null,
      currency: amount?.currency ?? input.invoice_context[0]?.currency ?? null,
      promised_date: promisedDate,
      condition_text: promiseType === "conditional" ? extractConditionText(input.customer_reply) : null,
      payer_contact: null,
      source_message_id: evidenceRefs[0]?.id ?? null,
      cash_confidence: cashConfidenceForPromise(promiseType, Boolean(promisedDate), safetyFlags),
      confidence: confidenceForClassification(classification, safetyFlags),
      evidence_refs: evidenceRefs,
      recommended_action: hasPromise ? "record_promise" : safetyFlags.length > 0 ? "escalate_for_review" : "no_action",
      requires_approval: true,
      risk_reason: hasPromise
        ? "Promise details should be stored only after schema and policy validation."
        : "No reliable promise-to-pay was found in the customer reply.",
      uncertainty_reason: promisedDate ? "Promise date was identified from reply text." : "No explicit promised date was found.",
      safety_flags: safetyFlags,
    });

    validateEvidenceRefs(output.evidence_refs, input.evidence_refs);
    return output;
  }

  async summarizeEvidence(rawInput: EvidenceSummaryInput): Promise<EvidenceSummary> {
    const input = EvidenceSummaryInputSchema.parse(rawInput);
    return EvidenceSummarySchema.parse({
      classification: "evidence_summary",
      summary: input.evidence_refs.map((ref) => ref.summary ?? ref.id).join("; "),
      missing_evidence: [],
      confidence: 0.7,
      evidence_refs: input.evidence_refs,
      recommended_action: "no_action",
      requires_approval: false,
      risk_reason: "Evidence summary is informational and does not mutate operational state.",
      uncertainty_reason: "Mock summary uses provided evidence summaries only.",
      safety_flags: [],
    });
  }

  async draftMessage(rawInput: DraftMessageInput): Promise<MessageDraft> {
    const input = DraftMessageInputSchema.parse(rawInput);
    const safetyFlags = detectPromptInjectionSignals(input.latest_untrusted_reply ?? "");
    const invoiceLine = formatInvoiceLine(input);
    const evidenceRefs = input.evidence_refs;
    const draftKind = draftClassificationForAction(input.action_type);
    const body = buildDraftBody(input, invoiceLine, safetyFlags);

    if (containsForbiddenOutboundAction(body)) {
      throw new Error("Draft contains a forbidden outbound action.");
    }

    const output = MessageDraftSchema.parse({
      classification: draftKind,
      channel: input.channel,
      tone: input.tone,
      subject: subjectForAction(input),
      body,
      call_to_action: callToActionForAction(input.action_type),
      approval_notes: safetyFlags.length > 0
        ? "Untrusted reply contained unsafe instructions. Review before any external draft is created."
        : "Review and edit before approval.",
      confidence: safetyFlags.length > 0 ? 0.45 : 0.76,
      evidence_refs: evidenceRefs,
      recommended_action: safetyFlags.length > 0 ? "escalate_for_review" : "draft_follow_up",
      requires_approval: true,
      risk_reason: "External customer communication always requires human approval.",
      uncertainty_reason: "Draft is based on available invoice context and should be checked by the user.",
      safety_flags: safetyFlags,
    });

    validateEvidenceRefs(output.evidence_refs, input.evidence_refs);
    return output;
  }

  async generateAuditExplanation(rawInput: AuditInput): Promise<AuditExplanation> {
    const input = AuditInputSchema.parse(rawInput);
    return AuditExplanationSchema.parse({
      classification: "audit_explanation",
      explanation: `${input.event_name}: ${input.decision}`,
      audit_summary: `${input.decision}. Policy checks: ${input.policy_checks.join(", ") || "none recorded"}.`,
      confidence: 0.72,
      evidence_refs: input.evidence_refs,
      recommended_action: "no_action",
      requires_approval: false,
      risk_reason: "Audit explanation is read-only.",
      uncertainty_reason: "Mock explanation summarizes provided inputs only.",
      safety_flags: [],
    });
  }

  async recommendAction(rawInput: ActionRecommendationInput): Promise<ActionRecommendation> {
    const input = ActionRecommendationInputSchema.parse(rawInput);
    const hasInvoiceContext = input.invoice_context.length > 0;
    return ActionRecommendationSchema.parse({
      classification: "action_recommendation",
      rationale: hasInvoiceContext
        ? "Invoice context is available, so a bounded follow-up can be recommended for approval."
        : "No invoice context was provided, so the action should be reviewed before use.",
      next_step: hasInvoiceContext ? "Draft a follow-up for approval." : "Collect invoice evidence before drafting.",
      confidence: hasInvoiceContext ? 0.68 : 0.35,
      evidence_refs: input.evidence_refs,
      recommended_action: hasInvoiceContext ? "draft_follow_up" : "escalate_for_review",
      requires_approval: true,
      risk_reason: "Recommendation must not execute external actions directly.",
      uncertainty_reason: hasInvoiceContext ? "Mock recommendation does not inspect payment history." : "Missing invoice context.",
      safety_flags: [],
    });
  }
}

function classifyText(text: string): ReplyClassificationName {
  const normalized = text.toLowerCase();

  if (/\balready paid\b|\bhas been paid\b|\bpaid (it|this|the invoice|yesterday|today)\b|\bpayment (has been )?(sent|made)\b/.test(normalized)) {
    return "already_paid";
  }

  if (/\b(dispute|disputed|incorrect|wrong|query|not approved|po is wrong|invoice is wrong)\b/.test(normalized)) {
    return "dispute";
  }

  if (/\b(can'?t|cannot|unable to|won't be able to|no cash|cash flow issue)\b.*\bpay\b/.test(normalized)) {
    return "cannot_pay";
  }

  if (/\b(partial|part payment|part-pay|installment|instalment|half|rest|balance)\b/.test(normalized)) {
    return "partial_payment_promise";
  }

  if (/\b(once|if|when|subject to|provided that|after)\b.*\b(pay|paid|payment|settle|transfer)\b|\b(pay|paid|payment|settle|transfer)\b.*\b(once|if|when|subject to|provided that|after)\b/.test(normalized)) {
    return "conditional_promise";
  }

  if (/\b(will|we'll|we will|promise to|scheduled|processing)\b.*\b(pay|paid|payment|settle|transfer)\b|\b(pay|settle|transfer)\b.*\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\b/.test(normalized)) {
    return "firm_promise";
  }

  if (/\b(soon|asap|shortly|next week|end of week|looking into it)\b/.test(normalized)) {
    return "vague_promise";
  }

  return "other";
}

function recommendedActionForClassification(
  classification: ReplyClassificationName,
  safetyFlags: SafetyFlag[],
): RecommendedAction {
  if (safetyFlags.length > 0) {
    return "escalate_for_review";
  }

  switch (classification) {
    case "firm_promise":
    case "conditional_promise":
    case "partial_payment_promise":
      return "record_promise";
    case "already_paid":
      return "verify_payment";
    case "dispute":
      return "mark_disputed_for_review";
    case "cannot_pay":
      return "request_partial_payment";
    case "vague_promise":
      return "request_confirmation";
    case "other":
      return "draft_follow_up";
  }
}

function promiseTypeForClassification(classification: ReplyClassificationName): PromiseType | null {
  switch (classification) {
    case "firm_promise":
      return "firm";
    case "conditional_promise":
      return "conditional";
    case "partial_payment_promise":
      return "partial";
    case "vague_promise":
      return "vague";
    case "already_paid":
      return "already_paid_claim";
    case "dispute":
      return "disputed";
    case "cannot_pay":
      return "cannot_pay";
    default:
      return null;
  }
}

function cashConfidenceForPromise(type: PromiseType | null, hasDate: boolean, safetyFlags: SafetyFlag[]): number {
  if (safetyFlags.length > 0) {
    return 0.2;
  }

  if (!type) {
    return 0;
  }

  const base = {
    firm: 0.82,
    conditional: 0.55,
    partial: 0.62,
    vague: 0.35,
    disputed: 0.15,
    cannot_pay: 0.05,
    already_paid_claim: 0.35,
  }[type];

  return hasDate ? base : Math.max(0, base - 0.15);
}

function confidenceForClassification(classification: ReplyClassificationName, safetyFlags: SafetyFlag[]): number {
  if (safetyFlags.length > 0) {
    return 0.4;
  }

  return classification === "other" ? 0.35 : classification === "vague_promise" ? 0.58 : 0.78;
}

function riskReasonForClassification(classification: ReplyClassificationName, safetyFlags: SafetyFlag[]): string {
  if (safetyFlags.length > 0) {
    return "The untrusted reply contains instructions that appear to target system behavior or unsafe actions.";
  }

  if (classification === "conditional_promise") {
    return "Conditional promises should reduce expected-cash confidence until the condition is resolved.";
  }

  if (classification === "already_paid") {
    return "Already-paid claims require bank or accounting verification before state changes.";
  }

  return "Classification is a model proposal and requires validation before operational use.";
}

function uncertaintyForClassification(classification: ReplyClassificationName, promisedDate: string | null): string {
  if (classification.includes("promise") && !promisedDate) {
    return "A payment signal was found, but no exact promised date was extracted.";
  }

  return "Mock classifier uses deterministic keyword heuristics and should be replaced by a provider adapter in production.";
}

function extractAmount(text: string): { amount_minor: number; currency: string } | null {
  const match = /(?<symbol>[£$€])\s?(?<amount>\d{1,3}(?:,\d{3})*|\d+)(?:\.(?<pence>\d{1,2}))?/.exec(text);
  if (!match?.groups) {
    return null;
  }

  const amountText = match.groups.amount;
  if (!amountText) {
    return null;
  }

  const currency = match.groups.symbol === "£" ? "GBP" : match.groups.symbol === "$" ? "USD" : "EUR";
  const units = Number.parseInt(amountText.replaceAll(",", ""), 10);
  const pence = Number.parseInt((match.groups.pence ?? "0").padEnd(2, "0"), 10);

  return { amount_minor: units * 100 + pence, currency };
}

function extractPromisedDate(text: string, todayIso: string): string | null {
  const isoDate = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text)?.[1];
  if (isoDate) {
    return isoDate;
  }

  const normalized = text.toLowerCase();
  const today = parseIsoDate(todayIso);

  if (/\btoday\b/.test(normalized)) {
    return formatIsoDate(today);
  }

  if (/\btomorrow\b/.test(normalized)) {
    return formatIsoDate(addDays(today, 1));
  }

  for (const [weekday, targetIndex] of Object.entries(WEEKDAY_INDEX)) {
    if (new RegExp(`\\b${weekday}\\b`).test(normalized)) {
      const currentIndex = today.getUTCDay();
      const delta = (targetIndex - currentIndex + 7) % 7 || 7;
      return formatIsoDate(addDays(today, delta));
    }
  }

  return null;
}

function extractConditionText(text: string): string | null {
  const match = /\b(once|if|when|subject to|provided that|after)\b(?<condition>.*?)(?:[.!?]|$)/i.exec(text);
  return match?.groups?.condition ? `${match[1]}${match.groups.condition}`.trim().slice(0, 240) : null;
}

function selectEvidenceRefs(refs: EvidenceRef[], preferredKind: EvidenceRef["kind"]): EvidenceRef[] {
  const preferred = refs.filter((ref) => ref.kind === preferredKind);
  return preferred.length > 0 ? [preferred[0] as EvidenceRef] : refs.slice(0, 1);
}

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function draftClassificationForAction(actionType: DraftMessageInput["action_type"]): MessageDraft["classification"] {
  switch (actionType) {
    case "promise_confirmation":
      return "confirmation_request_draft";
    case "partial_payment_request":
      return "partial_payment_request_draft";
    case "dispute_clarification":
      return "dispute_clarification_draft";
    case "already_paid_verification":
      return "payment_verification_draft";
    case "first_chase":
    case "follow_up":
      return "customer_chaser_draft";
  }
}

function subjectForAction(input: DraftMessageInput): string {
  const invoice = input.invoice_context[0]?.invoice_number;
  const suffix = invoice ? ` ${invoice}` : "";

  switch (input.action_type) {
    case "promise_confirmation":
      return `Confirming payment timing${suffix}`;
    case "partial_payment_request":
      return `Payment options${suffix}`;
    case "dispute_clarification":
      return `Clarification needed${suffix}`;
    case "already_paid_verification":
      return `Payment confirmation${suffix}`;
    case "first_chase":
    case "follow_up":
      return `Follow-up on invoice${suffix}`;
  }
}

function callToActionForAction(actionType: DraftMessageInput["action_type"]): string {
  switch (actionType) {
    case "promise_confirmation":
      return "Confirm the payment date and amount.";
    case "partial_payment_request":
      return "Confirm whether a partial payment is possible and when the balance can follow.";
    case "dispute_clarification":
      return "Share the specific disputed item so the team can resolve it.";
    case "already_paid_verification":
      return "Send remittance details so the payment can be matched.";
    case "first_chase":
    case "follow_up":
      return "Confirm when payment will be made.";
  }
}

function formatInvoiceLine(input: DraftMessageInput): string {
  if (input.invoice_context.length === 0) {
    return "the outstanding invoice";
  }

  return input.invoice_context
    .map((invoice) => invoice.invoice_number ? `invoice ${invoice.invoice_number}` : `invoice ${invoice.invoice_id}`)
    .join(", ");
}

function buildDraftBody(input: DraftMessageInput, invoiceLine: string, safetyFlags: SafetyFlag[]): string {
  const greeting = `Hi ${input.customer_name},`;
  const sender = input.company_name ? `\n\nThanks,\n${input.company_name}` : "\n\nThanks";

  if (safetyFlags.length > 0) {
    return [
      greeting,
      "",
      `I am following up on ${invoiceLine}. Could you confirm the current payment status and the best expected payment date?`,
      "",
      "If there is anything blocking payment, please let us know so we can route it to the right person for review.",
      sender,
    ].join("\n");
  }

  switch (input.action_type) {
    case "promise_confirmation":
      return [
        greeting,
        "",
        `Thanks for the update on ${invoiceLine}. Could you confirm the payment date and amount so we can keep our records accurate?`,
        sender,
      ].join("\n");
    case "partial_payment_request":
      return [
        greeting,
        "",
        `I am checking in on ${invoiceLine}. If full payment is not possible immediately, could you confirm whether a partial payment can be made now and when the remaining balance would follow?`,
        sender,
      ].join("\n");
    case "dispute_clarification":
      return [
        greeting,
        "",
        `Thanks for flagging a query on ${invoiceLine}. Could you share the specific line item or approval issue so we can resolve it quickly?`,
        sender,
      ].join("\n");
    case "already_paid_verification":
      return [
        greeting,
        "",
        `Thanks for letting us know. Could you send the remittance reference for ${invoiceLine} so we can match the payment?`,
        sender,
      ].join("\n");
    case "first_chase":
    case "follow_up":
      return [
        greeting,
        "",
        `I am following up on ${invoiceLine}. Could you confirm when payment will be made?`,
        sender,
      ].join("\n");
  }
}

export function combineSafetyFlagsForTest(...flagSets: Array<readonly SafetyFlag[] | undefined>): SafetyFlag[] {
  return mergeSafetyFlags(...flagSets);
}
