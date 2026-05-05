import { and, asc, eq } from "drizzle-orm";

import { integrationConnections, syncJobs } from "../schema/sync.js";
import type { DbHandle } from "./tenant.js";

export type IntegrationConnectionRow = typeof integrationConnections.$inferSelect;
export type SyncJobRow = typeof syncJobs.$inferSelect;

/**
 * List integration connections for a tenant. Defaults to "active"
 * (connected, not requiring reconnect) which is what a periodic sync
 * activity wants — failed/disconnected connections are skipped.
 */
export async function listActiveConnectionsForCompany(
  handle: DbHandle,
  input: { companyId: string; provider?: string },
): Promise<IntegrationConnectionRow[]> {
  const filters = [
    eq(integrationConnections.companyId, input.companyId),
    eq(integrationConnections.status, "connected"),
    eq(integrationConnections.reconnectRequired, false),
  ];
  if (input.provider) filters.push(eq(integrationConnections.provider, input.provider));

  return handle
    .select()
    .from(integrationConnections)
    .where(and(...filters))
    .orderBy(asc(integrationConnections.provider));
}

export async function getIntegrationConnectionById(
  handle: DbHandle,
  input: { companyId: string; connectionId: string },
): Promise<IntegrationConnectionRow | null> {
  const rows = await handle
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.companyId, input.companyId),
        eq(integrationConnections.id, input.connectionId),
      ),
    )
    .limit(1);
  return rows.length === 1 ? rows[0]! : null;
}

export interface BeginSyncJobInput {
  companyId: string;
  connectionId: string;
  provider: string;
  syncType: string;
  cursorBefore?: string;
}

export async function beginSyncJob(
  handle: DbHandle,
  input: BeginSyncJobInput,
): Promise<SyncJobRow> {
  const [row] = await handle
    .insert(syncJobs)
    .values({
      companyId: input.companyId,
      connectionId: input.connectionId,
      provider: input.provider,
      syncType: input.syncType,
      status: "running",
      startedAt: new Date(),
      cursorBefore: input.cursorBefore ?? null,
    })
    .returning();
  if (!row) throw new Error("beginSyncJob: insert returned no row");
  return row;
}

export interface CompleteSyncJobInput {
  companyId: string;
  syncJobId: string;
  recordsProcessed: number;
  cursorAfter?: string;
}

export async function completeSyncJob(
  handle: DbHandle,
  input: CompleteSyncJobInput,
): Promise<void> {
  const now = new Date();
  await handle
    .update(syncJobs)
    .set({
      status: "completed",
      completedAt: now,
      recordsProcessed: input.recordsProcessed,
      cursorAfter: input.cursorAfter ?? null,
    })
    .where(
      and(eq(syncJobs.companyId, input.companyId), eq(syncJobs.id, input.syncJobId)),
    );
  // Stamp the connection as last-successful as well — a "connected"
  // light on the UI reads this column.
  const job = await handle
    .select({ connectionId: syncJobs.connectionId })
    .from(syncJobs)
    .where(eq(syncJobs.id, input.syncJobId))
    .limit(1);
  const connectionId = job[0]?.connectionId;
  if (connectionId) {
    await handle
      .update(integrationConnections)
      .set({ lastSuccessfulSyncAt: now })
      .where(
        and(
          eq(integrationConnections.companyId, input.companyId),
          eq(integrationConnections.id, connectionId),
        ),
      );
  }
}

export interface FailSyncJobInput {
  companyId: string;
  syncJobId: string;
  errorMessage: string;
}

export async function failSyncJob(
  handle: DbHandle,
  input: FailSyncJobInput,
): Promise<void> {
  const now = new Date();
  await handle
    .update(syncJobs)
    .set({
      status: "failed",
      failedAt: now,
      errorMessage: input.errorMessage.slice(0, 1000),
    })
    .where(
      and(eq(syncJobs.companyId, input.companyId), eq(syncJobs.id, input.syncJobId)),
    );
  const job = await handle
    .select({ connectionId: syncJobs.connectionId })
    .from(syncJobs)
    .where(eq(syncJobs.id, input.syncJobId))
    .limit(1);
  const connectionId = job[0]?.connectionId;
  if (connectionId) {
    await handle
      .update(integrationConnections)
      .set({ lastFailedSyncAt: now })
      .where(
        and(
          eq(integrationConnections.companyId, input.companyId),
          eq(integrationConnections.id, connectionId),
        ),
      );
  }
}
