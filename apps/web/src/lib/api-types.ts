/**
 * Wire-shaped API responses.
 *
 * The API serializes domain types through a `preSerialization` Fastify
 * hook that turns every bigint into a decimal string. Dates flow through
 * default JSON serialization → ISO 8601 strings.
 *
 * These types describe what arrives over the wire — not the in-process
 * domain types from @runwayops/domain. Keeping them separate avoids
 * accidentally re-introducing bigint at the Server Component boundary.
 */

export type WireMoney = {
  amountMinor: string;
  currency: string;
};

export type WireEvidenceRef = {
  kind: string;
  id: string;
  summary?: string;
  sourceProvider?: string;
  sourceTimestamp?: string;
};

export type WireForecastCashFlow = {
  id: string;
  direction: "inflow" | "outflow" | string;
  kind: string;
  expectedDate: string;
  amount: WireMoney;
  probability: number;
  confidence: number;
  sourceId?: string;
  customerId?: string;
  invoiceId?: string;
  promiseId?: string;
  obligationId?: string;
  label?: string;
  evidenceRefs: WireEvidenceRef[];
};

export type WireConfidenceBand = {
  id: string;
  label: string;
  confidenceLevel: number;
  lowerBound: WireMoney;
  upperBound: WireMoney;
};

export type WireForecastScenario = {
  id: string;
  name: string;
  riskStatus: string;
  cashBalance: WireMoney;
  shortfallAmount?: WireMoney;
  evidenceRefs: WireEvidenceRef[];
};

export type WireObligationRisk = {
  obligationId: string;
  dueDate: string;
  amount: WireMoney;
  riskStatus: string;
  reason: string;
  coverageAmount?: WireMoney;
  shortfallAmount?: WireMoney;
  evidenceRefs: WireEvidenceRef[];
};

export type WireCashForecast = {
  forecastId: string;
  companyId: string;
  generatedAt: string;
  asOfDate: string;
  horizonDays: number;
  triggerEventIds: string[];
  cashBalance: WireMoney;
  expectedInflows: WireForecastCashFlow[];
  confidenceWeightedInflows: WireForecastCashFlow[];
  expectedOutflows: WireForecastCashFlow[];
  riskStatus: string;
  scenarios: WireForecastScenario[];
  confidenceBands: WireConfidenceBand[];
  shortfallAmount?: WireMoney;
  obligationRisks: WireObligationRisk[];
  evidenceRefs: WireEvidenceRef[];
};

export type WireRankingSnapshot = {
  kind: string;
  priorityScore: number;
  expectedCashImpactMinor: string;
  probabilityOfPayment: number;
  obligationUrgency: number;
  actionEffectiveness: number;
  evidenceConfidence: number;
  relationshipRiskPenalty: number;
  actionEffortPenalty: number;
  explanation: string;
  recordedAt: string;
};

export type WireCollectionAction = {
  id: string;
  companyId: string;
  customerId?: string;
  invoiceId?: string;
  promiseToPayId?: string;
  actionKind: string;
  channel: string;
  tone?: string;
  status: string;
  priorityScore: number;
  expectedCashImpact?: WireMoney;
  probabilityOfPayment?: number;
  evidenceConfidence: number;
  relationshipRiskPenalty: number;
  actionEffortPenalty: number;
  requiresApproval: boolean;
  approvalId?: string;
  recommendedAt: string;
  dueAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  executedAt?: string | null;
  completedAt?: string | null;
  reason: string;
  draftMessageId?: string;
  assignedToUserId?: string;
  evidenceRefs: WireEvidenceRef[];
  rankingSnapshot?: WireRankingSnapshot;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WireApprovalDecision = {
  decision: string;
  decidedByUserId: string;
  decidedAt: string;
  note?: string;
  editedPayload?: Record<string, unknown>;
};

export type WireApprovalRequest = {
  id: string;
  companyId: string;
  subjectKind: string;
  subjectId: string;
  status: string;
  requestedByUserId?: string;
  assignedApproverId?: string;
  requestedAt: string;
  expiresAt?: string;
  riskSummary?: string;
  evidenceRefs: WireEvidenceRef[];
  decision?: WireApprovalDecision;
};
