import { ApprovalInbox } from "./approval-inbox";
import { getApiClient } from "@/lib/api";
import { adaptApprovalInbox } from "@/lib/adapters";
import type { ApprovalInboxData } from "@/fixtures/types";

export const dynamic = "force-dynamic";

/**
 * Approval Inbox — the single queue for all external actions
 * requiring human sign-off.
 *
 * Hard refusals enforced:
 *  - No payment initiation affordance
 *  - No "auto-approve all" affordance
 *  - Policy "block" warnings disable the Approve button
 *  - No send without approval
 */
export default async function ApprovalsPage() {
  const data = await loadApprovalInbox();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold">Approval Inbox</h1>
        <p className="text-sm text-gray-500">
          {data.pending.length} pending &middot;{" "}
          {data.recentlyDecided.length} recently decided
        </p>
      </div>
      <ApprovalInbox data={data} />
    </div>
  );
}

async function loadApprovalInbox(): Promise<ApprovalInboxData> {
  const api = getApiClient();
  try {
    const approvals = await api.listPendingApprovals();
    return adaptApprovalInbox(approvals);
  } catch {
    return adaptApprovalInbox([]);
  }
}
