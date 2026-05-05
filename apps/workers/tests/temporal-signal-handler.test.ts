import { describe, expect, it, vi } from "vitest";
import type { Client as TemporalClient } from "@temporalio/client";

import {
  buildTemporalApprovalSignalHandler,
  isApprovalEvent,
} from "../src/dispatcher/handlers/temporal-signal.js";
import type { DispatchedEvent } from "../src/dispatcher/index.js";

/**
 * The handler turns an outbox `approval.granted` (or .rejected, .edited)
 * event into a Temporal signal addressed at the workflow id stored on
 * the event payload. Real Temporal isn't booted here — fake the client
 * surface and pin the call shape.
 */

function buildEvent(overrides: Partial<DispatchedEvent> = {}): DispatchedEvent {
  return {
    id: "evt-1",
    eventType: "approval.granted",
    aggregateType: "approval",
    aggregateId: "appr-1",
    attempt: 1,
    payload: {
      approvalRequestId: "appr-1",
      workflowId: "wf-1",
      decision: "approved",
      decidedByUserId: "user-1",
      decidedAtIso: "2026-05-05T10:00:00.000Z",
      subjectKind: "message_draft",
      subjectId: "draft-1",
    },
    ...overrides,
  };
}

interface FakeWorkflowHandle {
  signal: ReturnType<typeof vi.fn>;
}

function buildFakeClient(): { client: TemporalClient; handle: FakeWorkflowHandle; getHandle: ReturnType<typeof vi.fn> } {
  const handle: FakeWorkflowHandle = { signal: vi.fn(async () => undefined) };
  const getHandle = vi.fn((_workflowId: string) => handle);
  const client = {
    workflow: { getHandle },
  } as unknown as TemporalClient;
  return { client, handle, getHandle };
}

describe("buildTemporalApprovalSignalHandler", () => {
  it("signals the workflow with approval_granted on approval.granted events", async () => {
    const { client, handle, getHandle } = buildFakeClient();
    const dispatch = buildTemporalApprovalSignalHandler(client);

    await dispatch(buildEvent());

    expect(getHandle).toHaveBeenCalledWith("wf-1");
    expect(handle.signal).toHaveBeenCalledTimes(1);
    const [signalName, payload] = handle.signal.mock.calls[0]!;
    expect(signalName).toBe("approval_granted");
    expect(payload).toMatchObject({
      approvalRequestId: "appr-1",
      decision: "approved",
      subjectKind: "message_draft",
      subjectId: "draft-1",
      decidedByUserId: "user-1",
      decidedAtIso: "2026-05-05T10:00:00.000Z",
    });
  });

  it("maps approval.rejected → approval_rejected", async () => {
    const { client, handle } = buildFakeClient();
    const dispatch = buildTemporalApprovalSignalHandler(client);
    await dispatch(
      buildEvent({
        eventType: "approval.rejected",
        payload: {
          ...(buildEvent().payload as object),
          decision: "rejected",
        },
      }),
    );
    expect(handle.signal.mock.calls[0]![0]).toBe("approval_rejected");
  });

  it("maps approval.edited → approval_edited", async () => {
    const { client, handle } = buildFakeClient();
    const dispatch = buildTemporalApprovalSignalHandler(client);
    await dispatch(
      buildEvent({
        eventType: "approval.edited",
        payload: {
          ...(buildEvent().payload as object),
          decision: "edited",
        },
      }),
    );
    expect(handle.signal.mock.calls[0]![0]).toBe("approval_edited");
  });

  it("rejects non-approval event types loudly (defence in depth)", async () => {
    const { client } = buildFakeClient();
    const dispatch = buildTemporalApprovalSignalHandler(client);
    await expect(
      dispatch(buildEvent({ eventType: "collection_action.approved" })),
    ).rejects.toThrow(/non-approval event type/);
  });

  it("rejects payloads missing required fields", async () => {
    const { client } = buildFakeClient();
    const dispatch = buildTemporalApprovalSignalHandler(client);
    await expect(
      dispatch(
        buildEvent({
          payload: {
            approvalRequestId: "appr-1",
            // workflowId missing
            decision: "approved",
            decidedByUserId: "u",
            decidedAtIso: "2026-05-05T10:00:00.000Z",
          },
        }),
      ),
    ).rejects.toThrow(/workflowId/);
  });

  it("propagates Temporal client errors so the dispatcher records a retry", async () => {
    const handle: FakeWorkflowHandle = {
      signal: vi.fn(async () => {
        throw new Error("workflow not found");
      }),
    };
    const client = {
      workflow: { getHandle: () => handle },
    } as unknown as TemporalClient;
    const dispatch = buildTemporalApprovalSignalHandler(client);
    await expect(dispatch(buildEvent())).rejects.toThrow(/workflow not found/);
  });

  it("falls back to subjectKind=message_draft + subjectId=approvalRequestId when omitted", async () => {
    const { client, handle } = buildFakeClient();
    const dispatch = buildTemporalApprovalSignalHandler(client);
    await dispatch(
      buildEvent({
        payload: {
          approvalRequestId: "appr-2",
          workflowId: "wf-2",
          decision: "approved",
          decidedByUserId: "u",
          decidedAtIso: "2026-05-05T10:00:00.000Z",
        },
      }),
    );
    const payload = handle.signal.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload["subjectKind"]).toBe("message_draft");
    expect(payload["subjectId"]).toBe("appr-2");
  });
});

describe("isApprovalEvent", () => {
  it("recognises the three approval event types", () => {
    expect(isApprovalEvent("approval.granted")).toBe(true);
    expect(isApprovalEvent("approval.rejected")).toBe(true);
    expect(isApprovalEvent("approval.edited")).toBe(true);
  });

  it("rejects unrelated event types", () => {
    expect(isApprovalEvent("collection_action.approved")).toBe(false);
    expect(isApprovalEvent("forecast.computed")).toBe(false);
  });
});
