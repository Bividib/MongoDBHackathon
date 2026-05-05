import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Worker } from "@temporalio/worker";

import { DailyCashActionWorkflow } from "../src/temporal/workflows/daily-cash-action.js";
import {
  approvalGrantedSignal
} from "../src/temporal/signals.js";
import type { ApprovalDecisionPayload } from "../src/temporal/signal-types.js";
import { getCycleSummaryQuery } from "../src/temporal/queries.js";

import { createReplayHarness, teardownHarness, type ReplayHarness } from "./helpers/env.js";

describe("DailyCashActionWorkflow", () => {
  let harness: ReplayHarness;

  beforeAll(async () => {
    harness = await createReplayHarness("daily-cash-action-test");
  });

  afterAll(async () => {
    await teardownHarness(harness);
  });

  it("runs happy path end-to-end and is deterministic on replay", async () => {
    await harness.worker.runUntil(async () => {
      const handle = await harness.env.client.workflow.start(DailyCashActionWorkflow, {
        args: [
          {
            companyId: "company-1",
            asOfDate: "2026-05-04",
            triggerEventIds: ["trigger-1"]
          }
        ],
        taskQueue: harness.taskQueue,
        workflowId: "daily-cash-action-test-1"
      });

      // Wait for the workflow to enter the approval window. Temporal's
      // time-skipping does not advance until something pends; querying
      // forces the worker to drive forward.
      let summary = await handle.query(getCycleSummaryQuery);
      while (summary.phase !== "awaiting_approval") {
        await new Promise((resolve) => setTimeout(resolve, 25));
        summary = await handle.query(getCycleSummaryQuery);
      }

      expect(summary.draftActionCount).toBe(5);

      // Approve all five generated drafts. We don't need to predict the
      // approval IDs — we already have them from the cycle summary's
      // approval state, which we expose through the workflow result.
      // Here we read them straight from the workflow by deriving the IDs
      // from the cycle key, which is a stable public input.
      const cycleKey = "daily-cash-action:company-1:2026-05-04";
      for (let i = 1; i <= 5; i += 1) {
        const actionId = `${cycleKey}:ranking:action:${i}`;
        const draftId = `${cycleKey}:drafts:draft:${actionId}`;
        const approvalRequestId = `${cycleKey}:approvals:approval:${draftId}`;
        const payload: ApprovalDecisionPayload = {
          approvalRequestId,
          subjectKind: "message_draft",
          subjectId: draftId,
          decision: "approved",
          decidedByUserId: "user-1",
          decidedAtIso: "2026-05-04T10:00:00.000Z"
        };
        await handle.signal(approvalGrantedSignal, payload);
      }

      const result = await handle.result();

      expect(result.cycleKey).toBe(cycleKey);
      expect(result.draftActions.length).toBe(5);
      expect(result.approved).toBe(5);
      expect(result.rejected).toBe(0);
      expect(result.cancelled).toBe(false);
      expect(result.forecast.riskStatus).toBe("watch");

      // Determinism check.
      const history = await handle.fetchHistory();
      await Worker.runReplayHistory(
        {
          workflowsPath: harness.workflowsPath
        },
        history
      );
    });
  }, 60_000);
});
