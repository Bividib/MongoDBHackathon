/**
 * API client + adapter tests.
 *
 * Mocks fetch and asserts:
 *  - The demo header is injected when WEB_DEMO_MODE is on.
 *  - The demo header is OMITTED when demo mode is off (Phase 7+ readiness).
 *  - Wire-shaped responses adapt cleanly into the view models the Server
 *    Components consume (no bigint, no missing fields).
 */
import { describe, it, expect, vi } from "vitest";

import { ApiClient } from "@/lib/api";
import {
  adaptApprovalInbox,
  adaptDailyCashActions,
  adaptForecastScreen,
} from "@/lib/adapters";
import type {
  WireApprovalRequest,
  WireCashForecast,
  WireCollectionAction,
} from "@/lib/api-types";

function buildForecast(): WireCashForecast {
  return {
    forecastId: "forecast-1",
    companyId: "comp-1",
    generatedAt: "2026-05-05T08:00:00.000Z",
    asOfDate: "2026-05-05",
    horizonDays: 30,
    triggerEventIds: [],
    cashBalance: { amountMinor: "3200000", currency: "GBP" },
    expectedInflows: [],
    confidenceWeightedInflows: [],
    expectedOutflows: [],
    riskStatus: "warning",
    scenarios: [
      {
        id: "sc-base",
        name: "base",
        riskStatus: "warning",
        cashBalance: { amountMinor: "3200000", currency: "GBP" },
        evidenceRefs: [],
      },
    ],
    confidenceBands: [],
    obligationRisks: [],
    evidenceRefs: [{ kind: "forecast", id: "forecast-1" }],
  };
}

function buildAction(): WireCollectionAction {
  return {
    id: "act-1",
    companyId: "comp-1",
    customerId: "cust-1",
    invoiceId: "inv-1",
    actionKind: "request_payment",
    channel: "email",
    tone: "neutral",
    status: "awaiting_approval",
    priorityScore: 73.4,
    expectedCashImpact: { amountMinor: "1500000", currency: "GBP" },
    probabilityOfPayment: 0.8,
    evidenceConfidence: 0.7,
    relationshipRiskPenalty: 0.1,
    actionEffortPenalty: 0.05,
    requiresApproval: true,
    recommendedAt: "2026-05-05T07:00:00.000Z",
    reason: "Overdue 14d, no recent contact.",
    evidenceRefs: [{ kind: "invoice", id: "inv-1", summary: "INV-1024 overdue" }],
    createdAt: "2026-05-05T07:00:00.000Z",
    updatedAt: "2026-05-05T07:00:00.000Z",
  };
}

function buildApproval(): WireApprovalRequest {
  return {
    id: "appr-1",
    companyId: "comp-1",
    subjectKind: "external_message",
    subjectId: "act-1",
    status: "pending",
    requestedAt: "2026-05-05T07:30:00.000Z",
    evidenceRefs: [{ kind: "collection_action", id: "act-1" }],
  };
}

describe("ApiClient demo header injection", () => {
  it("attaches the demo header when demo mode is on", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, data: buildForecast() }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const client = new ApiClient({
      baseUrl: "http://api.test",
      demoMode: true,
      demoCompanyId: "10000000-0000-4000-8000-000000000001",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.getLatestForecast();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const init = call[1];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-runway-demo-company-id"]).toBe(
      "10000000-0000-4000-8000-000000000001",
    );
  });

  it("omits the demo header when demo mode is off", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const client = new ApiClient({
      baseUrl: "http://api.test",
      demoMode: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.listActions("awaiting_approval");

    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const init = call[1];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-runway-demo-company-id"]).toBeUndefined();
  });

  it("returns null on 404 from getLatestForecast", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: "NOT_FOUND", message: "no forecast", statusCode: 404 },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );

    const client = new ApiClient({
      baseUrl: "http://api.test",
      demoMode: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await client.getLatestForecast()).toBeNull();
  });
});

describe("Adapters render wire shapes into view models", () => {
  it("adaptDailyCashActions produces formatted money strings", () => {
    const data = adaptDailyCashActions({
      forecast: buildForecast(),
      actions: [buildAction()],
      asOfDate: "2026-05-05",
    });

    expect(data.actions).toHaveLength(1);
    const action = data.actions[0]!;
    expect(action.amountDue.formatted).toBe("£15,000.00");
    expect(action.amountDue.rawMinor).toBe("1500000");
    expect(action.recommendedChannel).toBe("email");
    expect(data.forecast.cashBalance.formatted).toBe("£32,000.00");
    expect(data.forecast.riskStatus).toBe("warning");
  });

  it("adaptApprovalInbox splits pending vs decided", () => {
    const inbox = adaptApprovalInbox([
      buildApproval(),
      { ...buildApproval(), id: "appr-2", status: "approved" },
    ]);
    expect(inbox.pending).toHaveLength(1);
    expect(inbox.recentlyDecided).toHaveLength(1);
    expect(inbox.pending[0]!.approval.id).toBe("appr-1");
  });

  it("adaptForecastScreen handles wire-shaped (string) money without bigint errors", () => {
    const screen = adaptForecastScreen(buildForecast());
    expect(screen.forecast.cashBalance.formatted).toBe("£32,000.00");
    expect(screen.forecast.scenarios).toHaveLength(1);
    expect(screen.forecast.scenarios[0]!.name).toBe("base");
  });
});
