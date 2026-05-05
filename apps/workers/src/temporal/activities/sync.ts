/**
 * Integration-sync activities. Two surfaces:
 *
 *   - `listConnectedProviders(companyId)` — hands the workflow a list
 *     of (connectionId, provider, adapterMode) tuples. Workflow code
 *     iterates and calls `runProviderSync` per row.
 *
 *   - `runProviderSync({ companyId, connectionId, idempotencyKey })` —
 *     loads the connection, picks an adapter, runs
 *     `syncProviderToSourceObjects`, updates `sync_jobs` +
 *     `integration_connections.last*SyncAt`. Returns a narrow summary.
 *
 * Adapter selection is `simulated` only today — `real` mode requires
 * persisted Xero refresh tokens, which need OAuth UI (separate slice).
 * The selector here throws a clear error for `real` so the operator
 * sees the gap rather than silently falling through.
 */
import {
  XeroSimulatedAdapter,
  syncProviderToSourceObjects,
  type AccountingProvider,
  type AccountingProviderKey,
  type ProviderConnection,
} from "@runwayops/integrations";
import { repositories } from "@runwayops/db";

import type {
  ConnectedProviderSummary,
  ListConnectedProvidersInput,
  ProviderSyncSummary,
  RunProviderSyncInput,
} from "./types.js";
import { getActivityContext } from "./context.js";

const {
  withTenant,
  listActiveConnectionsForCompany,
  getIntegrationConnectionById,
  beginSyncJob,
  completeSyncJob,
  failSyncJob,
} = repositories;

type AdapterMode = "simulated" | "real";

function readAdapterMode(metadata: unknown): AdapterMode {
  if (!metadata || typeof metadata !== "object") return "simulated";
  const mode = (metadata as Record<string, unknown>)["adapterMode"];
  return mode === "real" ? "real" : "simulated";
}

const SUPPORTED_PROVIDERS: ReadonlySet<string> = new Set<AccountingProviderKey>([
  "xero",
]);

export async function listConnectedProviders(
  input: ListConnectedProvidersInput,
): Promise<ConnectedProviderSummary[]> {
  const { db } = getActivityContext();
  return withTenant(db, input.companyId, async (tx) => {
    const rows = await listActiveConnectionsForCompany(tx, { companyId: input.companyId });
    const out: ConnectedProviderSummary[] = [];
    for (const row of rows) {
      if (!SUPPORTED_PROVIDERS.has(row.provider)) continue;
      out.push({
        connectionId: row.id,
        provider: row.provider,
        adapterMode: readAdapterMode(row.metadataJson),
      });
    }
    return out;
  });
}

/**
 * Run one sync for one connection. Wraps the `syncProviderToSourceObjects`
 * orchestrator with sync_jobs + last*SyncAt bookkeeping, so workflow
 * code only sees a narrow {status, recordsProcessed} summary.
 *
 * Failure path: any throw from the adapter or sync code is caught,
 * logged on the sync_jobs row, and re-thrown as an ApplicationFailure
 * marker text. Temporal will retry per the activity policy; the
 * workflow can choose to swallow per-connection failures so one bad
 * provider doesn't block the rest.
 */
export async function runProviderSync(
  input: RunProviderSyncInput,
): Promise<ProviderSyncSummary> {
  const { db } = getActivityContext();

  return withTenant(db, input.companyId, async (tx) => {
    const conn = await getIntegrationConnectionById(tx, {
      companyId: input.companyId,
      connectionId: input.connectionId,
    });
    if (!conn) {
      throw new Error(
        `runProviderSync: connection ${input.connectionId} not found for company ${input.companyId}`,
      );
    }

    const adapter = pickAdapter(conn.provider, readAdapterMode(conn.metadataJson));

    const job = await beginSyncJob(tx, {
      companyId: input.companyId,
      connectionId: input.connectionId,
      provider: conn.provider,
      syncType: "incremental_accounting_sync",
    });

    try {
      const providerConn: ProviderConnection = {
        companyId: input.companyId,
        providerKey: adapter.providerKey,
        ...(conn.metadataJson ? { metadata: conn.metadataJson } : {}),
      };

      const result = await syncProviderToSourceObjects(tx, providerConn, adapter);
      const recordsProcessed =
        result.contactsImported +
        result.invoicesImported +
        result.paymentsImported;

      await completeSyncJob(tx, {
        companyId: input.companyId,
        syncJobId: job.id,
        recordsProcessed,
      });

      return {
        connectionId: input.connectionId,
        syncJobId: job.id,
        status: "completed",
        recordsProcessed,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failSyncJob(tx, {
        companyId: input.companyId,
        syncJobId: job.id,
        errorMessage: message,
      });
      return {
        connectionId: input.connectionId,
        syncJobId: job.id,
        status: "failed",
        recordsProcessed: 0,
        errorMessage: message,
      };
    }
  });
}

function pickAdapter(provider: string, mode: AdapterMode): AccountingProvider {
  if (provider !== "xero") {
    throw new Error(`pickAdapter: provider '${provider}' is not yet supported`);
  }
  if (mode === "simulated") return new XeroSimulatedAdapter();
  // Real mode requires the OAuth + token-storage path that lands with
  // the OAuth UI. Throw with a clear pointer so the gap is obvious.
  throw new Error(
    `pickAdapter: provider 'xero' adapterMode='real' requires the OAuth UI slice; current connection has no usable real adapter resolver`,
  );
}
