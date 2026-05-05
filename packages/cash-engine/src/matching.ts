import { daysUntil } from "./dates.ts";
import type {
  BankTransaction,
  DedupedBankTransactions,
  Invoice,
  PaymentMatchCandidate,
  PromiseToPay,
  RankPaymentMatchCandidatesInput
} from "./types.ts";

export function dedupeBankTransactions(transactions: BankTransaction[]): DedupedBankTransactions {
  const seen = new Set<string>();
  const unique: BankTransaction[] = [];
  const duplicates: BankTransaction[] = [];

  for (const transaction of transactions) {
    const key = transaction.idempotencyKey ?? transaction.providerTransactionId ?? transaction.id;
    if (seen.has(key)) {
      duplicates.push(transaction);
    } else {
      seen.add(key);
      unique.push(transaction);
    }
  }

  return { unique, duplicates };
}

export function rankPaymentMatchCandidates(input: RankPaymentMatchCandidatesInput): PaymentMatchCandidate[] {
  const threshold = input.manualReviewThreshold ?? 0.85;
  const transaction = input.bankTransaction;

  if (transaction.direction !== "credit" || transaction.amount.amountMinor <= 0n || transaction.status === "cancelled") {
    return [];
  }

  const candidates: PaymentMatchCandidate[] = [];

  for (const invoice of input.invoices ?? []) {
    const invoiceCandidate = scoreInvoiceCandidate(transaction, invoice, input.promises ?? [], threshold);
    if (invoiceCandidate.confidence > 0) candidates.push(invoiceCandidate);
  }

  for (const promise of (input.promises ?? []).filter((promise) => !promise.invoiceId)) {
    const promiseCandidate = scoreStandalonePromiseCandidate(transaction, promise, threshold);
    if (promiseCandidate.confidence > 0) candidates.push(promiseCandidate);
  }

  return candidates.sort(
    (left, right) =>
      right.confidence - left.confidence ||
      (left.invoiceId ?? "").localeCompare(right.invoiceId ?? "") ||
      (left.promiseId ?? "").localeCompare(right.promiseId ?? "")
  );
}

function scoreInvoiceCandidate(
  transaction: BankTransaction,
  invoice: Invoice,
  promises: PromiseToPay[],
  threshold: number
): PaymentMatchCandidate {
  const matchingFactors: string[] = [];
  let score = 0;

  const amountScore = amountMatchScore(transaction.amount.amountMinor, invoice.amountDue.amountMinor);
  score += amountScore.score;
  if (amountScore.factor) matchingFactors.push(amountScore.factor);

  const reference = normalize(`${transaction.reference ?? ""} ${transaction.counterpartyName ?? ""}`);
  if (invoice.invoiceNumber && reference.includes(normalize(invoice.invoiceNumber))) {
    score += 0.25;
    matchingFactors.push("invoice_reference");
  }

  if (invoice.customerName && tokenSimilarity(reference, normalize(invoice.customerName)) >= 0.5) {
    score += 0.15;
    matchingFactors.push("customer_name");
  }

  if (Math.abs(daysUntil(invoice.dueDate, transaction.postedDate)) <= 7) {
    score += 0.08;
    matchingFactors.push("date_proximity");
  }

  if (transaction.knownPayerAccountId) {
    score += 0.08;
    matchingFactors.push("known_payer_account");
  }

  if (transaction.paymentLinkEventId) {
    score += 0.18;
    matchingFactors.push("payment_link_event");
  }

  const linkedPromise = promises.find((promise) => promise.invoiceId === invoice.id);
  if (linkedPromise) {
    const promiseScore = promiseMatchScore(transaction, linkedPromise);
    score += promiseScore.score;
    matchingFactors.push(...promiseScore.factors);
  }

  const confidence = clampConfidence(score);
  return {
    bankTransactionId: transaction.id,
    invoiceId: invoice.id,
    promiseId: linkedPromise?.id,
    confidence,
    matchingFactors,
    requiresManualReview: confidence < threshold || !matchingFactors.includes("amount_exact")
  };
}

function scoreStandalonePromiseCandidate(
  transaction: BankTransaction,
  promise: PromiseToPay,
  threshold: number
): PaymentMatchCandidate {
  const match = promiseMatchScore(transaction, promise);
  const confidence = clampConfidence(match.score);
  return {
    bankTransactionId: transaction.id,
    promiseId: promise.id,
    confidence,
    matchingFactors: match.factors,
    requiresManualReview: confidence < threshold || !match.factors.includes("amount_exact")
  };
}

function promiseMatchScore(transaction: BankTransaction, promise: PromiseToPay): { score: number; factors: string[] } {
  const factors: string[] = [];
  let score = 0;

  if (promise.amountPromised) {
    const amount = amountMatchScore(transaction.amount.amountMinor, promise.amountPromised.amountMinor);
    score += amount.score;
    if (amount.factor) factors.push(amount.factor);
  }

  if (promise.promisedDate && Math.abs(daysUntil(promise.promisedDate, transaction.postedDate)) <= 3) {
    score += 0.12;
    factors.push("promise_date_proximity");
  }

  if (promise.matchedPaymentId === transaction.id) {
    score += 0.35;
    factors.push("previously_confirmed_match");
  }

  return { score, factors };
}

function amountMatchScore(transactionAmountMinor: bigint, expectedAmountMinor: bigint): { score: number; factor?: string } {
  if (transactionAmountMinor === expectedAmountMinor) {
    return { score: 0.4, factor: "amount_exact" };
  }

  if (transactionAmountMinor > 0n && transactionAmountMinor < expectedAmountMinor) {
    const ratioBasisPoints = Number((transactionAmountMinor * 10000n) / expectedAmountMinor);
    if (ratioBasisPoints >= 2500) {
      return { score: 0.2, factor: "partial_amount" };
    }
  }

  const difference = transactionAmountMinor > expectedAmountMinor ? transactionAmountMinor - expectedAmountMinor : expectedAmountMinor - transactionAmountMinor;
  const tolerance = expectedAmountMinor / 100n;
  if (tolerance > 0n && difference <= tolerance) {
    return { score: 0.3, factor: "amount_near" };
  }

  return { score: 0 };
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 10000) / 10000));
}
