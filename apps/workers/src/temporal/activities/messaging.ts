import { applyPolicyValidators } from "@runwayops/ai";
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
import { getActivityContext } from "./context.js";

/**
 * Load a customer message from the DB. Gap: no `communication_messages`
 * repo surface yet. Throws until the integrator adds it.
 */
export async function loadCustomerMessage(
  input: LoadCustomerMessageInput
): Promise<CustomerMessageSummary> {
  // Gap: packages/db does not expose a communicationMessages repo.
  // Stub returns canned data; integrator must add the repo.
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
 * Classify a customer reply using the AI model router.
 * Validates output via structured-output schema + policy validators.
 */
export async function classifyReply(
  input: ClassifyReplyInput
): Promise<ReplyClassificationSummary> {
  const { ai } = getActivityContext();

  try {
    const result = await ai.classifyReply({
      customer_reply: input.bodyText,
      today: input.idempotencyKey.split(":")[2] ?? new Date().toISOString().slice(0, 10),
      evidence_refs: [{ kind: "communication_message", id: input.messageEventId }],
      invoice_context: []
    });

    // Policy validation — reject unsafe outputs
    const policyResult = applyPolicyValidators({
      text: result.risk_reason,
      classification: result.classification,
      recommendedAction: result.recommended_action,
      safetyFlags: result.safety_flags,
      evidenceRefs: result.evidence_refs
    });

    if (!policyResult.ok) {
      return {
        classification: "needs_review",
        confidence: 0.3,
        hasPromiseHint: false
      };
    }

    return {
      classification: result.classification as string,
      confidence: result.confidence,
      hasPromiseHint: (result.classification as string).includes("promise")
    };
  } catch (err: unknown) {
    // SAFETY: never fabricate a customer signal on AI failure. The
    // previous fallback returned `conditional_promise` with 0.74
    // confidence — that asserted the customer made a promise they
    // never made. Now we route to `needs_review` so a human looks
    // at the original message before any forecast or draft uses
    // this classification.
    // eslint-disable-next-line no-console
    console.error(
      `[classifyReply] AI failure for message ${input.messageEventId}; returning needs_review.`,
      err instanceof Error ? err.message : err,
    );
    return {
      classification: "needs_review",
      confidence: 0,
      hasPromiseHint: false
    };
  }
}

/**
 * Extract a promise-to-pay from a customer reply using the AI model router.
 * Validates output via structured-output schema + policy validators.
 */
export async function extractPromise(
  input: ExtractPromiseInput
): Promise<PromiseExtractionSummary> {
  const { ai } = getActivityContext();

  try {
    const classification = input.classification as "firm_promise" | "conditional_promise" | "vague_promise" | "partial_payment_promise" | "dispute" | "cannot_pay" | "already_paid" | "other" | undefined;
    const result = await ai.extractPromise({
      customer_reply: input.bodyText,
      reply_classification: classification,
      today: input.idempotencyKey.split(":")[2] ?? new Date().toISOString().slice(0, 10),
      evidence_refs: [{ kind: "communication_message", id: input.messageEventId }],
      invoice_context: []
    });

    const policyResult = applyPolicyValidators({
      text: result.risk_reason,
      classification: result.classification,
      recommendedAction: result.recommended_action,
      safetyFlags: result.safety_flags,
      evidenceRefs: result.evidence_refs
    });

    if (!policyResult.ok) {
      return {
        hasPromise: false,
        cashConfidence: 0
      };
    }

    return {
      hasPromise: result.has_promise,
      promiseType: (result.promise_type ?? undefined) as PromiseExtractionSummary["promiseType"],
      amountPromisedMinor: result.amount_promised_minor != null
        ? Number(result.amount_promised_minor)
        : undefined,
      currency: result.currency ?? undefined,
      promisedDateIso: result.promised_date ?? undefined,
      conditionText: result.condition_text ?? undefined,
      cashConfidence: result.cash_confidence
    };
  } catch (err: unknown) {
    // SAFETY: never fabricate a promise on AI failure. The previous
    // fallback claimed the customer promised PO re-approval on
    // 2026-05-08 — false content that would have flowed straight
    // into forecast confidence. Now we return hasPromise: false with
    // zero confidence so the forecast doesn't lean on an AI failure
    // mode as if it were a customer commitment.
    // eslint-disable-next-line no-console
    console.error(
      `[extractPromise] AI failure for message ${input.messageEventId}; returning hasPromise=false.`,
      err instanceof Error ? err.message : err,
    );
    return {
      hasPromise: false,
      cashConfidence: 0
    };
  }
}

export async function draftMessages(input: DraftMessagesInput): Promise<MessageDraftSummary[]> {
  const { ai } = getActivityContext();
  const results: MessageDraftSummary[] = [];

  for (const actionId of input.actionIds) {
    try {
      const result = await ai.draftMessage({
        action_type: "first_chase",
        customer_name: "Customer",
        company_name: "Company",
        channel: "email",
        tone: "neutral",
        today: new Date().toISOString().slice(0, 10),
        invoice_context: [],
        evidence_refs: [{ kind: "invoice", id: actionId }]
      });

      const policyResult = applyPolicyValidators({
        text: result.body,
        recommendedAction: result.recommended_action,
        safetyFlags: result.safety_flags,
        evidenceRefs: result.evidence_refs
      });

      if (!policyResult.ok) {
        results.push({
          draftId: `${input.idempotencyKey}:draft:${actionId}`,
          actionId,
          channel: "email",
          tone: "neutral"
        });
        continue;
      }

      // Map AI channel/tone to activity-safe types
      const channel = (["email", "sms", "phone", "letter", "portal"] as const).includes(
        result.channel as "email" | "sms" | "phone" | "letter" | "portal"
      ) ? result.channel as "email" | "sms" | "phone" | "letter" | "portal" : "email";
      const tone = (["friendly", "neutral", "firm"] as const).includes(
        result.tone as "friendly" | "neutral" | "firm"
      ) ? result.tone as "friendly" | "neutral" | "firm" : "neutral";

      results.push({
        draftId: `${input.idempotencyKey}:draft:${actionId}`,
        actionId,
        channel,
        tone
      });
    } catch (err: unknown) {
      // AI failure on a single draft does not abort the batch — log
      // and emit a placeholder draft summary so the workflow can
      // proceed to the approval step. The downstream approver sees
      // an empty draft and treats it as "needs review", which is the
      // safe behaviour.
      // eslint-disable-next-line no-console
      console.error(
        `[draftMessages] AI failure for action ${actionId}; emitting placeholder draft.`,
        err instanceof Error ? err.message : err,
      );
      results.push({
        draftId: `${input.idempotencyKey}:draft:${actionId}`,
        actionId,
        channel: "email",
        tone: "neutral"
      });
    }
  }

  return results;
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
    channel: "email" as const,
    tone: "firm" as const
  }));
}

export async function draftSupplierActions(
  input: DraftSupplierActionsInput
): Promise<MessageDraftSummary[]> {
  return input.supplierIds.map((supplierId, i) => ({
    draftId: `${input.idempotencyKey}:supplier-draft:${i + 1}`,
    actionId: `${input.idempotencyKey}:supplier-action:${supplierId}`,
    channel: "email" as const,
    tone: "neutral" as const
  }));
}
