import { proxyActivities } from "@temporalio/workflow";

import type {
  listConnectedProviders,
  runProviderSync,
} from "../activities/sync.js";
import type { ProviderSyncSummary } from "../activities/types.js";
import { RETRY_TRANSIENT } from "../retry-policies.js";

const syncActs = proxyActivities<{
  listConnectedProviders: typeof listConnectedProviders;
  runProviderSync: typeof runProviderSync;
}>({
  startToCloseTimeout: "5 minutes",
  scheduleToCloseTimeout: "10 minutes",
  retry: RETRY_TRANSIENT,
});

export interface IntegrationSyncInput {
  companyId: string;
  /**
   * Cycle key: the workflow's idempotency root. Activities derive
   * per-connection idempotency keys from this. Typically the workflow
   * id or `${companyId}:${runIso}`.
   */
  cycleKey: string;
}

export interface IntegrationSyncResult {
  cycleKey: string;
  totalConnections: number;
  successful: number;
  failed: number;
  perConnection: ProviderSyncSummary[];
}

/**
 * Per-tenant integration sync. Fans out to one activity call per
 * connected provider, returns aggregate counts. Per-connection
 * failures are captured (status="failed" on the summary) but do NOT
 * abort the workflow — one provider going down should not block the
 * rest. Schedule once per company via Temporal's Schedule API
 * (e.g. cron `*\/15 * * * *`).
 *
 * Replay determinism: workflow code is pure. Activity bodies do all
 * I/O. The `cycleKey` flows through as an idempotency root so
 * mutations are deduped on retry.
 */
export async function IntegrationSyncWorkflow(
  input: IntegrationSyncInput,
): Promise<IntegrationSyncResult> {
  const connections = await syncActs.listConnectedProviders({
    companyId: input.companyId,
  });

  const perConnection: ProviderSyncSummary[] = [];
  let successful = 0;
  let failed = 0;

  // Sequential by design: a single tenant's providers are usually 1-3
  // and we want predictable order in the workflow history. If a
  // future tenant has many providers, switching to Promise.all is a
  // one-line change.
  for (const conn of connections) {
    const summary = await syncActs.runProviderSync({
      companyId: input.companyId,
      connectionId: conn.connectionId,
      idempotencyKey: `${input.cycleKey}:sync:${conn.connectionId}`,
    });
    perConnection.push(summary);
    if (summary.status === "completed") successful += 1;
    else failed += 1;
  }

  return {
    cycleKey: input.cycleKey,
    totalConnections: connections.length,
    successful,
    failed,
    perConnection,
  };
}
