import { defineQuery } from "@temporalio/workflow";

import type {
  CaseSummary,
  CycleSummary,
  OutstandingApprovalsView,
  PromiseState,
  ReplyState
} from "./query-types.js";

export const getCycleSummaryQuery = defineQuery<CycleSummary>("getCycleSummary");
export const getReplyStateQuery = defineQuery<ReplyState>("getReplyState");
export const getPromiseStateQuery = defineQuery<PromiseState>("getPromiseState");
export const getCaseSummaryQuery = defineQuery<CaseSummary>("getCaseSummary");
export const getOutstandingApprovalsQuery = defineQuery<OutstandingApprovalsView>(
  "getOutstandingApprovals"
);
