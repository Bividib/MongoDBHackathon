import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Worker } from "@temporalio/worker";

import { CustomerReplyWorkflow } from "../src/temporal/workflows/customer-reply.js";

import { createReplayHarness, teardownHarness, type ReplayHarness } from "./helpers/env.js";

describe("CustomerReplyWorkflow", () => {
  let harness: ReplayHarness;

  beforeAll(async () => {
    harness = await createReplayHarness("customer-reply-test");
  });

  afterAll(async () => {
    await teardownHarness(harness);
  });

  it("classifies + extracts a promise and is deterministic on replay", async () => {
    await harness.worker.runUntil(async () => {
      const handle = await harness.env.client.workflow.start(CustomerReplyWorkflow, {
        args: [
          {
            companyId: "company-1",
            messageEventId: "msg-evt-1",
            receivedAtIso: "2026-05-04T10:15:00.000Z"
          }
        ],
        taskQueue: harness.taskQueue,
        workflowId: "customer-reply-test-1"
      });

      const result = await handle.result();

      expect(result.cycleKey).toBe("customer-reply:msg-evt-1");
      expect(result.classification).toBe("conditional_promise");
      expect(result.hasPromise).toBe(true);
      expect(result.promiseId).toBeTruthy();
      expect(result.followUpDraftId).toBeTruthy();
      // The override window expires without a signal — that is the happy path.
      expect(result.humanOverride).toBeUndefined();

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
