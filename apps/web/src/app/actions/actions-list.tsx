"use client";

import { RiskBadge } from "@/components/RiskBadge";
import { EvidenceDrawer } from "@/components/EvidenceDrawer";
import { AuditDrawer } from "@/components/AuditDrawer";
import { ApprovalAction } from "@/components/ApprovalAction";
import { StaleBanner } from "@/components/StaleBanner";
import { EmptyState } from "@/components/EmptyState";
import { pct } from "@/lib/format";
import type { DailyCashActionsData } from "@/fixtures/types";

type Props = { data: DailyCashActionsData };

export function ActionsList({ data }: Props) {
  const { actions, forecast, approvalsByActionId, draftsByActionId, integrationHealth } = data;

  return (
    <div className="space-y-4">
      {/* Integration health banner */}
      <StaleBanner health={integrationHealth} />

      {/* Forecast summary bar */}
      <div
        data-testid="forecast-summary"
        className="flex items-center gap-4 rounded-lg border bg-white px-4 py-3"
      >
        <span className="text-sm font-medium">
          Cash: {forecast.cashBalance.formatted}
        </span>
        <RiskBadge status={forecast.riskStatus} />
        {forecast.shortfallAmount && (
          <span className="text-sm text-red-600">
            Shortfall: {forecast.shortfallAmount.formatted}
          </span>
        )}
        {forecast.obligationRisks.length > 0 && (
          <span className="text-xs text-gray-500">
            {forecast.obligationRisks.length} obligation
            {forecast.obligationRisks.length > 1 ? "s" : ""} at risk
          </span>
        )}
      </div>

      {/* Empty state */}
      {actions.length === 0 && (
        <EmptyState
          title="No actions ranked for today."
          subtitle={`Cash forecast risk status is ${forecast.riskStatus}.`}
          ctaLabel="Open Collections Queue"
          ctaHref="/collections"
        />
      )}

      {/* Action rows */}
      <div className="space-y-3" data-testid="actions-list">
        {actions.map((action) => {
          const draft = draftsByActionId[action.actionId];
          const approval = approvalsByActionId[action.actionId];

          return (
            <div
              key={action.actionId}
              data-testid="action-row"
              className="rounded-lg border bg-white p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      {action.customerName}
                    </span>
                    <span className="text-xs text-gray-400">
                      {action.invoiceNumber}
                    </span>
                    <span
                      data-testid="priority-chip"
                      title={`Score: ${action.priorityScore.toFixed(2)} = cashImpact * prob(${pct(action.probabilityOfPayment)}) * urgency(${action.obligationUrgency.toFixed(2)}) * effectiveness(${action.actionEffectiveness.toFixed(2)}) * evidence(${pct(action.evidenceConfidence)}) - riskPenalty(${action.relationshipRiskPenalty.toFixed(2)}) - effortPenalty(${action.actionEffortPenalty.toFixed(2)})`}
                      className="cursor-help rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-800"
                    >
                      Priority: {action.priorityScore.toFixed(1)}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-600">
                    <span>Due: {action.amountDue.formatted}</span>
                    <span>
                      Impact: {action.expectedCashImpact.formatted}
                    </span>
                    <span>Probability: {pct(action.probabilityOfPayment)}</span>
                    <span className="capitalize">
                      {action.recommendedChannel} &middot; {action.recommendedTone}
                    </span>
                    <span className="capitalize">
                      {action.kind.replace(/_/g, " ")}
                    </span>
                  </div>

                  {/* Obligation linkage */}
                  {data.forecast.obligationRisks
                    .filter((r) =>
                      r.dependentInflowIds.some(
                        (id) =>
                          id === action.invoiceId ||
                          id === action.actionId,
                      ),
                    )
                    .map((r) => (
                      <div
                        key={r.obligationId}
                        className="mt-1 text-[10px] text-orange-600"
                      >
                        Protects: {r.counterpartyName ?? r.obligationType ?? r.obligationId} (
                        {r.amount.formatted} due{" "}
                        {new Date(r.dueDate).toLocaleDateString("en-GB")})
                      </div>
                    ))}
                </div>

                {/* Evidence & audit */}
                <div className="flex flex-col items-end gap-1">
                  <EvidenceDrawer evidenceRefs={action.evidenceRefs} />
                  <AuditDrawer events={[]} />
                </div>
              </div>

              {/* Draft preview */}
              {draft && (
                <details className="mt-3">
                  <summary
                    data-testid="draft-preview-trigger"
                    className="cursor-pointer text-xs text-blue-600"
                  >
                    Preview draft ({draft.channel}, {draft.tone})
                  </summary>
                  <div className="mt-2 rounded border bg-gray-50 p-3 text-sm whitespace-pre-wrap">
                    {draft.subject && (
                      <p className="font-medium mb-1">
                        Subject: {draft.subject}
                      </p>
                    )}
                    {draft.bodyMarkdown}
                  </div>
                </details>
              )}

              {/* Approval controls */}
              <div className="mt-3 border-t pt-3">
                <ApprovalAction approval={approval} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
