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

export async function computeShortfall(
  _input: ComputeShortfallInput
): Promise<ShortfallSummary> {
  // TODO: call cash-engine shortfall computation with loaded facts
  return {
    shortfallMinor: 22_500_00,
    currency: "GBP",
    riskStatus: "high"
  };
}

export async function identifyCollectableInvoices(
  input: IdentifyCollectableInvoicesInput
): Promise<CollectableInvoicesSummary> {
  // Gap: needs invoice listing repo with filters
  return {
    invoiceIds: [
      `${input.idempotencyKey}:invoice:1`,
      `${input.idempotencyKey}:invoice:2`,
      `${input.idempotencyKey}:invoice:3`
    ],
    totalCollectableMinor: 28_000_00,
    currency: input.currency
  };
}

export async function identifySupplierTimingOptions(
  input: IdentifySupplierTimingInput
): Promise<SupplierTimingSummary> {
  // Gap: needs supplier bill repo with timing analysis
  return {
    supplierIds: [`${input.idempotencyKey}:supplier:1`],
    totalDeferralMinor: 5_500_00,
    currency: "GBP"
  };
}

/**
 * FAIL_FAST disposition. External action execution. In this round we do
 * NOT call any external API — just log success.
 */
export async function executeApprovedActions(
  input: ExecuteApprovedActionsInput
): Promise<ExecutionSummary> {
  // Round 3: no real external action. Returns success.
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
  // Round 3: no real external action to revoke.
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
