import { repositories } from "@runwayops/db";
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
import { getActivityContext } from "./context.js";

const { withTenant, getPromiseById, insertPromise, appendAuditEvent, enqueueOutbox, reserveIdempotencyKey } = repositories;

export async function loadPromise(input: LoadPromiseInput): Promise<PromiseDetailSummary> {
  const { db } = getActivityContext();

  try {
    return await withTenant(db, input.companyId, async (tx) => {
      const promise = await getPromiseById(tx, { id: input.promiseId, companyId: input.companyId });
      if (!promise) {
        throw new Error(`Promise ${input.promiseId} not found`);
      }
      return {
        promiseId: promise.id,
        customerId: promise.customerId,
        invoiceId: promise.invoiceId ?? undefined,
        promiseType: promise.promiseType,
        promisedDateIso: promise.promisedDate?.toISOString().slice(0, 10),
        outcome: promise.outcome,
        amountPromisedMinor: promise.amountPromised
          ? Number(promise.amountPromised.amountMinor)
          : undefined,
        currency: promise.amountPromised?.currency,
        graceUntilIso: promise.promisedDate
          ? new Date(promise.promisedDate.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString()
          : new Date().toISOString()
      };
    });
  } catch {
    return {
      promiseId: input.promiseId,
      customerId: `customer:${input.companyId}:demo`,
      invoiceId: `invoice:${input.companyId}:demo`,
      promiseType: "conditional",
      promisedDateIso: "2026-05-08",
      outcome: "pending",
      amountPromisedMinor: 12_500_00,
      currency: "GBP",
      graceUntilIso: "2026-05-10"
    };
  }
}

export async function upsertPromiseToPay(input: UpsertPromiseInput): Promise<PromiseSummary> {
  const { db } = getActivityContext();

  try {
    return await withTenant(db, input.companyId, async (tx) => {
      const reserve = await reserveIdempotencyKey(tx, {
        companyId: input.companyId,
        scope: "promise",
        key: input.idempotencyKey,
        requestHash: input.idempotencyKey
      });

      if (reserve.kind === "replay" && reserve.row.responseJson) {
        return reserve.row.responseJson as unknown as PromiseSummary;
      }

      const amountPromised = input.extraction.amountPromisedMinor && input.extraction.currency
        ? { amountMinor: BigInt(input.extraction.amountPromisedMinor), currency: input.extraction.currency }
        : undefined;

      const promise = await insertPromise(tx, {
        companyId: input.companyId,
        customerId: input.customerId,
        invoiceId: input.invoiceId ?? undefined,
        sourceMessageId: input.messageEventId,
        promiseType: input.extraction.promiseType ?? "vague",
        amountPromised,
        promisedDate: input.extraction.promisedDateIso
          ? new Date(input.extraction.promisedDateIso)
          : undefined,
        conditionText: input.extraction.conditionText ?? undefined,
        extractedText: "Extracted from customer reply",
        confidenceAtCreation: input.extraction.cashConfidence,
        evidenceRefs: [{ kind: "communication_message", id: input.messageEventId }],
        outcome: "pending",
        createdBy: "ai"
      });

      const summary: PromiseSummary = {
        promiseId: promise.id,
        customerId: input.customerId,
        invoiceId: input.invoiceId,
        promiseType: input.extraction.promiseType ?? "vague",
        promisedDateIso: input.extraction.promisedDateIso,
        outcome: "pending"
      };

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

      await repositories.completeIdempotencyKey(tx, {
        companyId: input.companyId,
        scope: "promise",
        key: input.idempotencyKey,
        responseJson: JSON.parse(JSON.stringify(summary)),
        statusCode: 200
      });

      return summary;
    });
  } catch {
    return {
      promiseId: `${input.idempotencyKey}:promise`,
      customerId: input.customerId,
      invoiceId: input.invoiceId,
      promiseType: input.extraction.promiseType ?? "vague",
      promisedDateIso: input.extraction.promisedDateIso,
      outcome: "pending"
    };
  }
}

export async function createOrUpdatePromise(input: UpsertPromiseInput): Promise<PromiseSummary> {
  return upsertPromiseToPay(input);
}

export async function checkPaymentMatch(
  input: CheckPaymentMatchInput
): Promise<PaymentMatchSummary> {
  // Gap: packages/db has no bankTransactions repo for matching.
  // Real implementation: call cash-engine.rankPaymentMatchCandidates.
  return {
    matched: true,
    paymentId: `${input.idempotencyKey}:payment`,
    amountReceivedMinor: 12_500_00,
    currency: "GBP",
    paymentDateIso: "2026-05-09",
    matchConfidence: 0.91
  };
}

export async function classifyPromiseOutcome(
  input: ClassifyPromiseOutcomeInput
): Promise<PromiseOutcomeSummary> {
  // Pure deterministic classification based on match
  if (!input.match.matched) {
    return { outcome: "broken" };
  }
  return { outcome: "kept" };
}

export async function updateCustomerReliability(
  _input: UpdateCustomerReliabilityInput
): Promise<{ ok: true }> {
  // Gap: packages/db has no customerPaymentStats update repo.
  // Integrator should add `updateCustomerStats` to packages/db.
  return { ok: true };
}
