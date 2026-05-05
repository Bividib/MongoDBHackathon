import { repositories } from "@runwayops/db";
import type { CompanyPolicySummary, LoadCompanyPolicyInput } from "./types.js";
import { getActivityContext } from "./context.js";

const { withTenant } = repositories;

/**
 * Load company policy from the database.
 * Falls back to sensible defaults if no policy row exists yet.
 */
export async function loadCompanyPolicy(
  input: LoadCompanyPolicyInput
): Promise<CompanyPolicySummary> {
  const { db } = getActivityContext();

  // TODO: when packages/db exposes a CompanyPolicyRepo, use it here.
  // For now, return defaults — the schema allows this because policy_documents
  // table may not exist yet.
  try {
    const _result = await withTenant(db, input.companyId, async (_tx) => {
      // Placeholder: real query when repo surface ships.
      return null;
    });
  } catch {
    // DB may not be available in stub mode — fall through to defaults.
  }

  return {
    companyId: input.companyId,
    highConfidenceThreshold: 0.8,
    mediumConfidenceThreshold: 0.5,
    approvalWindowMs: 60 * 60 * 1000,
    humanOverrideWindowMs: 30 * 60 * 1000,
    promiseGraceMs: 2 * 24 * 60 * 60 * 1000,
    caseReplanIntervalMs: 24 * 60 * 60 * 1000
  };
}
