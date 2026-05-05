import { ActionsList } from "./actions-list";
import { getApiClient } from "@/lib/api";
import { adaptDailyCashActions } from "@/lib/adapters";
import type { DailyCashActionsData } from "@/fixtures/types";

export const dynamic = "force-dynamic";

/**
 * Daily Cash Actions — the home screen.
 *
 * Shows the top cash actions awaiting approval. The operator scans,
 * opens an action, reads the draft, sees evidence, and acts.
 *
 * Hard refusals enforced:
 *  - No payment initiation button
 *  - No safety claims — only numbers and risk status shown
 *  - External action buttons disabled until approval.status === "approved"
 */
export default async function ActionsPage() {
  const data = await loadActionsData();
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

async function loadActionsData(): Promise<DailyCashActionsData> {
  const api = getApiClient();
  const asOfDate = new Date().toISOString();
  try {
    const [forecast, actions] = await Promise.all([
      api.getLatestForecast(),
      api.listActions("awaiting_approval"),
    ]);
    return adaptDailyCashActions({ forecast, actions, asOfDate });
  } catch {
    return adaptDailyCashActions({ forecast: null, actions: [], asOfDate });
  }
}
