import { fileURLToPath } from "node:url";

import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

import { mockActivities } from "./activities.js";

export interface ReplayHarness {
  env: TestWorkflowEnvironment;
  worker: Worker;
  taskQueue: string;
  workflowsPath: string;
}

const WORKFLOWS_PATH = fileURLToPath(
  new URL("../../src/temporal/workflows/index.ts", import.meta.url)
);

export async function createReplayHarness(taskQueue: string): Promise<ReplayHarness> {
  // Time-skipping environment lets `workflow.sleep(7d)` resolve in
  // milliseconds when nothing else is pending. The local Temporalite
  // server boots once per harness.
  const env = await TestWorkflowEnvironment.createTimeSkipping();

  const worker = await Worker.create({
    connection: env.nativeConnection,
    namespace: env.namespace ?? "default",
    taskQueue,
    workflowsPath: WORKFLOWS_PATH,
    activities: mockActivities
  });

  return { env, worker, taskQueue, workflowsPath: WORKFLOWS_PATH };
}

export async function teardownHarness(harness: ReplayHarness | undefined): Promise<void> {
  if (!harness) return;
  try {
    await harness.worker.shutdown();
  } catch {
    // ignore — worker may have already shut down at the end of `runUntil`.
  }
  try {
    await harness.env.teardown();
  } catch {
    // ignore — env may have already torn down.
  }
}

export function getWorkflowsPath(): string {
  return WORKFLOWS_PATH;
}

// Re-export so individual tests can build their own runners if needed.
export { mockActivities };
