import { calculatePromiseConfidence } from "./confidence.ts";
import { addDays, isWithinHorizon, toDate, toIsoDate } from "./dates.ts";
import {
  addMoney,
  assertSameCurrency,
  clampMoneyToZero,
  multiplyMoneyByRatio,
  subtractMoney,
  sumMoney,
  zeroMoney
} from "./money.ts";
import { resolvePolicy } from "./policy.ts";
import { assessForecastRisk } from "./risk.ts";
import { buildForecastScenarios } from "./scenarios.ts";
import type {
  BankTransaction,
  CashEnginePolicy,
  CashForecast,
  ComputeCashForecastInput,
  ConfidenceBand,
  CriticalObligation,
  CustomerPaymentStats,
  EvidenceRef,
  ForecastCashFlow,
  Invoice,
  Money,
  Payment,
  PromiseToPay,
  SupplierBill
} from "./types.ts";

export function computeCashForecast(input: ComputeCashForecastInput): CashForecast {
  const policy = resolvePolicy(input.policy);
  const asOfDate = toDate(input.asOfDate);
  const generatedAt = toDate(input.generatedAt ?? input.asOfDate);

  validateCurrencies(input);

  const customerStats = new Map((input.customerStats ?? []).map((stats) => [stats.customerId, stats]));
  const promises = input.promises ?? [];
  const expectedInflows = buildExpectedInflows({
    companyId: input.companyId,
    asOfDate,
    horizonDays: input.horizonDays,
    invoices: input.invoices ?? [],
    payments: input.payments ?? [],
    promises,
    customerStats,
    policy
  });
  const confidenceWeightedInflows = expectedInflows.map((flow) => ({
    ...flow,
    amount: multiplyMoneyByRatio(flow.amount, flow.confidence)
  }));
  const expectedOutflows = buildExpectedOutflows({
    asOfDate,
    horizonDays: input.horizonDays,
    supplierBills: input.supplierBills ?? [],
    criticalObligations: input.criticalObligations ?? []
  });

  const riskAssessment = assessForecastRisk({
    asOfDate,
    cashBalance: input.cashBalance,
    expectedInflows,
    expectedOutflows,
    policy
  });
  const scenarios = buildForecastScenarios({
    asOfDate,
    cashBalance: input.cashBalance,
    expectedInflows,
    confidenceWeightedInflows,
    expectedOutflows,
    policy
  });
  const evidenceRefs = collectForecastEvidence(expectedInflows, expectedOutflows, input.bankTransactions ?? []);

  return {
    forecastId: input.forecastId ?? deterministicForecastId(input.companyId, asOfDate, input.horizonDays),
    companyId: input.companyId,
    generatedAt,
    asOfDate,
    horizonDays: input.horizonDays,
    triggerEventIds: input.triggerEventIds ?? [],
    cashBalance: input.cashBalance,
    expectedInflows,
    confidenceWeightedInflows,
    expectedOutflows,
    riskStatus: riskAssessment.riskStatus,
    scenarios,
    confidenceBands: buildConfidenceBands({
      asOfDate,
      horizonDays: input.horizonDays,
      cashBalance: input.cashBalance,
      expectedInflows,
      confidenceWeightedInflows,
      expectedOutflows,
      evidenceRefs
    }),
    shortfallAmount: riskAssessment.shortfallAmount,
    obligationRisks: riskAssessment.obligationRisks,
    evidenceRefs
  };
}

function buildExpectedInflows(input: {
  companyId: string;
  asOfDate: Date;
  horizonDays: 7 | 14 | 30 | 90;
  invoices: Invoice[];
  payments: Payment[];
  promises: PromiseToPay[];
  customerStats: Map<string, CustomerPaymentStats>;
  policy: CashEnginePolicy;
}): ForecastCashFlow[] {
  const flows: ForecastCashFlow[] = [];
  const promiseAmountsByInvoice = new Map<string, Money>();

  for (const promise of input.promises) {
    if (promise.outcome !== "pending") continue;
    const promisedDate = promise.promisedDate ?? input.asOfDate;
    if (!isWithinHorizon(promisedDate, input.asOfDate, input.horizonDays)) continue;

    const amount = promisedAmountForForecast(promise, input.invoices);
    if (!amount || amount.amountMinor <= 0n) continue;

    const stats = input.customerStats.get(promise.customerId);
    const confidence = calculatePromiseConfidence(promise, stats, input.asOfDate, input.policy).finalConfidence;
    flows.push({
      id: `promise:${promise.id}`,
      kind: "promise",
      sourceId: promise.id,
      date: promisedDate,
      amount,
      confidence,
      customerId: promise.customerId,
      invoiceId: promise.invoiceId,
      promiseId: promise.id,
      evidenceRefs: promise.evidenceRefs.length > 0 ? promise.evidenceRefs : [{ kind: "promise_to_pay", id: promise.id }]
    });

    if (promise.invoiceId) {
      const current = promiseAmountsByInvoice.get(promise.invoiceId) ?? zeroMoney(amount.currency);
      promiseAmountsByInvoice.set(promise.invoiceId, addMoney(current, amount));
    }
  }

  for (const payment of input.payments) {
    if (payment.providerStatus && payment.providerStatus !== "pending") continue;
    if (!isWithinHorizon(payment.paymentDate, input.asOfDate, input.horizonDays)) continue;

    flows.push({
      id: `payment:${payment.id}`,
      kind: "payment",
      sourceId: payment.id,
      date: payment.paymentDate,
      amount: payment.amount,
      confidence: payment.providerStatus === "pending" ? 0.85 : 1,
      customerId: payment.customerId,
      invoiceId: payment.invoiceId,
      evidenceRefs: payment.evidenceRefs?.length ? payment.evidenceRefs : [{ kind: "payment", id: payment.id }]
    });
  }

  for (const invoice of input.invoices) {
    if (!isOpenInvoice(invoice)) continue;
    const invoiceFlowDate = toDate(invoice.dueDate).getTime() < input.asOfDate.getTime() ? input.asOfDate : invoice.dueDate;
    if (!isWithinHorizon(invoiceFlowDate, input.asOfDate, input.horizonDays)) continue;

    const promisedAmount = promiseAmountsByInvoice.get(invoice.id) ?? zeroMoney(invoice.amountDue.currency);
    const residualAmount = clampMoneyToZero(subtractMoney(invoice.amountDue, promisedAmount));
    if (residualAmount.amountMinor <= 0n) continue;

    const stats = input.customerStats.get(invoice.customerId);
    flows.push({
      id: `invoice:${invoice.id}`,
      kind: "invoice",
      sourceId: invoice.id,
      date: invoiceFlowDate,
      amount: residualAmount,
      confidence: invoiceCollectionConfidence(invoice, stats, input.asOfDate, input.policy),
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      evidenceRefs: invoice.evidenceRefs?.length ? invoice.evidenceRefs : [{ kind: "invoice", id: invoice.id }]
    });
  }

  return flows.sort((left, right) => toIsoDate(left.date).localeCompare(toIsoDate(right.date)) || left.id.localeCompare(right.id));
}

function buildExpectedOutflows(input: {
  asOfDate: Date;
  horizonDays: 7 | 14 | 30 | 90;
  supplierBills: SupplierBill[];
  criticalObligations: CriticalObligation[];
}): ForecastCashFlow[] {
  const supplierBillFlows = input.supplierBills
    .filter((bill) => (bill.status === "open" || bill.status === "scheduled") && isWithinHorizon(bill.dueDate, input.asOfDate, input.horizonDays))
    .map<ForecastCashFlow>((bill) => ({
      id: `supplier_bill:${bill.id}`,
      kind: "supplier_bill",
      sourceId: bill.id,
      date: bill.dueDate,
      amount: bill.amount,
      confidence: 1,
      obligationId: bill.id,
      evidenceRefs: bill.evidenceRefs?.length ? bill.evidenceRefs : [{ kind: "obligation", id: bill.id }],
      label: bill.supplierName
    }));

  const obligationFlows = input.criticalObligations
    .filter(
      (obligation) =>
        obligation.status === "scheduled" && isWithinHorizon(obligation.dueDate, input.asOfDate, input.horizonDays)
    )
    .map<ForecastCashFlow>((obligation) => ({
      id: `critical_obligation:${obligation.id}`,
      kind: "critical_obligation",
      sourceId: obligation.id,
      date: obligation.dueDate,
      amount: obligation.amount,
      confidence: 1,
      obligationId: obligation.id,
      evidenceRefs: obligation.evidenceRefs?.length ? obligation.evidenceRefs : [{ kind: "obligation", id: obligation.id }],
      label: `${obligation.obligationType}:${obligation.counterpartyName}`
    }));

  return [...supplierBillFlows, ...obligationFlows].sort(
    (left, right) => toIsoDate(left.date).localeCompare(toIsoDate(right.date)) || left.id.localeCompare(right.id)
  );
}

function promisedAmountForForecast(promise: PromiseToPay, invoices: Invoice[]): Money | undefined {
  if (promise.amountPromised) return promise.amountPromised;
  if (!promise.invoiceId) return undefined;
  return invoices.find((invoice) => invoice.id === promise.invoiceId)?.amountDue;
}

function invoiceCollectionConfidence(
  invoice: Invoice,
  stats: CustomerPaymentStats | undefined,
  asOfDate: Date,
  policy: CashEnginePolicy
): number {
  const daysLate = Math.max(0, Math.round((asOfDate.getTime() - toDate(invoice.dueDate).getTime()) / (24 * 60 * 60 * 1000)));
  const history = stats?.paymentAfterActionRate ?? stats?.promiseKeptRate ?? policy.defaultInvoiceConfidence;
  const latenessPenalty = daysLate > 60 ? 0.3 : daysLate > 30 ? 0.2 : daysLate > 14 ? 0.1 : 0;
  const disputePenalty = invoice.status === "disputed" ? 0.35 : 0;
  return Math.max(0.05, Math.min(0.9, history - latenessPenalty - disputePenalty));
}

function isOpenInvoice(invoice: Invoice): boolean {
  return ["sent", "authorised", "overdue", "partially_paid", "disputed"].includes(invoice.status) && invoice.amountDue.amountMinor > 0n;
}

function buildConfidenceBands(input: {
  asOfDate: Date;
  horizonDays: 7 | 14 | 30 | 90;
  cashBalance: Money;
  expectedInflows: ForecastCashFlow[];
  confidenceWeightedInflows: ForecastCashFlow[];
  expectedOutflows: ForecastCashFlow[];
  evidenceRefs: EvidenceRef[];
}): ConfidenceBand[] {
  const horizonDate = addDays(input.asOfDate, input.horizonDays);
  const outflows = sumMoney(input.expectedOutflows.map((flow) => flow.amount), input.cashBalance.currency);
  const weightedInflows = sumMoney(input.confidenceWeightedInflows.map((flow) => flow.amount), input.cashBalance.currency);
  const highInflows = sumMoney(
    input.expectedInflows.filter((flow) => flow.confidence >= 0.8).map((flow) => flow.amount),
    input.cashBalance.currency
  );
  const allInflows = sumMoney(input.expectedInflows.map((flow) => flow.amount), input.cashBalance.currency);

  return [
    {
      date: horizonDate,
      low: subtractMoney(addMoney(input.cashBalance, highInflows), outflows),
      expected: subtractMoney(addMoney(input.cashBalance, weightedInflows), outflows),
      high: subtractMoney(addMoney(input.cashBalance, allInflows), outflows),
      evidenceRefs: input.evidenceRefs
    }
  ];
}

function collectForecastEvidence(
  inflows: ForecastCashFlow[],
  outflows: ForecastCashFlow[],
  bankTransactions: BankTransaction[]
): EvidenceRef[] {
  const refs = [...inflows, ...outflows].flatMap((flow) => flow.evidenceRefs);
  for (const transaction of bankTransactions) {
    refs.push(
      ...(transaction.evidenceRefs?.length
        ? transaction.evidenceRefs
        : [{ kind: "bank_transaction" as const, id: transaction.id, sourceTimestamp: toDate(transaction.postedDate) }])
    );
  }

  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deterministicForecastId(companyId: string, asOfDate: Date, horizonDays: number): string {
  return `forecast:${companyId}:${toIsoDate(asOfDate)}:${horizonDays}`;
}

function validateCurrencies(input: ComputeCashForecastInput): void {
  const cash = input.cashBalance;
  const amounts: Money[] = [
    ...(input.invoices ?? []).map((invoice) => invoice.amountDue),
    ...(input.payments ?? []).map((payment) => payment.amount),
    ...(input.promises ?? []).flatMap((promise) => (promise.amountPromised ? [promise.amountPromised] : [])),
    ...(input.supplierBills ?? []).map((bill) => bill.amount),
    ...(input.criticalObligations ?? []).map((obligation) => obligation.amount),
    ...(input.bankTransactions ?? []).map((transaction) => transaction.amount)
  ];

  for (const amount of amounts) {
    assertSameCurrency(cash, amount);
  }
}
