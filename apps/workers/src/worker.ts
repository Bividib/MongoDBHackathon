import { fileURLToPath } from "node:url";

import { NativeConnection, Worker } from "@temporalio/worker";

import * as activities from "./temporal/activities/index.js";

const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "runwayops-default";

/**
 * Worker entry point. Compiles in this scaffolding round but is not
 * intended to run yet — the Temporal Cloud / development server wiring
 * lands later. Real boot will:
 *
 *   1. construct a `NativeConnection` to Temporal Cloud (mTLS) or the
 *      local dev server;
 *   2. construct activity dependencies (DB pool, ModelRouter, event bus)
 *      and pass them into a `createActivities(deps)` factory;
 *   3. register `workflowsPath` and `activities` with the worker;
 *   4. run `worker.run()` until SIGTERM.
 *
 * For now we keep the function compilable so the file exercises the
 * worker SDK type surface and proves the package's TypeScript build is
 * well-formed.
 */
export async function startWorker(): Promise<Worker> {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233"
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue: TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL("./temporal/workflows/index.js", import.meta.url)),
    activities
  });

  return worker;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker()
    .then(async (worker) => {
      await worker.run();
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error("worker failed to start", error);
      process.exit(1);
    });
}
