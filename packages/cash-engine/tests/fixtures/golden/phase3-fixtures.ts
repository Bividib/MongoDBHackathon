import { money } from "../../../src/money.ts";
import type {
  BankTransaction,
  ComputeCashForecastInput,
  CustomerPaymentStats,
  Invoice,
  PromiseToPay,
  RankNextBestActionsInput,
  RankPaymentMatchCandidatesInput
} from "../../../src/types.ts";

const companyId = "co_demo";
const asOfDate = "2026-05-04T12:00:00.000Z";

const highReliabilityStats: CustomerPaymentStats = {
  customerId: "cust_reliable",
  promiseKeptRate: 0.95,
  conditionalPromiseKeptRate: 0.9,
  disputeRate: 0,
  paymentAfterActionRate: 0.82,
  averageDaysLate: 0,
  lastSuccessfulChannel: "email",
  lastSuccessfulTone: "friendly",
  evidenceRefs: [{ kind: "customer_stat", id: "cust_reliable" }]
};

const brokenConditionalStats: CustomerPaymentStats = {
  customerId: "cust_broken",
  promiseKeptRate: 0.25,
  conditionalPromiseKeptRate: 0.05,
  disputeRate: 0.2,
  paymentAfterActionRate: 0.3,
  averageDaysLate: 24,
  brokenPromiseCount: 6,
  relationshipRisk: 0.2,
  evidenceRefs: [{ kind: "customer_stat", id: "cust_broken" }]
};

const averageStats: CustomerPaymentStats = {
  customerId: "cust_average",
  promiseKeptRate: 0.65,
  conditionalPromiseKeptRate: 0.55,
  disputeRate: 0.05,
  paymentAfterActionRate: 0.55,
  evidenceRefs: [{ kind: "customer_stat", id: "cust_average" }]
};

export const goldenFixtures = {
  companyId,
  asOfDate,
  normalOverdueNoRisk: {
    companyId,
    asOfDate,
    horizonDays: 14,
    cashBalance: money(2_000_000),
    invoices: [
      invoice({
        id: "inv_normal",
        customerId: "cust_average",
        customerName: "Average Ltd",
        invoiceNumber: "INV-NORMAL",
        dueDate: "2026-04-20",
        amountDueMinor: 500_000,
        status: "overdue"
      })
    ],
    customerStats: [averageStats]
  } satisfies ComputeCashForecastInput,

  payrollConditionalPromise: {
    companyId,
    asOfDate,
    horizonDays: 14,
    cashBalance: money(500_000),
    invoices: [
      invoice({
        id: "inv_conditional",
        customerId: "cust_reliable",
        customerName: "Reliable Retail Ltd",
        invoiceNumber: "INV-COND",
        dueDate: "2026-05-08",
        amountDueMinor: 700_000,
        status: "sent"
      })
    ],
    promises: [
      promise({
        id: "ptp_conditional",
        customerId: "cust_reliable",
        invoiceId: "inv_conditional",
        amountMinor: 600_000,
        promisedDate: "2026-05-08",
        promiseType: "conditional",
        conditionText: "once our incoming transfer clears"
      })
    ],
    criticalObligations: [
      {
        id: "obl_payroll",
        companyId,
        obligationType: "payroll",
        counterpartyName: "May payroll",
        dueDate: "2026-05-09",
        amount: money(1_000_000),
        criticality: "critical",
        status: "scheduled",
        evidenceRefs: [{ kind: "obligation", id: "obl_payroll" }]
      }
    ],
    customerStats: [highReliabilityStats]
  } satisfies ComputeCashForecastInput,

  alreadyPaidClaimBankAbsent: {
    companyId,
    asOfDate,
    horizonDays: 14,
    cashBalance: money(200_000),
    invoices: [
      invoice({
        id: "inv_paid_claim",
        customerId: "cust_average",
        customerName: "Average Ltd",
        invoiceNumber: "INV-CLAIM",
        dueDate: "2026-04-28",
        amountDueMinor: 400_000,
        status: "overdue"
      })
    ],
    promises: [
      promise({
        id: "ptp_paid_claim",
        customerId: "cust_average",
        invoiceId: "inv_paid_claim",
        amountMinor: 400_000,
        promisedDate: "2026-05-04",
        promiseType: "already_paid_claim",
        extractedText: "We paid this already last week."
      })
    ],
    criticalObligations: [
      {
        id: "obl_tax",
        companyId,
        obligationType: "tax",
        counterpartyName: "HMRC VAT",
        dueDate: "2026-05-09",
        amount: money(500_000),
        criticality: "critical",
        status: "scheduled",
        evidenceRefs: [{ kind: "obligation", id: "obl_tax" }]
      }
    ],
    customerStats: [averageStats]
  } satisfies ComputeCashForecastInput,

  highHistoricalReliability: {
    companyId,
    asOfDate,
    horizonDays: 14,
    cashBalance: money(400_000),
    invoices: [
      invoice({
        id: "inv_reliable",
        customerId: "cust_reliable",
        customerName: "Reliable Retail Ltd",
        invoiceNumber: "INV-REL",
        dueDate: "2026-05-06",
        amountDueMinor: 700_000,
        status: "sent"
      })
    ],
    promises: [
      promise({
        id: "ptp_reliable",
        customerId: "cust_reliable",
        invoiceId: "inv_reliable",
        amountMinor: 700_000,
        promisedDate: "2026-05-06",
        promiseType: "firm"
      })
    ],
    criticalObligations: [
      {
        id: "obl_rent",
        companyId,
        obligationType: "rent",
        counterpartyName: "Warehouse landlord",
        dueDate: "2026-05-07",
        amount: money(1_000_000),
        criticality: "critical",
        status: "scheduled",
        evidenceRefs: [{ kind: "obligation", id: "obl_rent" }]
      }
    ],
    customerStats: [highReliabilityStats]
  } satisfies ComputeCashForecastInput,

  brokenConditionalPromises: {
    companyId,
    asOfDate,
    horizonDays: 14,
    cashBalance: money(500_000),
    invoices: [
      invoice({
        id: "inv_broken",
        customerId: "cust_broken",
        customerName: "Wobbly Wholesale Ltd",
        invoiceNumber: "INV-BROKEN",
        dueDate: "2026-05-07",
        amountDueMinor: 700_000,
        status: "overdue"
      })
    ],
    promises: [
      promise({
        id: "ptp_broken",
        customerId: "cust_broken",
        invoiceId: "inv_broken",
        amountMinor: 700_000,
        promisedDate: "2026-05-07",
        promiseType: "conditional",
        conditionText: "if our customer pays us"
      })
    ],
    criticalObligations: [
      {
        id: "obl_supplier",
        companyId,
        obligationType: "supplier",
        counterpartyName: "Key supplier",
        dueDate: "2026-05-08",
        amount: money(1_000_000),
        criticality: "critical",
        status: "scheduled",
        evidenceRefs: [{ kind: "obligation", id: "obl_supplier" }]
      }
    ],
    customerStats: [brokenConditionalStats]
  } satisfies ComputeCashForecastInput,

  supplierBillCreatesShortfall: {
    companyId,
    asOfDate,
    horizonDays: 14,
    cashBalance: money(100_000),
    invoices: [
      invoice({
        id: "inv_shortfall",
        customerId: "cust_average",
        customerName: "Average Ltd",
        invoiceNumber: "INV-SHORT",
        dueDate: "2026-05-07",
        amountDueMinor: 600_000,
        status: "sent"
      })
    ],
    supplierBills: [
      {
        id: "bill_supplier",
        companyId,
        supplierName: "Critical supplier",
        dueDate: "2026-05-10",
        amount: money(700_000),
        criticality: "high",
        status: "open",
        evidenceRefs: [{ kind: "obligation", id: "bill_supplier" }]
      }
    ]
  } satisfies ComputeCashForecastInput,

  immediateUnavoidableShortfall: {
    companyId,
    asOfDate,
    horizonDays: 7,
    cashBalance: money(100_000),
    criticalObligations: [
      {
        id: "obl_immediate",
        companyId,
        obligationType: "loan",
        counterpartyName: "Bank loan",
        dueDate: "2026-05-05",
        amount: money(500_000),
        criticality: "critical",
        status: "scheduled",
        evidenceRefs: [{ kind: "obligation", id: "obl_immediate" }]
      }
    ]
  } satisfies ComputeCashForecastInput,

  bankEventLandsAndClosesRisk: {
    companyId,
    asOfDate,
    horizonDays: 7,
    cashBalance: money(1_100_000),
    bankTransactions: [
      {
        id: "bank_landed",
        companyId,
        postedDate: "2026-05-04",
        amount: money(700_000),
        direction: "credit",
        counterpartyName: "Reliable Retail Ltd",
        reference: "INV-REL",
        status: "posted"
      }
    ],
    criticalObligations: [
      {
        id: "obl_closed",
        companyId,
        obligationType: "payroll",
        counterpartyName: "May payroll",
        dueDate: "2026-05-06",
        amount: money(1_000_000),
        criticality: "critical",
        status: "scheduled",
        evidenceRefs: [{ kind: "obligation", id: "obl_closed" }]
      }
    ]
  } satisfies ComputeCashForecastInput,

  timezoneBoundaryPromise: {
    companyId,
    asOfDate: "2026-05-04T10:00:00.000Z",
    horizonDays: 7,
    cashBalance: money(100_000),
    promises: [
      promise({
        id: "ptp_timezone",
        customerId: "cust_reliable",
        amountMinor: 250_000,
        promisedDate: "2026-05-04T23:30:00-05:00",
        promiseType: "firm"
      })
    ],
    customerStats: [highReliabilityStats]
  } satisfies ComputeCashForecastInput,

  partialLatePaymentMatch: {
    bankTransaction: {
      id: "bank_partial_late",
      companyId,
      postedDate: "2026-05-03",
      amount: money(200_000),
      direction: "credit",
      counterpartyName: "Beta Manufacturing",
      reference: "Partial INV-PART",
      status: "posted"
    },
    invoices: [
      invoice({
        id: "inv_partial",
        customerId: "cust_average",
        customerName: "Beta Manufacturing",
        invoiceNumber: "INV-PART",
        dueDate: "2026-04-28",
        amountDueMinor: 500_000,
        status: "partially_paid"
      })
    ],
    promises: [
      promise({
        id: "ptp_partial",
        customerId: "cust_average",
        invoiceId: "inv_partial",
        amountMinor: 300_000,
        promisedDate: "2026-05-01",
        promiseType: "partial"
      })
    ]
  } satisfies RankPaymentMatchCandidatesInput,

  duplicatePaymentEvents: [
    {
      id: "bank_duplicate_a",
      companyId,
      postedDate: "2026-05-04",
      amount: money(100_000),
      direction: "credit",
      providerTransactionId: "provider_tx_1",
      idempotencyKey: "bank:credit:provider_tx_1:posted"
    },
    {
      id: "bank_duplicate_b",
      companyId,
      postedDate: "2026-05-04",
      amount: money(100_000),
      direction: "credit",
      providerTransactionId: "provider_tx_1",
      idempotencyKey: "bank:credit:provider_tx_1:posted"
    }
  ] satisfies BankTransaction[],

  rankingInput: {
    companyId,
    asOfDate,
    invoices: [
      invoice({
        id: "inv_small_urgent",
        customerId: "cust_reliable",
        customerName: "Reliable Retail Ltd",
        invoiceNumber: "INV-SMALL",
        dueDate: "2026-04-18",
        amountDueMinor: 300_000,
        status: "overdue"
      }),
      invoice({
        id: "inv_large_low_quality",
        customerId: "cust_broken",
        customerName: "Wobbly Wholesale Ltd",
        invoiceNumber: "INV-LARGE",
        dueDate: "2026-04-01",
        amountDueMinor: 2_000_000,
        status: "overdue"
      })
    ],
    customerStats: [highReliabilityStats, brokenConditionalStats],
    nearTermShortfall: money(300_000)
  } satisfies RankNextBestActionsInput,

  hugeInvoiceRankingInput: {
    companyId,
    asOfDate,
    invoices: [
      invoice({
        id: "inv_huge",
        customerId: "cust_reliable",
        customerName: "Reliable Retail Ltd",
        invoiceNumber: "INV-HUGE",
        dueDate: "2026-04-18",
        amountDueMinor: "900719925474099300",
        status: "overdue"
      })
    ],
    customerStats: [highReliabilityStats]
  } satisfies RankNextBestActionsInput
};

function invoice(input: {
  id: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string;
  dueDate: string;
  amountDueMinor: number | bigint | string;
  status: Invoice["status"];
}): Invoice {
  return {
    id: input.id,
    companyId,
    customerId: input.customerId,
    customerName: input.customerName,
    invoiceNumber: input.invoiceNumber,
    issueDate: "2026-04-01",
    dueDate: input.dueDate,
    status: input.status,
    amountDue: money(input.amountDueMinor),
    evidenceRefs: [{ kind: "invoice", id: input.id }]
  };
}

function promise(input: {
  id: string;
  customerId: string;
  invoiceId?: string;
  amountMinor: number;
  promisedDate: string;
  promiseType: PromiseToPay["promiseType"];
  conditionText?: string;
  extractedText?: string;
}): PromiseToPay {
  const output: PromiseToPay = {
    id: input.id,
    companyId,
    customerId: input.customerId,
    amountPromised: money(input.amountMinor),
    promisedDate: input.promisedDate,
    promiseType: input.promiseType,
    extractedText: input.extractedText ?? "Customer promised payment.",
    confidenceAtCreation: 1,
    evidenceConfidence: 1,
    evidenceRefs: [{ kind: "promise_to_pay", id: input.id }],
    outcome: "pending",
    createdAt: asOfDate,
    createdBy: "ai"
  };

  if (input.invoiceId) {
    output.invoiceId = input.invoiceId;
  }

  if (input.conditionText) {
    output.conditionText = input.conditionText;
  }

  return output;
}
