/**
 * Outbox handler that forwards `approval.granted` / `approval.rejected`
 * / `approval.edited` events to the originating Temporal workflow as
 * the matching `approval*Signal`.
 *
 * Why this lives in the dispatcher: the API records decisions and
 * writes outbox events, but doesn't itself talk to Temporal. The
 * dispatcher is the single workers-side process with a Temporal
 * connection, so it owns the outbox → signal forwarding contract.
 *
 * Idempotency: at-least-once delivery means the same event id can
 * arrive more than once. Temporal's signal-by-name semantics handle
 * this naturally (the workflow's signal handler ignores duplicate
 * decisions on already-decided approvals).
 */
import type { Client as TemporalClient } from "@temporalio/client";

import type { DispatchedEvent, DispatchHandler } from "../index.js";
import type { ApprovalDecisionPayload } from "../../temporal/signal-types.js";

const APPROVAL_SIGNAL_NAMES = {
  "approval.granted": "approval_granted",
  "approval.rejected": "approval_rejected",
  "approval.edited": "approval_edited",
} as const;

type ApprovalEventType = keyof typeof APPROVAL_SIGNAL_NAMES;

interface OutboxApprovalPayload {
  approvalRequestId: string;
  workflowId: string;
  decision: "approved" | "rejected" | "edited";
  decidedByUserId: string;
  decidedAtIso: string;
  subjectKind?: string;
  subjectId?: string;
  note?: string;
}

function parsePayload(raw: unknown, eventType: string): OutboxApprovalPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error(`${eventType} payload must be an object, got ${typeof raw}`);
  }
  const obj = raw as Record<string, unknown>;
  const approvalRequestId = obj["approvalRequestId"];
  const workflowId = obj["workflowId"];
  const decision = obj["decision"];
  const decidedByUserId = obj["decidedByUserId"];
  const decidedAtIso = obj["decidedAtIso"];

  if (typeof approvalRequestId !== "string" || approvalRequestId.length === 0) {
    throw new Error(`${eventType}: missing string approvalRequestId`);
  }
  if (typeof workflowId !== "string" || workflowId.length === 0) {
    throw new Error(`${eventType}: missing string workflowId`);
  }
  if (decision !== "approved" && decision !== "rejected" && decision !== "edited") {
    throw new Error(`${eventType}: decision must be approved|rejected|edited`);
  }
  if (typeof decidedByUserId !== "string" || decidedByUserId.length === 0) {
    throw new Error(`${eventType}: missing string decidedByUserId`);
  }
  if (typeof decidedAtIso !== "string" || decidedAtIso.length === 0) {
    throw new Error(`${eventType}: missing string decidedAtIso`);
  }

  const out: OutboxApprovalPayload = {
    approvalRequestId,
    workflowId,
    decision,
    decidedByUserId,
    decidedAtIso,
  };
  if (typeof obj["subjectKind"] === "string") out.subjectKind = obj["subjectKind"];
  if (typeof obj["subjectId"] === "string") out.subjectId = obj["subjectId"];
  if (typeof obj["note"] === "string") out.note = obj["note"];
  return out;
}

/**
 * Build a dispatch handler bound to a Temporal client. The handler
 * looks up the workflow by id and signals the matching
 * `approval_*` channel. Workflow not found is treated as a hard
 * error (no auto-retry would help — the workflow isn't coming back).
 */
export function buildTemporalApprovalSignalHandler(
  client: TemporalClient,
): DispatchHandler {
  return async (event: DispatchedEvent): Promise<void> => {
    if (!isApprovalEvent(event.eventType)) {
      throw new Error(
        `temporal-signal handler invoked for non-approval event type ${event.eventType}`,
      );
    }
    const payload = parsePayload(event.payload, event.eventType);
    const signalName = APPROVAL_SIGNAL_NAMES[event.eventType];

    // Workflow's signal payload re-uses the API-side decision payload
    // with sensible defaults for the optional fields.
    const signalPayload: ApprovalDecisionPayload = {
      approvalRequestId: payload.approvalRequestId,
      subjectKind: (payload.subjectKind ?? "message_draft") as ApprovalDecisionPayload["subjectKind"],
      subjectId: payload.subjectId ?? payload.approvalRequestId,
      decision: payload.decision,
      decidedByUserId: payload.decidedByUserId,
      decidedAtIso: payload.decidedAtIso,
      ...(payload.note !== undefined ? { note: payload.note } : {}),
    };

    const handle = client.workflow.getHandle(payload.workflowId);
    await handle.signal(signalName, signalPayload);
  };
}

export function isApprovalEvent(eventType: string): eventType is ApprovalEventType {
  return Object.prototype.hasOwnProperty.call(APPROVAL_SIGNAL_NAMES, eventType);
}

/**
 * Convenience: build a handler map for all three approval event
 * types from a single Temporal client. Used by the worker boot path.
 */
export function buildApprovalDispatchHandlers(
  client: TemporalClient,
): Record<ApprovalEventType, DispatchHandler> {
  const handler = buildTemporalApprovalSignalHandler(client);
  return {
    "approval.granted": handler,
    "approval.rejected": handler,
    "approval.edited": handler,
  };
}
