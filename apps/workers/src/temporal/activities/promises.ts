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

export async function loadPromise(input: LoadPromiseInput): Promise<PromiseDetailSummary> {
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

export async function upsertPromiseToPay(input: UpsertPromiseInput): Promise<PromiseSummary> {
  return {
    promiseId: `${input.idempotencyKey}:promise`,
    customerId: input.customerId,
    invoiceId: input.invoiceId,
    promiseType: input.extraction.promiseType ?? "vague",
    promisedDateIso: input.extraction.promisedDateIso,
    outcome: "pending"
  };
}

export async function createOrUpdatePromise(input: UpsertPromiseInput): Promise<PromiseSummary> {
  return upsertPromiseToPay(input);
}

export async function checkPaymentMatch(
  input: CheckPaymentMatchInput
): Promise<PaymentMatchSummary> {
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
  if (!input.match.matched) {
    return { outcome: "broken" };
  }
  return { outcome: "kept" };
}

export async function updateCustomerReliability(
  _input: UpdateCustomerReliabilityInput
): Promise<{ ok: true }> {
  return { ok: true };
}
