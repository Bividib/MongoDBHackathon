import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Worker } from "@temporalio/worker";

import { CriticalObligationCaseWorkflow } from "../src/temporal/workflows/critical-obligation-case.js";
import {
  approvalGrantedSignal,
  caseCloseRequestSignal,
  caseResolutionEvidenceSignal
} from "../src/temporal/signals.js";
import { getCaseSummaryQuery } from "../src/temporal/queries.js";
import type { ApprovalDecisionPayload } from "../src/temporal/signal-types.js";

import { createReplayHarness, teardownHarness, type ReplayHarness } from "./helpers/env.js";

describe("CriticalObligationCaseWorkflow", () => {
  let harness: ReplayHarness;

  beforeAll(async () => {
    harness = await createReplayHarness("critical-obligation-case-test");
  });

  afterAll(async () => {
    await teardownHarness(harness);
  });

  it("opens case, takes signals, and closes deterministically", async () => {
    await harness.worker.runUntil(async () => {
      const handle = await harness.env.client.workflow.start(
        CriticalObligationCaseWorkflow,
        {
          args: [
            {
              companyId: "company-1",
              caseId: "case-2026-05-04-1",
              obligationId: "obligation-payroll-1"
            }
          ],
          taskQueue: harness.taskQueue,
          workflowId: "critical-obligation-case-test-1"
        }
      );

      // Wait until the wait loop is established.
      let summary = await handle.query(getCaseSummaryQuery);
      while (summary.phase !== "awaiting_signal") {
        await new Promise((resolve) => setTimeout(resolve, 25));
        summary = await handle.query(getCaseSummaryQuery);
      }

      // Approve the first customer-draft action so the workflow has
      // something to execute. The cycleKey + idempotency key shape gives
      // us a deterministic ID to target.
      const cycleKey = "critical-obligation:case-2026-05-04-1";
      const customerDraftIdempotencyKey = `${cycleKey}:customer-drafts`;
      const customerActionIdempotencyKey = `${cycleKey}:invoices`;
      const draftId = `${customerDraftIdempotencyKey}:customer-draft:1`;
      const approvalRequestId = `${cycleKey}:approvals:approval:${draftId}`;
      const approvalPayload: ApprovalDecisionPayload = {
        approvalRequestId,
        subjectKind: "message_draft",
        subjectId: draftId,
        decision: "approved",
        decidedByUserId: "user-1",
        decidedAtIso: "2026-05-04T11:00:00.000Z"
      };
      await handle.signal(approvalGrantedSignal, approvalPayload);

      // Provide resolution evidence and close the case.
      await handle.signal(caseResolutionEvidenceSignal, {
        evidenceId: `${customerActionIdempotencyKey}:invoice:1:paid`,
        description: "Invoice 1 paid by customer",
        sourceKind: "bank_transaction",
        receivedAtIso: "2026-05-04T12:00:00.000Z"
      });

      await handle.signal(caseCloseRequestSignal, {
        requestedByUserId: "user-1",
        resolutionSummary: "Customer paid invoice 1; obligation now covered."
      });

      const result = await handle.result();

      expect(result.outcome).toBe("closed");
      expect(result.approvedActions).toBe(1);
      expect(result.rejectedActions).toBe(0);
      expect(result.executedActions).toBe(1);
      expect(result.pausedReason).toBeUndefined();

      const history = await handle.fetchHistory();
      await Worker.runReplayHistory(
        {
          workflowsPath: harness.workflowsPath
        },
        history
      );
    });
  }, 90_000);
});
