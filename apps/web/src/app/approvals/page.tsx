import { getApprovalInboxData } from "@/fixtures/engine";
import { ApprovalInbox } from "./approval-inbox";

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
export default function ApprovalsPage() {
  const data = getApprovalInboxData();

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
