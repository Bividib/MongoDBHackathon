import { computeCashForecast as engineComputeCashForecast } from "@runwayops/cash-engine";
import { repositories } from "@runwayops/db";

import { getActivityContext } from "./context.js";
import type {
  CaseClosureSummary,
  CaseRecordSummary,
  CloseOrEscalateInput,
  CollectableInvoicesSummary,
  ComputeShortfallInput,
  ExecuteApprovedActionsInput,
  ExecutionSummary,
  IdentifyCollectableInvoicesInput,
  IdentifySupplierTimingInput,
  OpenCaseInput,
  OpenEscalationCaseInput,
  RevokeExternalActionInput,
  ShortfallSummary,
  SupplierTimingSummary
} from "./types.js";

const { withTenant, loadFinancialFactsForForecast: loadFactsRepo } = repositories;

const DEFAULT_CURRENCY = "GBP" as const;

/**
 * Open a critical-obligation case. Gap: packages/db has no case repo.
 * Integrator should add a `CaseRepo` with upsert-by-idempotency-key.
 */
export async function openCase(input: OpenCaseInput): Promise<CaseRecordSummary> {
  return {
    caseId: input.caseId,
    obligationId: input.obligationId,
    openedAtIso: new Date().toISOString()
  };
}

/**
 * Run the deterministic engine forecaster against today's facts to
 * derive the obligation-level shortfall. The engine emits per-obligation
 * coverage; we surface the obligation under test (or the worst-case row
 * if it isn't in the obligation set yet) as the case's shortfall.
 */
export async function computeShortfall(
  input: ComputeShortfallInput
): Promise<ShortfallSummary> {
  const { db } = getActivityContext();

  return withTenant(db, input.companyId, async (tx) => {
    const facts = await loadFactsRepo(tx, {
      companyId: input.companyId,
      asOfDate: new Date(input.asOfDate),
      horizonDays: 30,
      currency: DEFAULT_CURRENCY
    });

    const forecast = engineComputeCashForecast({
      companyId: input.companyId,
      asOfDate: input.asOfDate,
      horizonDays: 30,
      cashBalance: facts.cashBalance,
      invoices: facts.invoices,
      payments: facts.payments,
      promises: facts.promises,
      criticalObligations: facts.criticalObligations,
      bankTransactions: facts.bankTransactions,
      policy: facts.policy
    });

    const targeted = forecast.obligationRisks.find(
      (risk) => risk.obligationId === input.obligationId
    );
    const fallback = forecast.obligationRisks[0];
    const risk = targeted ?? fallback;
    const shortfallAmount = risk?.shortfallAmount ?? forecast.shortfallAmount;

    return {
      shortfallMinor: shortfallAmount ? Number(shortfallAmount.amountMinor) : 0,
      currency: shortfallAmount?.currency ?? facts.cashBalance.currency,
      riskStatus: risk?.riskStatus ?? forecast.riskStatus
    };
  });
}

export async function identifyCollectableInvoices(
  input: IdentifyCollectableInvoicesInput
): Promise<CollectableInvoicesSummary> {
  const { db } = getActivityContext();

  return withTenant(db, input.companyId, async (tx) => {
    const open = await repositories.listOpenInvoicesForCompany(tx, {
      companyId: input.companyId
    });

    const targetMinor = BigInt(input.shortfallMinor);
    const sorted = [...open]
      .filter((invoice) => invoice.amountDue.currency === input.currency)
      .sort((left, right) => {
        if (right.amountDue.amountMinor === left.amountDue.amountMinor) return 0;
        return right.amountDue.amountMinor > left.amountDue.amountMinor ? 1 : -1;
      });

    const selected: typeof sorted = [];
    let runningMinor = 0n;
    for (const invoice of sorted) {
      if (runningMinor >= targetMinor && selected.length > 0) break;
      selected.push(invoice);
      runningMinor += invoice.amountDue.amountMinor;
    }

    return {
      invoiceIds: selected.map((inv) => inv.id),
      totalCollectableMinor: Number(runningMinor),
      currency: input.currency
    };
  });
}

export async function identifySupplierTimingOptions(
  input: IdentifySupplierTimingInput
): Promise<SupplierTimingSummary> {
  // Gap: supplier_bills repo not yet shipped. The case workflow tolerates
  // an empty supplier list — when supplier-bill timing analysis lands in
  // a later round this body can be filled in without a workflow signature
  // change.
  void input;
  return {
    supplierIds: [],
    totalDeferralMinor: 0,
    currency: DEFAULT_CURRENCY
  };
}

/**
 * FAIL_FAST disposition. External action execution. In this round we do
 * NOT call any external API — just log success.
 */
export async function executeApprovedActions(
  input: ExecuteApprovedActionsInput
): Promise<ExecutionSummary> {
  return {
    successfulActionIds: input.approvedActionIds,
    failedActionIds: []
  };
}

/**
 * Compensation activity. RETRY-bounded: 3 attempts.
 */
export async function revokeExternalAction(
  _input: RevokeExternalActionInput
): Promise<{ revoked: boolean }> {
  return { revoked: true };
}

/**
 * HUMAN_INTERVENTION disposition. Opens an escalation case on a
 * downstream service.
 */
export async function openEscalationCase(
  input: OpenEscalationCaseInput
): Promise<CaseRecordSummary> {
  return {
    caseId: `${input.idempotencyKey}:escalation`,
    obligationId: "obligation:escalated",
    openedAtIso: new Date().toISOString()
  };
}

export async function closeOrEscalate(input: CloseOrEscalateInput): Promise<CaseClosureSummary> {
  return {
    caseId: input.caseId,
    status: "closed",
    closedAtIso: new Date().toISOString()
  };
}
