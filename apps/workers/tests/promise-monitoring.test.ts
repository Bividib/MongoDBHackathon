import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Worker } from "@temporalio/worker";

import { PromiseMonitoringWorkflow } from "../src/temporal/workflows/promise-monitoring.js";

import { createReplayHarness, teardownHarness, type ReplayHarness } from "./helpers/env.js";

describe("PromiseMonitoringWorkflow", () => {
  let harness: ReplayHarness;

  beforeAll(async () => {
    harness = await createReplayHarness("promise-monitoring-test");
  });

  afterAll(async () => {
    await teardownHarness(harness);
  });

  it("sleeps until grace, classifies kept outcome, and replay is deterministic", async () => {
    await harness.worker.runUntil(async () => {
      const handle = await harness.env.client.workflow.start(PromiseMonitoringWorkflow, {
        args: [{ companyId: "company-1", promiseId: "promise-1" }],
        taskQueue: harness.taskQueue,
        workflowId: "promise-monitoring-test-1"
      });

      const result = await handle.result();

      expect(result.cycleKey).toBe("promise:promise-1");
      // Mock checkPaymentMatch returns matched=true → outcome "kept".
      expect(result.outcome).toBe("kept");
      expect(result.followUpEventId).toBeUndefined();

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
