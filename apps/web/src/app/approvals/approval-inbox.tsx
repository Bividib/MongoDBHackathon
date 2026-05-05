"use client";

import { EvidenceDrawer } from "@/components/EvidenceDrawer";
import { AuditDrawer } from "@/components/AuditDrawer";
import { ApprovalAction } from "@/components/ApprovalAction";
import { EmptyState } from "@/components/EmptyState";
import type { ApprovalInboxData, ApprovalCardView } from "@/fixtures/types";

type Props = { data: ApprovalInboxData };

export function ApprovalInbox({ data }: Props) {
  const { pending, recentlyDecided } = data;

  return (
    <div className="space-y-6">
      {/* Empty state */}
      {pending.length === 0 && recentlyDecided.length === 0 && (
        <EmptyState
          title="Inbox zero."
          subtitle="No approvals pending."
        />
      )}

      {/* Pending approvals */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Pending ({pending.length})
          </h2>
          <div className="space-y-3" data-testid="pending-approvals">
            {pending.map((card) => (
              <ApprovalCard key={card.approval.id} card={card} />
            ))}
          </div>
        </section>
      )}

      {/* Recently decided */}
      {recentlyDecided.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Recently Decided
          </h2>
          <div className="space-y-3" data-testid="decided-approvals">
            {recentlyDecided.map((card) => (
              <ApprovalCard key={card.approval.id} card={card} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ApprovalCard({ card }: { card: ApprovalCardView }) {
  const { approval, subject, policyWarnings, auditHistory } = card;

  return (
    <div
      data-testid="approval-card"
      className="rounded-lg border bg-white p-4"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {subject.customerName ?? "Unknown customer"}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
              {approval.subjectKind.replace(/_/g, " ")}
            </span>
          </div>

          {/* Draft body — verbatim, no truncation */}
          {subject.draft && (
            <div className="mt-2 rounded border bg-gray-50 p-3 text-sm whitespace-pre-wrap">
              {subject.draft.subject && (
                <p className="font-medium mb-1">
                  Subject: {subject.draft.subject}
                </p>
              )}
              <div data-testid="draft-body">{subject.draft.bodyMarkdown}</div>
            </div>
          )}

          {/* Evidence refs */}
          <div className="mt-2">
            <EvidenceDrawer
              evidenceRefs={approval.evidenceRefs}
            />
          </div>
        </div>

        {/* Audit history */}
        <div className="flex flex-col items-end gap-1">
          <AuditDrawer events={auditHistory} />
        </div>
      </div>

      {/* Approval controls */}
      <div className="mt-3 border-t pt-3">
        <ApprovalAction
          approval={approval}
          policyWarnings={policyWarnings}
        />
      </div>
    </div>
  );
}
