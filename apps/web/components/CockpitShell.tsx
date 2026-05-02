"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, MailCheck, Radio, RotateCcw } from "lucide-react";
import { AgentWorkers } from "./AgentWorkers";
import { AuditWhyPanel } from "./AuditWhyPanel";
import { DraftApprovalPanel } from "./DraftApprovalPanel";
import { EventFeed } from "./EventFeed";
import { FounderBriefing } from "./FounderBriefing";
import { MainCaseBoard } from "./MainCaseBoard";
import { MemoryCardPreview } from "./MemoryCardPreview";
import { MongoAtlasLiveState } from "./MongoAtlasLiveState";
import { RiskCommandBar } from "./RiskCommandBar";
import type { DemoPhase } from "./cockpit-data";

type ApiCaseState = {
  ok?: boolean;
  error?: string;
  case?: {
    risk_level?: string;
    current_cash_gbp?: number;
    active_forecast_id?: string;
    active_payment_plan_id?: string;
  };
  forecasts?: Array<{ version?: number; _id?: string }>;
  paymentPlans?: Array<{ version?: number; _id?: string }>;
};

function phaseFromState(state: ApiCaseState): DemoPhase {
  const risk = state.case?.risk_level?.toLowerCase();
  const activeForecast = state.case?.active_forecast_id ?? "";

  if (risk === "watch" || activeForecast.endsWith("_v3")) {
    return "bank";
  }

  if (activeForecast.endsWith("_v2")) {
    return "reply";
  }

  if (activeForecast.endsWith("_v1")) {
    return "baseline";
  }

  const versions = new Set(state.forecasts?.map((forecast) => forecast.version));

  if (versions.has(3)) {
    return "bank";
  }

  if (versions.has(2)) {
    return "reply";
  }

  return "baseline";
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const json = (await response.json()) as ApiCaseState & { ok?: boolean; error?: string };

  if (!response.ok || json.ok === false) {
    throw new Error(json.error || `Request failed: ${response.status}`);
  }

  return json;
}

export function CockpitShell() {
  const [phase, setPhase] = useState<DemoPhase>("baseline");
  const [bankFeedArmed, setBankFeedArmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState("Connected to MongoDB Atlas live state.");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const state = await requestJson("/api/case-state");

        if (cancelled) {
          return;
        }

        const nextPhase = phaseFromState(state);

        setPhase(nextPhase);
        setError(null);

        if (nextPhase === "bank") {
          setBankFeedArmed(false);
        }
      } catch (refreshError) {
        if (!cancelled) {
          setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void refresh();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!bankFeedArmed) {
      return;
    }

    let cancelled = false;
    const interval = window.setInterval(() => {
      void requestJson("/api/case-state")
        .then((state) => {
          if (cancelled) {
            return;
          }

          const nextPhase = phaseFromState(state);

          setPhase(nextPhase);

          if (nextPhase === "bank") {
            setBankFeedArmed(false);
            setActionStatus("Harbour Labs bank event landed; forecast v3 written.");
          }
        })
        .catch((pollError) => {
          if (!cancelled) {
            setError(pollError instanceof Error ? pollError.message : String(pollError));
          }
        });
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [bankFeedArmed]);

  const controls = useMemo(
    () => ({
      simulateReply: async () => {
        try {
          setBankFeedArmed(false);
          setActionStatus("Writing Northstar reply to event_inbox...");
          const result = await requestJson("/api/events/customer-reply", { method: "POST" });
          const nextPhase = phaseFromState(result);

          if (nextPhase === "baseline") {
            const state = await requestJson("/api/case-state");
            setPhase(phaseFromState(state));
          } else {
            setPhase(nextPhase);
          }

          setActionStatus("Northstar classified as conditional; forecast v2 written.");
          setError(null);
        } catch (actionError) {
          setError(actionError instanceof Error ? actionError.message : String(actionError));
        }
      },
      startBankFeed: async () => {
        try {
          setActionStatus("Starting simulated live bank feed...");

          if (phase === "baseline") {
            await requestJson("/api/events/customer-reply", { method: "POST" });
            setPhase("reply");
          }

          const response = await requestJson("/api/events/start-live-feed", { method: "POST" });
          const delayMs = "delayMs" in response ? Number(response.delayMs) : 0;

          setBankFeedArmed(true);
          setActionStatus(
            delayMs > 0
              ? `Live bank feed armed; Harbour Labs event due in ${Math.round(delayMs / 1000)}s.`
              : "Live bank feed armed; waiting for Harbour Labs event."
          );
          setError(null);
        } catch (actionError) {
          setBankFeedArmed(false);
          setError(actionError instanceof Error ? actionError.message : String(actionError));
        }
      },
      reset: () => {
        setBankFeedArmed(false);
        setPhase("baseline");
        setActionStatus("Local view reset. Run npm run seed for a durable MongoDB reset.");
        setError(null);
      }
    }),
    [phase]
  );

  return (
    <main className="min-h-screen bg-[var(--bg)] px-3 py-4 text-[var(--text)] sm:px-4 lg:px-6">
      <div className="mx-auto grid w-full max-w-[1840px] gap-4">
        <RiskCommandBar
          bankFeedArmed={bankFeedArmed}
          loading={loading}
          onReset={controls.reset}
          onSimulateReply={controls.simulateReply}
          onStartBankFeed={controls.startBankFeed}
          phase={phase}
        />

        <div
          className={`rounded-lg border px-4 py-3 text-sm font-bold ${
            error
              ? "border-red-200 bg-red-50 text-[var(--red)]"
              : "border-emerald-200 bg-emerald-50 text-[var(--green)]"
          }`}
          role="status"
        >
          {error ? `Live API error: ${error}` : actionStatus}
        </div>

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_390px]">
          <EventFeed phase={phase} />

          <div className="grid gap-4">
            <MainCaseBoard bankFeedArmed={bankFeedArmed} phase={phase} />
            <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <AgentWorkers phase={phase} />
              <DraftApprovalPanel />
            </div>
          </div>

          <MongoAtlasLiveState phase={phase} />
        </div>

        <div className="grid gap-4 2xl:grid-cols-[1.05fr_0.95fr_0.85fr] lg:grid-cols-2">
          <AuditWhyPanel phase={phase} />
          <FounderBriefing phase={phase} />
          <MemoryCardPreview phase={phase} />
        </div>

        <div className="sr-only" aria-live="polite">
          Current cockpit state is {phase}. {bankFeedArmed ? "Bank feed timer is running." : ""}
        </div>

        <div className="fixed bottom-4 right-4 z-20 hidden gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 shadow-[var(--shadow-strong)] md:flex">
          <MiniControl
            disabled={phase !== "baseline"}
            icon={<MailCheck size={16} aria-hidden />}
            label="Reply"
            onClick={controls.simulateReply}
          />
          <MiniControl
            disabled={bankFeedArmed || phase === "bank"}
            icon={bankFeedArmed ? <Activity size={16} aria-hidden /> : <Radio size={16} aria-hidden />}
            label={bankFeedArmed ? "Live" : "Bank"}
            onClick={controls.startBankFeed}
          />
          <MiniControl
            icon={<RotateCcw size={16} aria-hidden />}
            label="Reset"
            onClick={controls.reset}
          />
        </div>
      </div>
    </main>
  );
}

function MiniControl({
  disabled = false,
  icon,
  label,
  onClick
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel-muted)] px-3 text-xs font-black uppercase tracking-[0.08em] text-[var(--navy)] transition hover:border-[var(--line-strong)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
