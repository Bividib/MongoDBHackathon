import { and, asc, eq, inArray, lte } from "drizzle-orm";

import { type InvoiceStatus, money } from "@runwayops/domain";
import type { Invoice as EngineInvoice } from "@runwayops/cash-engine";

import { invoices } from "../schema/invoices.js";
import { customers } from "../schema/customers.js";
import type { DbHandle } from "./tenant.js";

export type InvoiceRow = typeof invoices.$inferSelect;

const OPEN_STATUSES: readonly InvoiceStatus[] = [
  "draft",
  "authorised",
  "sent",
  "partially_paid",
  "overdue",
] as const;

/**
 * Project a DB row into the cash-engine `Invoice` shape. The engine takes
 * a denormalized projection — we hydrate it here so activity code can hand
 * the array straight to `computeCashForecast` / `rankNextBestActions`.
 */
function rowToEngineInvoice(
  row: InvoiceRow,
  customerName?: string,
): EngineInvoice {
  const inv: EngineInvoice = {
    id: row.id,
    companyId: row.companyId,
    customerId: row.customerId,
    issueDate: row.issueDate ?? row.createdAt.toISOString().slice(0, 10),
    dueDate: row.dueDate ?? row.createdAt.toISOString().slice(0, 10),
    status: row.status as InvoiceStatus,
    amountDue: money(row.amountDueMinor.toString(), row.currency),
    amountPaid: money(row.amountPaidMinor.toString(), row.currency),
  };
  if (row.invoiceNumber) inv.invoiceNumber = row.invoiceNumber;
  if (customerName) inv.customerName = customerName;
  return inv;
}

/**
 * List invoices by company + status set, joining customer name. Used by
 * the workers fact-loader to feed `cash-engine.computeCashForecast`. The
 * default status set is "anything that still has cash to collect" — open
 * statuses + overdue, deliberately excluding paid/voided/written_off.
 */
export async function listOpenInvoicesForCompany(
  handle: DbHandle,
  input: { companyId: string; statuses?: readonly InvoiceStatus[]; limit?: number },
): Promise<EngineInvoice[]> {
  const rows = await handle
    .select({
      invoice: invoices,
      customerName: customers.displayName,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(
      and(
        eq(invoices.companyId, input.companyId),
        inArray(
          invoices.status,
          (input.statuses ?? OPEN_STATUSES) as unknown as string[],
        ),
      ),
    )
    .orderBy(asc(invoices.dueDate))
    .limit(input.limit ?? 500);

  return rows.map((r) =>
    rowToEngineInvoice(r.invoice, r.customerName ?? undefined),
  );
}

/**
 * List invoices that are overdue as of a given date (any open status with
 * `due_date <= asOf`). The engine treats overdue specifically when ranking
 * priority.
 */
export async function listOverdueInvoicesForCompany(
  handle: DbHandle,
  input: { companyId: string; asOf: Date; limit?: number },
): Promise<EngineInvoice[]> {
  const asOfStr = input.asOf.toISOString().slice(0, 10);
  const rows = await handle
    .select({
      invoice: invoices,
      customerName: customers.displayName,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(
      and(
        eq(invoices.companyId, input.companyId),
        inArray(invoices.status, OPEN_STATUSES as unknown as string[]),
        lte(invoices.dueDate, asOfStr),
      ),
    )
    .orderBy(asc(invoices.dueDate))
    .limit(input.limit ?? 500);

  return rows.map((r) =>
    rowToEngineInvoice(r.invoice, r.customerName ?? undefined),
  );
}

export async function getInvoiceById(
  handle: DbHandle,
  input: { companyId: string; id: string },
): Promise<EngineInvoice | null> {
  const rows = await handle
    .select({
      invoice: invoices,
      customerName: customers.displayName,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(eq(invoices.companyId, input.companyId), eq(invoices.id, input.id)))
    .limit(1);
  return rows.length === 1
    ? rowToEngineInvoice(rows[0]!.invoice, rows[0]!.customerName ?? undefined)
    : null;
}
