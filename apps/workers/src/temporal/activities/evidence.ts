import type {
  CustomerMemorySummary,
  EvidenceBundleSummary,
  EvidenceValidation,
  RetrieveCustomerMemoryInput,
  RetrieveEvidenceInput,
  ValidateEvidenceInput
} from "./types.js";

/**
 * Retrieve evidence packets for the top ranked actions. Real implementation
 * will run the retrieval pipeline (structured lookups + semantic search +
 * rerank) and return references; the stub returns a synthetic ref per
 * action.
 */
export async function retrieveEvidenceForTopActions(
  input: RetrieveEvidenceInput
): Promise<EvidenceBundleSummary[]> {
  return input.actionIds.map((actionId) => ({
    actionId,
    evidenceRefIds: [`evidence:${actionId}:invoice`, `evidence:${actionId}:thread`],
    evidenceConfidence: 0.72
  }));
}

export async function retrieveCustomerMemory(
  input: RetrieveCustomerMemoryInput
): Promise<CustomerMemorySummary> {
  return {
    customerId: input.customerId,
    averageDaysLate: 4.5,
    promiseKeptRate: 0.78,
    conditionalPromiseKeptRate: 0.42,
    preferredChannel: "email"
  };
}

/**
 * FAIL_FAST disposition. Stub always passes; real implementation will
 * throw `ValidationError` (non-retryable) when evidence does not satisfy
 * policy rules.
 */
export async function validateEvidence(
  input: ValidateEvidenceInput
): Promise<EvidenceValidation> {
  if (input.evidenceRefIds.length === 0) {
    return { ok: false, reason: "no_evidence_provided" };
  }
  return { ok: true };
}
