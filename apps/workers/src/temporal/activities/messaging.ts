import type {
  ClassifyReplyInput,
  CustomerMessageSummary,
  DraftCustomerActionsInput,
  DraftFollowUpInput,
  DraftFollowUpOutput,
  DraftMessagesInput,
  DraftSupplierActionsInput,
  ExtractPromiseInput,
  LoadCustomerMessageInput,
  MessageDraftSummary,
  PromiseExtractionSummary,
  ReplyClassificationSummary
} from "./types.js";

export async function loadCustomerMessage(
  input: LoadCustomerMessageInput
): Promise<CustomerMessageSummary> {
  return {
    messageEventId: input.messageEventId,
    customerId: `customer:${input.companyId}:demo`,
    threadId: `thread:${input.messageEventId}`,
    bodyText:
      "Hi — we should be able to pay Friday once the PO is re-approved on our side. Will confirm.",
    receivedAtIso: "2026-05-04T10:15:00.000Z"
  };
}

/**
 * Stub for `ai.classifyReply`. Real implementation will instantiate a
 * `ModelRouter` and call `classifyReply(ReplyClassificationInput)`.
 */
export async function classifyReply(
  _input: ClassifyReplyInput
): Promise<ReplyClassificationSummary> {
  return {
    classification: "conditional_promise",
    confidence: 0.74,
    hasPromiseHint: true
  };
}

export async function extractPromise(
  _input: ExtractPromiseInput
): Promise<PromiseExtractionSummary> {
  return {
    hasPromise: true,
    promiseType: "conditional",
    promisedDateIso: "2026-05-08",
    conditionText: "PO re-approval",
    cashConfidence: 0.42
  };
}

export async function draftMessages(input: DraftMessagesInput): Promise<MessageDraftSummary[]> {
  return input.actionIds.map((actionId) => ({
    draftId: `${input.idempotencyKey}:draft:${actionId}`,
    actionId,
    channel: "email",
    tone: "neutral"
  }));
}

export async function draftMessage(input: DraftMessagesInput): Promise<MessageDraftSummary> {
  const drafts = await draftMessages(input);
  const first = drafts[0];
  if (!first) {
    throw new Error("draftMessage: no actions provided");
  }
  return first;
}

export async function draftFollowUpIfNeeded(
  input: DraftFollowUpInput
): Promise<DraftFollowUpOutput> {
  if (input.classification === "already_paid" || input.classification === "dispute") {
    return { kind: "skipped", reason: input.classification };
  }
  return {
    kind: "drafted",
    draft: {
      draftId: `${input.idempotencyKey}:followup`,
      actionId: `${input.idempotencyKey}:action`,
      channel: "email",
      tone: "neutral"
    }
  };
}

export async function draftCustomerActions(
  input: DraftCustomerActionsInput
): Promise<MessageDraftSummary[]> {
  return input.invoiceIds.map((invoiceId, i) => ({
    draftId: `${input.idempotencyKey}:customer-draft:${i + 1}`,
    actionId: `${input.idempotencyKey}:customer-action:${invoiceId}`,
    channel: "email",
    tone: "firm"
  }));
}

export async function draftSupplierActions(
  input: DraftSupplierActionsInput
): Promise<MessageDraftSummary[]> {
  return input.supplierIds.map((supplierId, i) => ({
    draftId: `${input.idempotencyKey}:supplier-draft:${i + 1}`,
    actionId: `${input.idempotencyKey}:supplier-action:${supplierId}`,
    channel: "email",
    tone: "neutral"
  }));
}
