import { condition, setHandler, workflowInfo } from "@temporalio/workflow";

import type {
  PromiseExtractionSummary,
  ReplyClassificationSummary
} from "../activities/types.js";
import { humanOverrideSignal } from "../signals.js";
import type { HumanOverridePayload } from "../signal-types.js";
import { getReplyStateQuery } from "../queries.js";
import type { ReplyState, WorkflowPhase } from "../query-types.js";

import { acts, failFastActs } from "./activity-proxies.js";

export interface CustomerReplyInput {
  companyId: string;
  messageEventId: string;
  /** ISO timestamp from the inbound event. */
  receivedAtIso: string;
}

export interface CustomerReplyResult {
  cycleKey: string;
  classification: string;
  hasPromise: boolean;
  promiseId?: string | undefined;
  followUpDraftId?: string | undefined;
  humanOverride?: HumanOverridePayload | undefined;
}

export async function CustomerReplyWorkflow(
  input: CustomerReplyInput
): Promise<CustomerReplyResult> {
  const cycleKey = `customer-reply:${input.messageEventId}`;
  let phase: WorkflowPhase = "initializing";
  let humanOverride: HumanOverridePayload | undefined;
  let classification: ReplyClassificationSummary | undefined;
  let extraction: PromiseExtractionSummary | undefined;
  let promiseId: string | undefined;
  let followUpDraftId: string | undefined;

  setHandler(getReplyStateQuery, (): ReplyState => ({
    cycleKey,
    messageEventId: input.messageEventId,
    phase,
    classification: classification?.classification,
    hasPromise: extraction?.hasPromise ?? false,
    promiseId,
    followUpDraftId
  }));

  setHandler(humanOverrideSignal, (payload: HumanOverridePayload) => {
    humanOverride = payload;
  });

  // 1. load message
  phase = "loading";
  const message = await acts.loadCustomerMessage({
    companyId: input.companyId,
    messageEventId: input.messageEventId
  });

  // 2. classify
  phase = "computing";
  classification = await acts.classifyReply({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:classify`,
    messageEventId: input.messageEventId,
    bodyText: message.bodyText
  });

  // 3. extract promise if classification suggests one
  if (classification.hasPromiseHint) {
    extraction = await acts.extractPromise({
      companyId: input.companyId,
      idempotencyKey: `${cycleKey}:extract`,
      messageEventId: input.messageEventId,
      bodyText: message.bodyText,
      classification: classification.classification
    });
  }

  // 4. retrieve memory
  await acts.retrieveCustomerMemory({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:memory`,
    customerId: message.customerId
  });

  // 5. evidence validation (FAIL_FAST)
  const validation = await failFastActs.validateEvidence({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:validate`,
    evidenceRefIds: [`evidence:${input.messageEventId}:thread`]
  });
  if (!validation.ok) {
    phase = "awaiting_human";
    await condition(() => humanOverride !== undefined);
    if (humanOverride && humanOverride.action === "discard") {
      phase = "completed";
      return {
        cycleKey,
        classification: classification.classification,
        hasPromise: false,
        humanOverride
      };
    }
  }

  // 6. upsert promise
  if (extraction?.hasPromise) {
    const promise = await acts.upsertPromiseToPay({
      companyId: input.companyId,
      idempotencyKey: `${cycleKey}:promise`,
      customerId: message.customerId,
      messageEventId: input.messageEventId,
      extraction
    });
    promiseId = promise.promiseId;
  }

  // 7. recompute forecast + rerank actions
  await acts.recomputeCashForecast({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:forecast`,
    asOfDate: input.receivedAtIso.slice(0, 10),
    horizonDays: 30,
    triggerEventIds: [input.messageEventId]
  });
  await acts.rerankCollectionActions({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:rerank`,
    forecastId: `forecast:${input.companyId}:${input.receivedAtIso.slice(0, 10)}`,
    maxActions: 5,
    asOfDate: input.receivedAtIso.slice(0, 10)
  });

  // 8. follow-up draft if needed
  phase = "drafting";
  const followUp = await acts.draftFollowUpIfNeeded({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:followup`,
    messageEventId: input.messageEventId,
    promiseId,
    classification: classification.classification
  });
  if (followUp.kind === "drafted") {
    followUpDraftId = followUp.draft.draftId;
    await acts.createApprovalRequest({
      companyId: input.companyId,
      idempotencyKey: `${cycleKey}:approval`,
      subjects: [
        {
          subjectKind: "message_draft",
          subjectId: followUp.draft.draftId,
          riskSummary: `Follow-up to ${classification.classification}`
        }
      ]
    });
  }

  // 9. human override window — bounded wait. The workflow continues
  // regardless of whether an override arrives.
  phase = "awaiting_human";
  const policy = await acts.loadCompanyPolicy({ companyId: input.companyId });
  await condition(() => humanOverride !== undefined, policy.humanOverrideWindowMs);

  // 10. audit
  await acts.writeAuditEvent({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:audit:complete`,
    action: "customer_reply.processed",
    targetKind: "customer_reply",
    targetId: input.messageEventId,
    summary: `Reply classified as ${classification.classification}`
  });

  phase = "completed";
  return {
    cycleKey,
    classification: classification.classification,
    hasPromise: extraction?.hasPromise ?? false,
    promiseId,
    followUpDraftId,
    humanOverride
  };
}
