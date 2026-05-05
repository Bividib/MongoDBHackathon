import { fileURLToPath } from "node:url";

import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import pg from "pg";

import * as activities from "./temporal/activities/index.js";
import { initActivityContext } from "./temporal/activities/index.js";
import {
  startDispatcher,
  DEFAULT_DISPATCHER_CONFIG,
  type DispatcherConfig,
} from "./dispatcher/index.js";
import { buildApprovalDispatchHandlers } from "./dispatcher/handlers/temporal-signal.js";

const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "runwayops-default";
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? "default";

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
export interface WorkerHandle {
  worker: Worker;
  /** Stop the outbox dispatcher; call before `worker.shutdown()`. */
  stopDispatcher: () => void;
}

export async function startWorker(): Promise<WorkerHandle> {
  // Initialise the shared activity context BEFORE registering activities.
  // The worker process is the only entry point for production AI calls,
  // so this is also where `AI_MODE` resolves to a router. Logging the
  // resolved mode is the cheapest way to catch silent misconfiguration
  // (e.g. AI_MODE set in shell but not propagated to the worker process).
  const ctx = initActivityContext();
  // eslint-disable-next-line no-console
  console.info(
    `[worker] activity context initialised (ai_mode=${ctx.aiMode}, task_queue=${TASK_QUEUE})`,
  );

  // Native connection for activity-running worker.
  const nativeConnection = await NativeConnection.connect({ address: TEMPORAL_ADDRESS });

  // Lightweight gRPC connection for the dispatcher's signal-sender
  // client. Distinct from `nativeConnection` because the worker SDK
  // and client SDK use separate connection objects (the dispatcher
  // is logically a different consumer of Temporal).
  const dispatcherConnection = await Connection.connect({ address: TEMPORAL_ADDRESS });
  const temporalClient = new Client({
    connection: dispatcherConnection,
    namespace: TEMPORAL_NAMESPACE,
  });

  const worker = await Worker.create({
    connection: nativeConnection,
    namespace: TEMPORAL_NAMESPACE,
    taskQueue: TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL("./temporal/workflows/index.js", import.meta.url)),
    activities,
  });

  // Outbox dispatcher: forwards approval.* events to the originating
  // workflow as the matching approvalGrantedSignal etc. The pool is
  // separate from the activity-context drizzle pool because the
  // dispatcher uses raw SQL with `FOR UPDATE SKIP LOCKED` semantics
  // that drizzle's query layer abstracts away.
  const dispatcherPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const dispatcherConfig: DispatcherConfig = {
    ...DEFAULT_DISPATCHER_CONFIG,
    handlers: buildApprovalDispatchHandlers(temporalClient),
  };
  const { stop: stopDispatcher } = startDispatcher(dispatcherPool, dispatcherConfig);
  // eslint-disable-next-line no-console
  console.info(
    `[worker] outbox dispatcher started (handlers: approval.granted, approval.rejected, approval.edited)`,
  );

  return {
    worker,
    stopDispatcher: () => {
      stopDispatcher();
      void dispatcherPool.end();
      void dispatcherConnection.close();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker()
    .then(async ({ worker, stopDispatcher }) => {
      const shutdown = () => {
        stopDispatcher();
        void worker.shutdown();
      };
      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
      await worker.run();
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error("worker failed to start", error);
      process.exit(1);
    });
}
