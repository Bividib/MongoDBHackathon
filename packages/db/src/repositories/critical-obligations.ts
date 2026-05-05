import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

import {
  type ObligationCriticality,
  type ObligationStatus,
  type ObligationType,
  money,
} from "@runwayops/domain";
import type {
  CriticalObligation as EngineCriticalObligation,
  Criticality,
} from "@runwayops/cash-engine";

import { criticalObligations } from "../schema/obligations.js";
import type { DbHandle } from "./tenant.js";

export type CriticalObligationRow = typeof criticalObligations.$inferSelect;

type EngineStatus = EngineCriticalObligation["status"];
type EngineObligationType = EngineCriticalObligation["obligationType"];

const ENGINE_OBLIGATION_TYPES = new Set<EngineObligationType>([
  "payroll",
  "tax",
  "rent",
  "loan",
  "supplier",
  "contractor",
  "other",
]);

/**
 * Domain `ObligationStatus` and engine `CriticalObligation.status` overlap on
 * everything except domain "cancelled" → engine "cancelled" and the engine's
 * extra "due" alias. We pass through the matching values and fall back to
 * "due" only for the domain-only "due" status (which the engine treats as
 * actionable but unscheduled).
 */
function mapStatus(domainStatus: ObligationStatus): EngineStatus {
  switch (domainStatus) {
    case "scheduled":
    case "paid":
    case "cancelled":
    case "deferred":
    case "overdue":
      return domainStatus;
    case "due":
      return "due";
    default: {
      const _exhaustive: never = domainStatus;
      void _exhaustive;
      return "scheduled";
    }
  }
}

function rowToEngineCriticalObligation(row: CriticalObligationRow): EngineCriticalObligation {
  const obligationType = ENGINE_OBLIGATION_TYPES.has(row.obligationType as EngineObligationType)
    ? (row.obligationType as EngineObligationType)
    : "other";

  return {
    id: row.id,
    companyId: row.companyId,
    obligationType,
    counterpartyName: row.counterpartyName,
    dueDate: row.dueDate,
    amount: money(row.amountMinor.toString(), row.currency),
    criticality: row.criticality as Criticality,
    status: mapStatus(row.status as ObligationStatus),
  };
}

const OPEN_STATUSES: readonly ObligationStatus[] = [
  "scheduled",
  "due",
  "deferred",
  "overdue",
] as const;

/**
 * List open critical obligations for a company within an optional due-date
 * window. The cash-engine forecast prioritizes obligations by criticality
 * and due-date proximity; passing the full open set lets the engine decide.
 */
export async function listOpenCriticalObligationsForCompany(
  handle: DbHandle,
  input: {
    companyId: string;
    untilDueDate?: string;
    sinceDueDate?: string;
    criticalities?: readonly ObligationCriticality[];
    limit?: number;
  },
): Promise<EngineCriticalObligation[]> {
  const filters = [
    eq(criticalObligations.companyId, input.companyId),
    inArray(criticalObligations.status, OPEN_STATUSES as unknown as string[]),
  ];
  if (input.untilDueDate) filters.push(lte(criticalObligations.dueDate, input.untilDueDate));
  if (input.sinceDueDate) filters.push(gte(criticalObligations.dueDate, input.sinceDueDate));
  if (input.criticalities && input.criticalities.length > 0) {
    filters.push(
      inArray(criticalObligations.criticality, input.criticalities as unknown as string[]),
    );
  }

  const rows = await handle
    .select()
    .from(criticalObligations)
    .where(and(...filters))
    .orderBy(asc(criticalObligations.dueDate))
    .limit(input.limit ?? 500);

  return rows.map(rowToEngineCriticalObligation);
}

export async function getCriticalObligationById(
  handle: DbHandle,
  input: { companyId: string; id: string },
): Promise<EngineCriticalObligation | null> {
  const rows = await handle
    .select()
    .from(criticalObligations)
    .where(
      and(
        eq(criticalObligations.companyId, input.companyId),
        eq(criticalObligations.id, input.id),
      ),
    )
    .limit(1);
  return rows.length === 1 ? rowToEngineCriticalObligation(rows[0]!) : null;
}

export type {
  ObligationCriticality,
  ObligationStatus,
  ObligationType,
};
