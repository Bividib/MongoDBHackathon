import type { EvidenceRef } from "@runwayops/domain";

import { messageDrafts } from "../schema/actions.js";
import { serializeEvidenceRefs } from "../schema/common.js";
import type { DbHandle } from "./tenant.js";

export type MessageDraftRow = typeof messageDrafts.$inferSelect;

export interface InsertMessageDraftInput {
  companyId: string;
  /** Real UUID of the collection_actions row this draft belongs to. */
  actionId: string;
  channel: string;
  bodyText: string;
  subject?: string;
  threadId?: string;
  createdByUserId?: string;
  modelTraceId?: string;
  evidenceRefs?: readonly EvidenceRef[];
  /** Defaults to "draft". Other values: "approved", "edited", "sent". */
  status?: string;
}

/**
 * Persist a single message_drafts row. Returns the persisted row so
 * callers can plumb the real UUID through to subsequent activities
 * (e.g. createApprovalRequests' `subject_id`). Caller must have set
 * the tenant GUC via `withTenant`.
 *
 * Why this matters: approval_requests.subject_id is a `uuid` column,
 * so subjects must be persisted entities. Without this, the workflow
 * would synthesise non-UUID strings and the approval insert would
 * fail at the schema layer. See e2e-real-activities.test.ts.
 */
export async function insertMessageDraft(
  handle: DbHandle,
  input: InsertMessageDraftInput,
): Promise<MessageDraftRow> {
  const [row] = await handle
    .insert(messageDrafts)
    .values({
      companyId: input.companyId,
      actionId: input.actionId,
      channel: input.channel,
      bodyText: input.bodyText,
      subject: input.subject ?? null,
      threadId: input.threadId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      modelTraceId: input.modelTraceId ?? null,
      evidenceRefs: serializeEvidenceRefs(input.evidenceRefs ?? []),
      status: input.status ?? "draft",
      version: 1,
    })
    .returning();
  if (!row) throw new Error("insertMessageDraft: insert returned no row");
  return row;
}
