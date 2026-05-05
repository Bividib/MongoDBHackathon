// Query return types. Kept separate from queries.ts so workflow code,
// activities, and tests can import the shapes without importing query
// definitions (which carry a workflow-runtime dependency).

import type { ApprovalStatus } from "@runwayops/domain";

export type WorkflowPhase =
  | "initializing"
  | "loading"
  | "computing"
  | "drafting"
  | "awaiting_approval"
  | "awaiting_human"
  | "awaiting_signal"
  | "executing"
  | "closing"
  | "completed"
  | "cancelled"
  | "failed";

export interface CycleSummary {
  cycleKey: string;
  companyId: string;
  asOfDate: string;
  phase: WorkflowPhase;
  draftActionCount: number;
  approvalCounts: Record<ApprovalStatus, number>;
  startedAtIso: string;
}

export interface ReplyState {
  cycleKey: string;
  messageEventId: string;
  phase: WorkflowPhase;
  classification?: string | undefined;
  hasPromise: boolean;
  promiseId?: string | undefined;
  followUpDraftId?: string | undefined;
}

export interface PromiseState {
  cycleKey: string;
  promiseId: string;
  phase: WorkflowPhase;
  outcome?:
    | "pending"
    | "kept"
    | "partially_kept"
    | "late"
    | "broken"
    | "superseded"
    | "disputed"
    | undefined;
  scheduledWakeIso?: string | undefined;
  wakeRound: number;
}

export interface OutstandingApprovalsView {
  pending: Array<{
    approvalRequestId: string;
    subjectId: string;
    subjectKind: string;
    requestedAtIso: string;
  }>;
}

export interface CaseSummary {
  cycleKey: string;
  caseId: string;
  obligationId: string;
  phase: WorkflowPhase;
  shortfallAmountMinor: number;
  currency: string;
  approvalsOutstanding: number;
  resolutionEvidenceCount: number;
  closeRequested: boolean;
}
