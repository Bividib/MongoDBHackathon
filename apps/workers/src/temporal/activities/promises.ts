import { repositories } from "@runwayops/db";

import { getActivityContext } from "./context.js";
import type {
  CheckPaymentMatchInput,
  ClassifyPromiseOutcomeInput,
  LoadPromiseInput,
  PaymentMatchSummary,
  PromiseDetailSummary,
  PromiseOutcomeSummary,
  PromiseSummary,
  UpdateCustomerReliabilityInput,
  UpsertPromiseInput
} from "./types.js";

const {
  withTenant,
  getPromiseById,
  insertPromise,
  appendAuditEvent,
  enqueueOutbox,
  reserveIdempotencyKey,
  completeIdempotencyKey
} = repositories;

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export async function loadPromise(input: LoadPromiseInput): Promise<PromiseDetailSummary> {
  const { db } = getActivityContext();

  return withTenant(db, input.companyId, async (tx) => {
    const promise = await getPromiseById(tx, {
      id: input.promiseId,
      companyId: input.companyId
    });
    if (!promise) {
      throw new Error(`Promise ${input.promiseId} not found`);
    }

    const summary: PromiseDetailSummary = {
      promiseId: promise.id,
      customerId: promise.customerId,
      promiseType: promise.promiseType,
      outcome: promise.outcome,
      graceUntilIso: promise.promisedDate
        ? new Date(promise.promisedDate.getTime() + TWO_DAYS_MS).toISOString()
        : new Date().toISOString()
    };
    if (promise.invoiceId !== undefined) summary.invoiceId = promise.invoiceId;
    if (promise.promisedDate !== undefined) {
      summary.promisedDateIso = promise.promisedDate.toISOString().slice(0, 10);
    }
    if (promise.amountPromised !== undefined) {
      summary.amountPromisedMinor = Number(promise.amountPromised.amountMinor);
      summary.currency = promise.amountPromised.currency;
    }
    return summary;
  });
}

export async function upsertPromiseToPay(input: UpsertPromiseInput): Promise<PromiseSummary> {
  const { db } = getActivityContext();

  return withTenant(db, input.companyId, async (tx) => {
    const reserve = await reserveIdempotencyKey(tx, {
      companyId: input.companyId,
      scope: "promise",
      key: input.idempotencyKey,
      requestHash: input.idempotencyKey
    });

    if (reserve.kind === "replay" && reserve.row.responseJson) {
      return reserve.row.responseJson as unknown as PromiseSummary;
    }

    const amountPromised =
      input.extraction.amountPromisedMinor !== undefined && input.extraction.currency
        ? {
            amountMinor: BigInt(input.extraction.amountPromisedMinor),
            currency: input.extraction.currency
          }
        : undefined;

    const insertInput: Parameters<typeof insertPromise>[1] = {
      companyId: input.companyId,
      customerId: input.customerId,
      sourceMessageId: input.messageEventId,
      promiseType: input.extraction.promiseType ?? "vague",
      extractedText: "Extracted from customer reply",
      confidenceAtCreation: input.extraction.cashConfidence,
      evidenceRefs: [{ kind: "communication_message", id: input.messageEventId }],
      outcome: "pending",
      createdBy: "ai"
    };
    if (input.invoiceId !== undefined) insertInput.invoiceId = input.invoiceId;
    if (amountPromised !== undefined) insertInput.amountPromised = amountPromised;
    if (input.extraction.promisedDateIso !== undefined) {
      insertInput.promisedDate = new Date(input.extraction.promisedDateIso);
    }
    if (input.extraction.conditionText !== undefined) {
      insertInput.conditionText = input.extraction.conditionText;
    }

    const promise = await insertPromise(tx, insertInput);

    const summary: PromiseSummary = {
      promiseId: promise.id,
      customerId: input.customerId,
      promiseType: input.extraction.promiseType ?? "vague",
      outcome: "pending"
    };
    if (input.invoiceId !== undefined) summary.invoiceId = input.invoiceId;
    if (input.extraction.promisedDateIso !== undefined) {
      summary.promisedDateIso = input.extraction.promisedDateIso;
    }

    await appendAuditEvent(tx, {
      companyId: input.companyId,
      actorType: "system",
      action: "promise.created",
      targetKind: "promise_to_pay",
      targetId: promise.id,
      occurredAt: new Date(),
      summary: `Promise created: ${summary.promiseType}`,
      evidenceRefs: [{ kind: "communication_message", id: input.messageEventId }]
    });

    await enqueueOutbox(tx, {
      companyId: input.companyId,
      eventType: "promise.created",
      aggregateType: "promise",
      aggregateId: promise.id,
      payload: { promiseId: promise.id, promiseType: summary.promiseType },
      idempotencyKey: `outbox:promise:${input.idempotencyKey}`
    });

    await completeIdempotencyKey(tx, {
      companyId: input.companyId,
      scope: "promise",
      key: input.idempotencyKey,
      responseJson: JSON.parse(JSON.stringify(summary)),
      statusCode: 200
    });

    return summary;
  });
}

export async function createOrUpdatePromise(input: UpsertPromiseInput): Promise<PromiseSummary> {
  return upsertPromiseToPay(input);
}

export async function checkPaymentMatch(
  input: CheckPaymentMatchInput
): Promise<PaymentMatchSummary> {
  // Gap: real implementation runs `cash-engine.rankPaymentMatchCandidates`
  // against `listRecentBankTransactionsForCompany`. The matcher needs a
  // join-by-promise query that the bank repo does not yet expose. Until
  // that ships, return the no-match shape — promise monitoring then
  // classifies the promise as "broken" deterministically.
  void input;
  return {
    matched: false,
    matchConfidence: 0
  };
}

export async function classifyPromiseOutcome(
  input: ClassifyPromiseOutcomeInput
): Promise<PromiseOutcomeSummary> {
  if (!input.match.matched) {
    return { outcome: "broken" };
  }
  return { outcome: "kept" };
}

export async function updateCustomerReliability(
  _input: UpdateCustomerReliabilityInput
): Promise<{ ok: true }> {
  // Gap: customer_payment_stats repo not yet shipped. The promise
  // monitoring workflow tolerates this no-op — when stats land in a
  // later round this body fills in without a workflow signature change.
  return { ok: true };
}
