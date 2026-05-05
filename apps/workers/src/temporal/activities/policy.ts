import type { CompanyPolicySummary, LoadCompanyPolicyInput } from "./types.js";

/**
 * Load company policy. Stub returns a deterministic canned policy keyed on
 * companyId. Real implementation reads from `companies` + `policy_documents`
 * via a `CompanyPolicyRepo`.
 */
export async function loadCompanyPolicy(
  input: LoadCompanyPolicyInput
): Promise<CompanyPolicySummary> {
  return {
    companyId: input.companyId,
    highConfidenceThreshold: 0.8,
    mediumConfidenceThreshold: 0.5,
    // 1 hour for tests; production policy will likely be 8–12 working hours.
    approvalWindowMs: 60 * 60 * 1000,
    humanOverrideWindowMs: 30 * 60 * 1000,
    // 2 days grace after a promise due date before classifying as broken.
    promiseGraceMs: 2 * 24 * 60 * 60 * 1000,
    // Re-plan a critical-obligation case at least once every 24 hours.
    caseReplanIntervalMs: 24 * 60 * 60 * 1000
  };
}
