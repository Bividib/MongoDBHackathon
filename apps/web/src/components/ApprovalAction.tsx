"use client";

import type { ApprovalRequestView, PolicyWarningView } from "@/fixtures/types";

type Props = {
  approval: ApprovalRequestView | undefined;
  policyWarnings?: PolicyWarningView[];
};

/**
 * Approval action controls.
 *
 * Hard rules enforced:
 * - "Request approval" only visible if no approval exists
 * - "Approve & send" DISABLED unless approval.status === "approved"
 *   (never enabled on "draft" alone)
 * - If any policy warning has severity "block", approve is disabled
 * - NO payment initiation button ever rendered
 */
export function ApprovalAction({ approval, policyWarnings = [] }: Props) {
  const hasBlockingPolicy = policyWarnings.some((w) => w.severity === "block");
  const isApproved = approval?.status === "approved";
  const isPending = approval?.status === "pending";
  const isRejected = approval?.status === "rejected";

  return (
    <div data-testid="approval-action" className="flex flex-wrap items-center gap-2">
      {/* Status indicator */}
      {!approval && (
        <button
          data-testid="request-approval-btn"
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          Request approval
        </button>
      )}

      {isPending && (
        <span
          data-testid="approval-pending"
          className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800"
        >
          Awaiting approval
        </span>
      )}

      {isApproved && (
        <span
          data-testid="approval-approved"
          className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800"
        >
          Approved
        </span>
      )}

      {isRejected && (
        <span
          data-testid="approval-rejected"
          className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800"
        >
          Rejected{approval.decision?.note ? `: ${approval.decision.note}` : ""}
        </span>
      )}

      {/* Approve button — DISABLED unless status is approved (no draft-only sends) */}
      {isPending && (
        <>
          <button
            data-testid="approve-btn"
            disabled={hasBlockingPolicy}
            title={
              hasBlockingPolicy
                ? `Blocked by policy: ${policyWarnings.find((w) => w.severity === "block")?.ruleId}`
                : "Approve & send"
            }
            className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Approve & send
          </button>
          <button
            data-testid="reject-btn"
            className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Reject
          </button>
          <button
            data-testid="defer-btn"
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Defer
          </button>
        </>
      )}

      {/* Policy warnings */}
      {policyWarnings.map((w) => (
        <span
          key={w.ruleId}
          data-testid={`policy-${w.severity}`}
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            w.severity === "block"
              ? "bg-red-100 text-red-800"
              : w.severity === "warn"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {w.message}
        </span>
      ))}

      {/*
        HARD REFUSAL: Never render a payment initiation button.
        This component has no "Pay", "Send payment", "Initiate payment",
        or "Transfer" affordance — ever.
      */}
    </div>
  );
}
