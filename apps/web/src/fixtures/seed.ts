/**
 * Realistic seed data for a simulated-day company.
 * Feeds cash-engine's rankNextBestActions and computeCashForecast.
 */
import { money } from "@runwayops/cash-engine";
import type {
  Invoice,
  PromiseToPay,
  CustomerPaymentStats,
  CriticalObligation,
  SupplierBill,
  BankTransaction,
} from "@runwayops/cash-engine";

const TODAY = new Date("2026-05-05");
const COMPANY_ID = "comp-meridian-001";

/* ---------- Customers ---------- */

export const customers = [
  {
    id: "cust-northstar",
    companyId: COMPANY_ID,
    displayName: "Northstar Consulting",
    relationshipTier: "strategic" as const,
    status: "active" as const,
  },
  {
    id: "cust-coastal",
    companyId: COMPANY_ID,
    displayName: "Coastal Holdings Ltd",
    relationshipTier: "standard" as const,
    status: "active" as const,
  },
  {
    id: "cust-summit",
    companyId: COMPANY_ID,
    displayName: "Summit Industries",
    relationshipTier: "watch" as const,
    status: "active" as const,
  },
  {
    id: "cust-apex",
    companyId: COMPANY_ID,
    displayName: "Apex Digital Solutions",
    relationshipTier: "standard" as const,
    status: "active" as const,
  },
  {
    id: "cust-harbour",
    companyId: COMPANY_ID,
    displayName: "Harbour Freight Services",
    relationshipTier: "low_touch" as const,
    status: "active" as const,
  },
] as const;

export const customersById = Object.fromEntries(
  customers.map((c) => [c.id, c]),
);

/* ---------- Invoices ---------- */

export const invoices: Invoice[] = [
  {
    id: "inv-1024",
    companyId: COMPANY_ID,
    customerId: "cust-northstar",
    customerName: "Northstar Consulting",
    invoiceNumber: "INV-1024",
    issueDate: "2026-04-01",
    dueDate: "2026-04-30",
    status: "overdue",
    amountDue: money(1_500_000, "GBP"),
    evidenceRefs: [{ kind: "invoice", id: "inv-1024", summary: "Q1 consulting retainer" }],
  },
  {
    id: "inv-1025",
    companyId: COMPANY_ID,
    customerId: "cust-coastal",
    customerName: "Coastal Holdings Ltd",
    invoiceNumber: "INV-1025",
    issueDate: "2026-03-15",
    dueDate: "2026-04-15",
    status: "overdue",
    amountDue: money(875_000, "GBP"),
    evidenceRefs: [{ kind: "invoice", id: "inv-1025", summary: "Project milestone 3" }],
  },
  {
    id: "inv-1026",
    companyId: COMPANY_ID,
    customerId: "cust-summit",
    customerName: "Summit Industries",
    invoiceNumber: "INV-1026",
    issueDate: "2026-04-10",
    dueDate: "2026-05-10",
    status: "sent",
    amountDue: money(2_200_000, "GBP"),
    evidenceRefs: [{ kind: "invoice", id: "inv-1026", summary: "Annual license fee" }],
  },
  {
    id: "inv-1027",
    companyId: COMPANY_ID,
    customerId: "cust-apex",
    customerName: "Apex Digital Solutions",
    invoiceNumber: "INV-1027",
    issueDate: "2026-04-05",
    dueDate: "2026-05-05",
    status: "overdue",
    amountDue: money(650_000, "GBP"),
    evidenceRefs: [{ kind: "invoice", id: "inv-1027", summary: "Website redesign phase 2" }],
  },
  {
    id: "inv-1028",
    companyId: COMPANY_ID,
    customerId: "cust-harbour",
    customerName: "Harbour Freight Services",
    invoiceNumber: "INV-1028",
    issueDate: "2026-03-20",
    dueDate: "2026-04-20",
    status: "overdue",
    amountDue: money(320_000, "GBP"),
    evidenceRefs: [{ kind: "invoice", id: "inv-1028", summary: "Logistics integration" }],
  },
];

export const invoicesById = Object.fromEntries(
  invoices.map((i) => [i.id, i]),
);

/* ---------- Promises ---------- */

export const promises: PromiseToPay[] = [
  {
    id: "ptp-001",
    companyId: COMPANY_ID,
    customerId: "cust-northstar",
    invoiceId: "inv-1024",
    amountPromised: money(1_500_000, "GBP"),
    promisedDate: "2026-05-09",
    promiseType: "conditional",
    conditionText: "PO re-approval required from procurement",
    extractedText:
      "We should be able to pay Friday once the PO is re-approved.",
    confidenceAtCreation: 0.42,
    evidenceConfidence: 0.5,
    evidenceRefs: [
      { kind: "communication_message", id: "msg-301", summary: "Customer email 2026-04-28" },
      { kind: "customer_stat", id: "stat-northstar", summary: "Promise kept rate 60%" },
    ],
    outcome: "pending",
    createdAt: "2026-04-28",
    createdBy: "ai",
  },
  {
    id: "ptp-002",
    companyId: COMPANY_ID,
    customerId: "cust-apex",
    invoiceId: "inv-1027",
    amountPromised: money(650_000, "GBP"),
    promisedDate: "2026-05-07",
    promiseType: "firm",
    extractedText: "Payment will be made by Wednesday.",
    confidenceAtCreation: 0.75,
    evidenceConfidence: 0.8,
    evidenceRefs: [
      { kind: "communication_message", id: "msg-305", summary: "Customer email 2026-05-02" },
    ],
    outcome: "pending",
    createdAt: "2026-05-02",
    createdBy: "ai",
  },
];

/* ---------- Customer Stats ---------- */

export const customerStats: CustomerPaymentStats[] = [
  {
    customerId: "cust-northstar",
    averageDaysLate: 8,
    promiseKeptRate: 0.6,
    conditionalPromiseKeptRate: 0.42,
    disputeRate: 0.05,
    paymentAfterActionRate: 0.7,
    lastSuccessfulChannel: "email",
    lastSuccessfulTone: "neutral",
    relationshipRisk: 0.15,
    evidenceRefs: [{ kind: "customer_stat", id: "stat-northstar" }],
  },
  {
    customerId: "cust-coastal",
    averageDaysLate: 22,
    promiseKeptRate: 0.35,
    conditionalPromiseKeptRate: 0.2,
    disputeRate: 0.15,
    paymentAfterActionRate: 0.45,
    brokenPromiseCount: 4,
    lastSuccessfulChannel: "phone",
    lastSuccessfulTone: "firm",
    relationshipRisk: 0.4,
    evidenceRefs: [{ kind: "customer_stat", id: "stat-coastal" }],
  },
  {
    customerId: "cust-summit",
    averageDaysLate: 15,
    promiseKeptRate: 0.5,
    disputeRate: 0.3,
    paymentAfterActionRate: 0.3,
    lastSuccessfulChannel: "email",
    lastSuccessfulTone: "firm",
    relationshipRisk: 0.5,
    evidenceRefs: [{ kind: "customer_stat", id: "stat-summit" }],
  },
  {
    customerId: "cust-apex",
    averageDaysLate: 3,
    promiseKeptRate: 0.85,
    conditionalPromiseKeptRate: 0.7,
    disputeRate: 0.02,
    paymentAfterActionRate: 0.8,
    lastSuccessfulChannel: "email",
    lastSuccessfulTone: "friendly",
    relationshipRisk: 0.05,
    evidenceRefs: [{ kind: "customer_stat", id: "stat-apex" }],
  },
  {
    customerId: "cust-harbour",
    averageDaysLate: 12,
    promiseKeptRate: 0.55,
    disputeRate: 0.1,
    paymentAfterActionRate: 0.5,
    lastSuccessfulChannel: "email",
    lastSuccessfulTone: "neutral",
    relationshipRisk: 0.2,
    evidenceRefs: [{ kind: "customer_stat", id: "stat-harbour" }],
  },
];

/* ---------- Obligations ---------- */

export const obligations: CriticalObligation[] = [
  {
    id: "obl-payroll",
    companyId: COMPANY_ID,
    obligationType: "payroll",
    counterpartyName: "HMRC PAYE + Staff",
    dueDate: "2026-05-10",
    amount: money(4_500_000, "GBP"),
    criticality: "critical",
    status: "scheduled",
    evidenceRefs: [{ kind: "obligation", id: "obl-payroll", summary: "May payroll" }],
  },
  {
    id: "obl-tax",
    companyId: COMPANY_ID,
    obligationType: "tax",
    counterpartyName: "HMRC VAT",
    dueDate: "2026-05-17",
    amount: money(1_200_000, "GBP"),
    criticality: "high",
    status: "scheduled",
    evidenceRefs: [{ kind: "obligation", id: "obl-tax", summary: "Q1 VAT return" }],
  },
  {
    id: "obl-rent",
    companyId: COMPANY_ID,
    obligationType: "rent",
    counterpartyName: "Regus Office Space",
    dueDate: "2026-05-25",
    amount: money(350_000, "GBP"),
    criticality: "medium",
    status: "scheduled",
    evidenceRefs: [{ kind: "obligation", id: "obl-rent", summary: "May office rent" }],
  },
];

/* ---------- Supplier Bills ---------- */

export const supplierBills: SupplierBill[] = [
  {
    id: "bill-aws",
    companyId: COMPANY_ID,
    supplierName: "AWS",
    dueDate: "2026-05-15",
    amount: money(280_000, "GBP"),
    criticality: "medium",
    status: "open",
    evidenceRefs: [{ kind: "source_object", id: "bill-aws" }],
  },
];

/* ---------- Bank Transactions (recent) ---------- */

export const bankTransactions: BankTransaction[] = [
  {
    id: "bt-001",
    companyId: COMPANY_ID,
    postedDate: "2026-05-03",
    amount: money(250_000, "GBP"),
    direction: "credit",
    counterpartyName: "Apex Digital Solutions",
    reference: "INV-1027-PART",
    status: "posted",
    evidenceRefs: [{ kind: "bank_transaction", id: "bt-001" }],
  },
];

/* ---------- Exports ---------- */

export const COMPANY = {
  id: COMPANY_ID,
  displayName: "Meridian Tech Solutions Ltd",
  baseCurrency: "GBP",
  timezone: "Europe/London",
} as const;

export const AS_OF_DATE = TODAY;
export const GENERATED_AT = TODAY;
