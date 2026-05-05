import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Worker } from "@temporalio/worker";

import { DailyCashActionWorkflow } from "../src/temporal/workflows/daily-cash-action.js";
import { approvalGrantedSignal } from "../src/temporal/signals.js";
import type { ApprovalDecisionPayload } from "../src/temporal/signal-types.js";
import { getCycleSummaryQuery } from "../src/temporal/queries.js";
import { createReplayHarness, teardownHarness, type ReplayHarness } from "./helpers/env.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb("E2E Simulation — DailyCashActionWorkflow", () => {
  let harness: ReplayHarness;

  beforeAll(async () => {
    harness = await createReplayHarness("e2e-simulation");
  });

  afterAll(async () => {
    await teardownHarness(harness);
  });

  it("full daily cycle: forecast → rank → approve → complete", async () => {
    await harness.worker.runUntil(async () => {
      const handle = await harness.env.client.workflow.start(DailyCashActionWorkflow, {
        args: [{
          companyId: "company-e2e-1",
          asOfDate: "2026-05-05",
          triggerEventIds: ["trigger-e2e-1"]
        }],
        taskQueue: harness.taskQueue,
        workflowId: "e2e-daily-cash-action-1"
      });

      // Wait for the workflow to enter approval window
      let summary = await handle.query(getCycleSummaryQuery);
      let iterations = 0;
      while (summary.phase !== "awaiting_approval" && iterations < 100) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        summary = await handle.query(getCycleSummaryQuery);
        iterations++;
      }

      expect(summary.phase).toBe("awaiting_approval");
      expect(summary.draftActionCount).toBe(5);

      // Assert forecast was computed (workflow completed computing phase)
      expect(summary.companyId).toBe("company-e2e-1");

      // Approve all 5 actions
      const cycleKey = "daily-cash-action:company-e2e-1:2026-05-05";
      for (let i = 1; i <= 5; i++) {
        const actionId = `${cycleKey}:ranking:action:${i}`;
        const draftId = `${cycleKey}:drafts:draft:${actionId}`;
        const approvalRequestId = `${cycleKey}:approvals:approval:${draftId}`;
        const payload: ApprovalDecisionPayload = {
          approvalRequestId,
          subjectKind: "message_draft",
          subjectId: draftId,
          decision: "approved",
          decidedByUserId: "user-e2e-1",
          decidedAtIso: "2026-05-05T10:00:00.000Z"
        };
        await handle.signal(approvalGrantedSignal, payload);
      }

      const result = await handle.result();

      // Assert: workflow completed
      expect(result.cycleKey).toBe(cycleKey);
      expect(result.cancelled).toBe(false);

      // Assert: forecast computed
      expect(result.forecast.forecastId).toContain("forecast:");
      expect(result.forecast.riskStatus).toBeDefined();
      expect(result.forecast.cashBalanceMinor).toBeGreaterThan(0);

      // Assert: actions ranked and persisted
      expect(result.draftActions.length).toBe(5);
      for (const action of result.draftActions) {
        expect(action.priorityScore).toBeGreaterThan(0);
        expect(action.expectedCashImpactMinor).toBeGreaterThan(0);
      }

      // Assert: approvals resolved
      expect(result.approved).toBe(5);
      expect(result.rejected).toBe(0);

      // Determinism check: replay the recorded history
      const history = await handle.fetchHistory();
      await Worker.runReplayHistory(
        { workflowsPath: harness.workflowsPath },
        history
      );
    });
  }, 120_000);
});
