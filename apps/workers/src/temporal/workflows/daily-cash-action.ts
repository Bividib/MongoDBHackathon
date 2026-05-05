import { condition, setHandler, sleep, workflowInfo } from "@temporalio/workflow";

import type {
  ApprovalRequestSummary,
  CashForecastSummary,
  RankedActionSummary
} from "../activities/types.js";
import {
  approvalEditedSignal,
  approvalGrantedSignal,
  approvalRejectedSignal,
  cycleCancelSignal
} from "../signals.js";
import type { ApprovalDecisionPayload } from "../signal-types.js";
import { getCycleSummaryQuery } from "../queries.js";
import type { CycleSummary, WorkflowPhase } from "../query-types.js";

import { acts } from "./activity-proxies.js";

export interface DailyCashActionInput {
  companyId: string;
  /** ISO yyyy-mm-dd */
  asOfDate: string;
  triggerEventIds?: string[];
}

export interface DailyCashActionResult {
  cycleKey: string;
  forecast: CashForecastSummary;
  draftActions: RankedActionSummary[];
  approvals: ApprovalRequestSummary[];
  approved: number;
  rejected: number;
  edited: number;
  cancelled: boolean;
}

const MAX_TOP_ACTIONS = 5;

export async function DailyCashActionWorkflow(
  input: DailyCashActionInput
): Promise<DailyCashActionResult> {
  const cycleKey = `daily-cash-action:${input.companyId}:${input.asOfDate}`;
  const triggerEventIds = input.triggerEventIds ?? [];

  // Mutable state for the queryable view. Mutated only by signal handlers
  // and step transitions — both are deterministic.
  let phase: WorkflowPhase = "initializing";
  let approved = 0;
  let rejected = 0;
  let edited = 0;
  let cancelled = false;

  const approvalState = new Map<string, ApprovalRequestSummary>();

  setHandler(getCycleSummaryQuery, (): CycleSummary => ({
    cycleKey,
    companyId: input.companyId,
    asOfDate: input.asOfDate,
    phase,
    draftActionCount: approvalState.size,
    approvalCounts: {
      pending: countWhere(approvalState, (a) => a.decision === undefined),
      approved,
      rejected,
      edited,
      cancelled: cancelled ? 1 : 0,
      expired: 0
    },
    startedAtIso: workflowInfo().startTime.toISOString()
  }));

  setHandler(approvalGrantedSignal, (payload: ApprovalDecisionPayload) => {
    const existing = approvalState.get(payload.approvalRequestId);
    if (!existing || existing.decision !== undefined) return;
    approvalState.set(payload.approvalRequestId, { ...existing, decision: "approved" });
    approved += 1;
  });

  setHandler(approvalRejectedSignal, (payload: ApprovalDecisionPayload) => {
    const existing = approvalState.get(payload.approvalRequestId);
    if (!existing || existing.decision !== undefined) return;
    approvalState.set(payload.approvalRequestId, { ...existing, decision: "rejected" });
    rejected += 1;
  });

  setHandler(approvalEditedSignal, (payload: ApprovalDecisionPayload) => {
    const existing = approvalState.get(payload.approvalRequestId);
    if (!existing || existing.decision !== undefined) return;
    approvalState.set(payload.approvalRequestId, { ...existing, decision: "edited" });
    edited += 1;
  });

  setHandler(cycleCancelSignal, () => {
    cancelled = true;
  });

  // 1. policy + facts
  phase = "loading";
  const policy = await acts.loadCompanyPolicy({ companyId: input.companyId });
  await acts.loadFinancialFactsForForecast({
    companyId: input.companyId,
    asOfDate: input.asOfDate,
    horizonDays: 30
  });

  // 2. forecast
  phase = "computing";
  const forecastKey = `${cycleKey}:forecast`;
  const forecast = await acts.computeCashForecast({
    companyId: input.companyId,
    idempotencyKey: forecastKey,
    asOfDate: input.asOfDate,
    horizonDays: 30,
    triggerEventIds
  });

  // 3. ranking
  const rankingKey = `${cycleKey}:ranking`;
  const draftActions = await acts.rankCollectionsActions({
    companyId: input.companyId,
    idempotencyKey: rankingKey,
    forecastId: forecast.forecastId,
    maxActions: MAX_TOP_ACTIONS,
    asOfDate: input.asOfDate
  });

  // 4. evidence retrieval
  await acts.retrieveEvidenceForTopActions({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:evidence`,
    actionIds: draftActions.map((a) => a.actionId)
  });

  // 5. drafting
  phase = "drafting";
  const drafts = await acts.draftMessages({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:drafts`,
    actionIds: draftActions.map((a) => a.actionId)
  });

  // 6. approval requests
  const requests = await acts.createApprovalRequests({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:approvals`,
    subjects: drafts.map((d) => ({
      subjectKind: "message_draft",
      subjectId: d.draftId,
      riskSummary: "Daily cash action draft message"
    }))
  });
  for (const r of requests) {
    approvalState.set(r.approvalRequestId, r);
  }

  await acts.writeAuditEvents(
    requests.map((r) => ({
      companyId: input.companyId,
      idempotencyKey: `${cycleKey}:audit:request:${r.approvalRequestId}`,
      action: "approval.requested",
      targetKind: "approval",
      targetId: r.approvalRequestId,
      summary: "Approval request created for daily cash action draft"
    }))
  );

  // 7. approval window
  phase = "awaiting_approval";
  await condition(
    () => cancelled || approved + rejected + edited >= requests.length,
    policy.approvalWindowMs
  );

  if (!cancelled && approved + rejected + edited < requests.length) {
    // window expired without all decisions; surface this in audit but keep
    // any decisions we did receive.
    await acts.writeAuditEvent({
      companyId: input.companyId,
      idempotencyKey: `${cycleKey}:audit:window-expired`,
      action: "approval.window_expired",
      targetKind: "approval",
      targetId: cycleKey,
      summary: "Approval window expired with pending requests"
    });
  }

  // 8. final audit summary
  phase = cancelled ? "cancelled" : "completed";
  await acts.writeAuditEvent({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:audit:cycle-complete`,
    action: cancelled ? "cycle.cancelled" : "cycle.completed",
    targetKind: "domain_event",
    targetId: cycleKey,
    summary: cancelled ? "Daily cycle cancelled by operator" : "Daily cycle completed"
  });

  return {
    cycleKey,
    forecast,
    draftActions,
    approvals: Array.from(approvalState.values()),
    approved,
    rejected,
    edited,
    cancelled
  };
}

function countWhere<K, V>(map: Map<K, V>, pred: (v: V) => boolean): number {
  let n = 0;
  for (const v of map.values()) if (pred(v)) n += 1;
  return n;
}
