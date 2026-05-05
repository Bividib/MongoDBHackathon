import { ApplicationFailure, condition, setHandler, sleep } from "@temporalio/workflow";

import type {
  ApprovalRequestSummary,
  ExecutionSummary,
  MessageDraftSummary,
  ShortfallSummary
} from "../activities/types.js";
import {
  approvalEditedSignal,
  approvalGrantedSignal,
  approvalRejectedSignal,
  bankTransactionPostedSignal,
  caseCloseRequestSignal,
  caseResolutionEvidenceSignal,
  customerReplyReceivedSignal,
  obligationDueSoonSignal
} from "../signals.js";
import type {
  ApprovalDecisionPayload,
  BankTransactionPostedPayload,
  CaseCloseRequestPayload,
  CaseResolutionEvidencePayload,
  CustomerReplyReceivedPayload,
  ObligationDueSoonPayload
} from "../signal-types.js";
import {
  getCaseSummaryQuery,
  getOutstandingApprovalsQuery
} from "../queries.js";
import type {
  CaseSummary,
  OutstandingApprovalsView,
  WorkflowPhase
} from "../query-types.js";

import { acts, compensateActs, failFastActs } from "./activity-proxies.js";

export interface CriticalObligationCaseInput {
  companyId: string;
  caseId: string;
  obligationId: string;
}

export interface CriticalObligationCaseResult {
  cycleKey: string;
  caseId: string;
  outcome: "closed" | "escalated" | "paused_for_human";
  rounds: number;
  approvedActions: number;
  rejectedActions: number;
  executedActions: number;
  pausedReason?: string | undefined;
}

/**
 * Critical-obligation case mode is **scoped past Round 4** (Phase 11+).
 * The workflow itself is structurally complete and replay-deterministic
 * — it sits in the harness so the dispatcher / signal plumbing can be
 * exercised end-to-end. The pieces that need real backing before we
 * graduate this beyond simulation:
 *   - `case_files` table and a repo to persist case state.
 *   - `identifySupplierTimingOptions` activity needs `supplier_bills`
 *     plus a real supplier-timing engine (Round 5+).
 *   - Voice channel revival from `legacy/` for in-case calls.
 * Until then, treat this workflow as wired but not on the daily-loop
 * critical path.
 */
export async function CriticalObligationCaseWorkflow(
  input: CriticalObligationCaseInput
): Promise<CriticalObligationCaseResult> {
  const cycleKey = `critical-obligation:${input.caseId}`;

  let phase: WorkflowPhase = "initializing";
  let rounds = 0;
  let approvedActions = 0;
  let rejectedActions = 0;
  let editedActions = 0;
  let executedActions = 0;
  let pausedReason: string | undefined;

  const approvalState = new Map<string, ApprovalRequestSummary>();
  const evidenceReceived: CaseResolutionEvidencePayload[] = [];
  const replies: CustomerReplyReceivedPayload[] = [];
  const bankEvents: BankTransactionPostedPayload[] = [];
  const obligationAlerts: ObligationDueSoonPayload[] = [];
  let closeRequest: CaseCloseRequestPayload | undefined;

  let materialSignalsTick = 0;
  const bumpMaterialSignals = (): void => {
    materialSignalsTick += 1;
  };

  let lastShortfall: ShortfallSummary = {
    shortfallMinor: 0,
    currency: "GBP",
    riskStatus: "watch"
  };

  setHandler(getCaseSummaryQuery, (): CaseSummary => ({
    cycleKey,
    caseId: input.caseId,
    obligationId: input.obligationId,
    phase,
    shortfallAmountMinor: lastShortfall.shortfallMinor,
    currency: lastShortfall.currency,
    approvalsOutstanding: countWhere(approvalState, (a) => a.decision === undefined),
    resolutionEvidenceCount: evidenceReceived.length,
    closeRequested: closeRequest !== undefined
  }));

  setHandler(getOutstandingApprovalsQuery, (): OutstandingApprovalsView => ({
    pending: Array.from(approvalState.values())
      .filter((a) => a.decision === undefined)
      .map((a) => ({
        approvalRequestId: a.approvalRequestId,
        subjectId: a.subjectId,
        subjectKind: a.subjectKind,
        requestedAtIso: ""
      }))
  }));

  setHandler(approvalGrantedSignal, (payload: ApprovalDecisionPayload) => {
    const existing = approvalState.get(payload.approvalRequestId);
    if (!existing || existing.decision !== undefined) return;
    approvalState.set(payload.approvalRequestId, { ...existing, decision: "approved" });
    approvedActions += 1;
    bumpMaterialSignals();
  });
  setHandler(approvalRejectedSignal, (payload: ApprovalDecisionPayload) => {
    const existing = approvalState.get(payload.approvalRequestId);
    if (!existing || existing.decision !== undefined) return;
    approvalState.set(payload.approvalRequestId, { ...existing, decision: "rejected" });
    rejectedActions += 1;
    bumpMaterialSignals();
  });
  setHandler(approvalEditedSignal, (payload: ApprovalDecisionPayload) => {
    const existing = approvalState.get(payload.approvalRequestId);
    if (!existing || existing.decision !== undefined) return;
    approvalState.set(payload.approvalRequestId, { ...existing, decision: "edited" });
    editedActions += 1;
    bumpMaterialSignals();
  });
  setHandler(customerReplyReceivedSignal, (payload) => {
    replies.push(payload);
    bumpMaterialSignals();
  });
  setHandler(bankTransactionPostedSignal, (payload) => {
    bankEvents.push(payload);
    bumpMaterialSignals();
  });
  setHandler(obligationDueSoonSignal, (payload) => {
    obligationAlerts.push(payload);
    bumpMaterialSignals();
  });
  setHandler(caseResolutionEvidenceSignal, (payload) => {
    evidenceReceived.push(payload);
    bumpMaterialSignals();
  });
  setHandler(caseCloseRequestSignal, (payload) => {
    closeRequest = payload;
    bumpMaterialSignals();
  });

  // 1. open case
  phase = "loading";
  const policy = await acts.loadCompanyPolicy({ companyId: input.companyId });
  await acts.openCase({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:open`,
    caseId: input.caseId,
    obligationId: input.obligationId
  });

  // 2. compute shortfall
  phase = "computing";
  lastShortfall = await acts.computeShortfall({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:shortfall:0`,
    caseId: input.caseId,
    obligationId: input.obligationId,
    asOfDate: deriveAsOfDate(input)
  });

  // 3. invoices + supplier timing
  const invoices = await acts.identifyCollectableInvoices({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:invoices`,
    caseId: input.caseId,
    shortfallMinor: lastShortfall.shortfallMinor,
    currency: lastShortfall.currency
  });
  const supplierTiming = await acts.identifySupplierTimingOptions({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:suppliers`,
    caseId: input.caseId,
    obligationId: input.obligationId
  });

  // 4. drafts
  phase = "drafting";
  const customerDrafts = await acts.draftCustomerActions({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:customer-drafts`,
    caseId: input.caseId,
    invoiceIds: invoices.invoiceIds
  });
  const supplierDrafts = await acts.draftSupplierActions({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:supplier-drafts`,
    caseId: input.caseId,
    supplierIds: supplierTiming.supplierIds
  });
  const allDrafts: MessageDraftSummary[] = [...customerDrafts, ...supplierDrafts];

  // 5. approval requests
  const requests = await acts.createApprovalRequests({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:approvals`,
    subjects: allDrafts.map((d) => ({
      subjectKind: "message_draft",
      subjectId: d.draftId,
      riskSummary: "Critical-obligation case action draft"
    }))
  });
  for (const r of requests) approvalState.set(r.approvalRequestId, r);

  // 6. wait loop. The case continues replanning until close request +
  // resolution evidence both arrive.
  while (true) {
    rounds += 1;
    phase = "awaiting_signal";

    const tickAtRoundStart = materialSignalsTick;
    await Promise.race([
      sleep(policy.caseReplanIntervalMs),
      condition(
        () =>
          materialSignalsTick > tickAtRoundStart &&
          (closeRequest !== undefined ||
            evidenceReceived.length > 0 ||
            countWhere(approvalState, (a) => a.decision !== undefined) > 0)
      )
    ]);

    // execute any newly-approved actions (COMPENSATE-aware)
    const newlyApproved = pickActionableApprovals(approvalState);
    if (newlyApproved.length > 0) {
      phase = "executing";
      const result = await safelyExecute({
        companyId: input.companyId,
        idempotencyKey: `${cycleKey}:execute:${rounds}`,
        caseId: input.caseId,
        approvedActionIds: newlyApproved
      });
      if (result.kind === "executed") {
        executedActions += result.summary.successfulActionIds.length;
      } else {
        pausedReason = result.reason;
        phase = "awaiting_human";
        // Wait for an explicit human signal before continuing — the
        // operator must either close the case or override.
        await condition(() => closeRequest !== undefined);
      }
    }

    // replan
    phase = "computing";
    const replan = await acts.replanForecast({
      companyId: input.companyId,
      idempotencyKey: `${cycleKey}:replan:${rounds}`,
      caseId: input.caseId,
      asOfDate: deriveAsOfDate(input),
      triggerEventIds: replies.map((r) => r.messageEventId)
    });
    lastShortfall = {
      shortfallMinor: replan.shortfallMinor ?? 0,
      currency: replan.currency,
      riskStatus: replan.riskStatus
    };

    // close criteria: explicit close request AND resolution evidence
    if (closeRequest !== undefined && evidenceReceived.length > 0) break;

    // safety: hard cap on rounds keeps replays bounded in tests
    if (rounds >= 24) {
      pausedReason = pausedReason ?? "max_rounds_exceeded";
      break;
    }
  }

  // 7. close or escalate
  phase = "closing";
  const closure = await acts.closeOrEscalate({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:close`,
    caseId: input.caseId,
    resolutionSummary: closeRequest?.resolutionSummary ?? "case closed without explicit summary",
    evidenceIds: evidenceReceived.map((e) => e.evidenceId),
    closedByUserId: closeRequest?.requestedByUserId ?? "system"
  });

  await acts.writeMemoryAndAudit({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:audit:close`,
    action: closure.status === "closed" ? "case.closed" : "case.escalated",
    targetKind: "domain_event",
    targetId: input.caseId,
    summary: `Case ${closure.status} after ${rounds} rounds`
  });

  phase = pausedReason ? "awaiting_human" : closure.status === "closed" ? "completed" : "failed";
  const outcome: CriticalObligationCaseResult["outcome"] = pausedReason
    ? "paused_for_human"
    : closure.status === "closed"
      ? "closed"
      : "escalated";

  return {
    cycleKey,
    caseId: input.caseId,
    outcome,
    rounds,
    approvedActions,
    rejectedActions,
    executedActions,
    pausedReason
  };
}

type ExecuteResult =
  | { kind: "executed"; summary: ExecutionSummary }
  | { kind: "paused"; reason: string };

async function safelyExecute(input: {
  companyId: string;
  idempotencyKey: string;
  caseId: string;
  approvedActionIds: string[];
}): Promise<ExecuteResult> {
  try {
    const summary = await failFastActs.executeApprovedActions(input);
    if (summary.failedActionIds.length === 0) {
      return { kind: "executed", summary };
    }
    // Some actions failed: compensate the partial set, then escalate.
    let revokeFailed = false;
    for (const failedId of summary.failedActionIds) {
      try {
        await compensateActs.revokeExternalAction({
          companyId: input.companyId,
          idempotencyKey: `${input.idempotencyKey}:revoke:${failedId}`,
          caseId: input.caseId,
          actionId: failedId,
          reason: "execution_failure"
        });
      } catch {
        revokeFailed = true;
      }
    }
    return revokeFailed
      ? { kind: "paused", reason: "compensation_failed" }
      : { kind: "executed", summary };
  } catch (error: unknown) {
    if (error instanceof ApplicationFailure && error.nonRetryable) {
      return { kind: "paused", reason: error.message };
    }
    return { kind: "paused", reason: "unexpected_execution_error" };
  }
}

function pickActionableApprovals(
  approvals: Map<string, ApprovalRequestSummary>
): string[] {
  return Array.from(approvals.values())
    .filter((a) => a.decision === "approved")
    .map((a) => a.subjectId);
}

function countWhere<K, V>(map: Map<K, V>, pred: (v: V) => boolean): number {
  let n = 0;
  for (const v of map.values()) if (pred(v)) n += 1;
  return n;
}

function deriveAsOfDate(input: CriticalObligationCaseInput): string {
  // The case workflow does not have an `asOfDate` input; we use the
  // caseId-derived date stamp to keep the value deterministic. Real
  // implementations will include `asOfDate` in the workflow input.
  const fallback = input.caseId.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  return fallback ?? "2026-05-04";
}
