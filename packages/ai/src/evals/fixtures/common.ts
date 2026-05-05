import type { EvidenceRef, InvoiceContext } from "../../schemas/index.js";

export const TODAY = "2026-05-04";

export const customerEmailEvidence = (id: string, excerpt: string): EvidenceRef => ({
  kind: "communication_message",
  id,
  summary: excerpt,
  sourceProvider: "manual_email",
});

export const invoiceFixture: InvoiceContext = {
  invoice_id: "inv_1001",
  invoice_number: "INV-1001",
  amount_due_minor: "120000",
  currency: "GBP",
  due_date: "2026-04-25",
  customer_name: "Northstar Studios",
};
