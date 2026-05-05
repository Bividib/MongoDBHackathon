import { and, desc, eq, gte, lte } from "drizzle-orm";

import { money } from "@runwayops/domain";
import type { Payment as EnginePayment } from "@runwayops/cash-engine";

import { payments } from "../schema/payments.js";
import type { DbHandle } from "./tenant.js";

export type PaymentRow = typeof payments.$inferSelect;

type EngineProviderStatus = NonNullable<EnginePayment["providerStatus"]>;

const ENGINE_PROVIDER_STATUSES = new Set<EngineProviderStatus>([
  "pending",
  "posted",
  "settled",
  "failed",
  "reversed",
]);

/**
 * Project a DB payments row into the cash-engine `Payment` shape. The engine
 * accepts a narrower providerStatus set than the domain (no "unknown"); for
 * out-of-set values we omit the field rather than fabricate a value.
 */
function rowToEnginePayment(row: PaymentRow): EnginePayment {
  const out: EnginePayment = {
    id: row.id,
    companyId: row.companyId,
    customerId: row.customerId ?? undefined,
    invoiceId: row.invoiceId ?? undefined,
    paymentDate: row.paymentDate,
    amount: money(row.amountMinor.toString(), row.currency),
  };
  if (ENGINE_PROVIDER_STATUSES.has(row.providerStatus as EngineProviderStatus)) {
    out.providerStatus = row.providerStatus as EngineProviderStatus;
  }
  return out;
}

/**
 * List recent payments for a company, optionally bounded by `paymentDate`.
 * Used by the workers fact-loader to feed the cash-engine — engine-side
 * forecast logic ignores anything older than the lookback window, so the
 * default 90-day cap keeps the fact set small without losing precision.
 */
export async function listRecentPaymentsForCompany(
  handle: DbHandle,
  input: {
    companyId: string;
    sinceDate?: string;
    untilDate?: string;
    limit?: number;
  },
): Promise<EnginePayment[]> {
  const filters = [eq(payments.companyId, input.companyId)];
  if (input.sinceDate) filters.push(gte(payments.paymentDate, input.sinceDate));
  if (input.untilDate) filters.push(lte(payments.paymentDate, input.untilDate));

  const rows = await handle
    .select()
    .from(payments)
    .where(and(...filters))
    .orderBy(desc(payments.paymentDate))
    .limit(input.limit ?? 500);

  return rows.map(rowToEnginePayment);
}

export async function listPaymentsForInvoice(
  handle: DbHandle,
  input: { companyId: string; invoiceId: string },
): Promise<EnginePayment[]> {
  const rows = await handle
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.companyId, input.companyId),
        eq(payments.invoiceId, input.invoiceId),
      ),
    )
    .orderBy(desc(payments.paymentDate));
  return rows.map(rowToEnginePayment);
}

export async function getPaymentById(
  handle: DbHandle,
  input: { companyId: string; id: string },
): Promise<EnginePayment | null> {
  const rows = await handle
    .select()
    .from(payments)
    .where(and(eq(payments.companyId, input.companyId), eq(payments.id, input.id)))
    .limit(1);
  return rows.length === 1 ? rowToEnginePayment(rows[0]!) : null;
}
