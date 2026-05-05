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

export async function openCase(input: OpenCaseInput): Promise<CaseRecordSummary> {
  return {
    caseId: input.caseId,
    obligationId: input.obligationId,
    openedAtIso: "2026-05-04T09:00:00.000Z"
  };
}

export async function computeShortfall(
  _input: ComputeShortfallInput
): Promise<ShortfallSummary> {
  return {
    shortfallMinor: 22_500_00,
    currency: "GBP",
    riskStatus: "high"
  };
}

export async function identifyCollectableInvoices(
  input: IdentifyCollectableInvoicesInput
): Promise<CollectableInvoicesSummary> {
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
  return {
    supplierIds: [`${input.idempotencyKey}:supplier:1`],
    totalDeferralMinor: 5_500_00,
    currency: "GBP"
  };
}

/**
 * FAIL_FAST disposition. The workflow wraps this call in compensation logic
 * (`revokeExternalAction` if any side effect was applied) and falls through
 * to a paused-for-human state if compensation cannot complete.
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
 * Compensation activity. RETRY-bounded: 3 attempts; if all fail the case
 * workflow transitions to HUMAN_INTERVENTION via signal-condition.
 */
export async function revokeExternalAction(
  input: RevokeExternalActionInput
): Promise<{ revoked: boolean }> {
  return { revoked: true };
}

/**
 * HUMAN_INTERVENTION disposition. Real implementation will create a case
 * record on a downstream service. If the call fails the workflow surfaces
 * the failure to operators rather than retrying silently.
 */
export async function openEscalationCase(
  input: OpenEscalationCaseInput
): Promise<CaseRecordSummary> {
  return {
    caseId: `${input.idempotencyKey}:escalation`,
    obligationId: "obligation:escalated",
    openedAtIso: "2026-05-04T09:00:00.000Z"
  };
}

export async function closeOrEscalate(input: CloseOrEscalateInput): Promise<CaseClosureSummary> {
  return {
    caseId: input.caseId,
    status: "closed",
    closedAtIso: "2026-05-04T18:00:00.000Z"
  };
}
