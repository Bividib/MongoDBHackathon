import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { IntegrationSyncWorkflow } from "../src/temporal/workflows/integration-sync.js";

import { createReplayHarness, teardownHarness, type ReplayHarness } from "./helpers/env.js";

/**
 * IntegrationSyncWorkflow: fan out across all connected providers for
 * a tenant, return aggregate. The replay harness drives this with
 * mock activities so the test runs in milliseconds and is fully
 * deterministic — production-side activity bodies are exercised by
 * the per-activity unit tests, not here.
 */
describe("IntegrationSyncWorkflow", () => {
  let harness: ReplayHarness;

  beforeAll(async () => {
    harness = await createReplayHarness("integration-sync-test");
  });

  afterAll(async () => {
    await teardownHarness(harness);
  });

  it("aggregates per-connection summaries and reports totals", async () => {
    await harness.worker.runUntil(async () => {
      const handle = await harness.env.client.workflow.start(IntegrationSyncWorkflow, {
        args: [
          {
            companyId: "company-1",
            cycleKey: "integration-sync:company-1:2026-05-05T00:00:00Z",
          },
        ],
        taskQueue: harness.taskQueue,
        workflowId: "integration-sync-test-1",
      });

      const result = await handle.result();
      // The mock returns one xero connection that completes successfully.
      expect(result.totalConnections).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.perConnection).toHaveLength(1);
      expect(result.perConnection[0]?.status).toBe("completed");
      expect(result.perConnection[0]?.recordsProcessed).toBe(7);
      expect(result.perConnection[0]?.connectionId).toBe("conn-xero-1");
      // Idempotency-key flow-through is the load-bearing contract —
      // production activity bodies use this to dedupe.
      expect(result.cycleKey).toBe("integration-sync:company-1:2026-05-05T00:00:00Z");
    });
  });
});
