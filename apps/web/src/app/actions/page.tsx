import { getDailyCashActionsData } from "@/fixtures/engine";
import { ActionsList } from "./actions-list";

/**
 * Daily Cash Actions — the home screen.
 *
 * Shows the top five cash actions for today. The operator scans,
 * opens the top action, reads the draft, sees evidence, and acts.
 *
 * Hard refusals enforced:
 *  - No payment initiation button
 *  - No safety claims — only numbers and risk status shown
 *  - External action buttons disabled until approval.status === "approved"
 */
export default function ActionsPage() {
  const data = getDailyCashActionsData();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold">Daily Cash Actions</h1>
        <p className="text-sm text-gray-500">
          As of {new Date(data.asOfDate).toLocaleDateString("en-GB")}
        </p>
      </div>
      <ActionsList data={data} />
    </div>
  );
}
