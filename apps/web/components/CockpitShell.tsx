"use client";

import { useEffect, useMemo, useState } from "react";
import { AgentWorkers } from "./AgentWorkers";
import { DraftApprovalPanel } from "./DraftApprovalPanel";
import { FounderBriefing } from "./FounderBriefing";
import { CashRunwayPanel, PaymentPlanRecommendation } from "./MainCaseBoard";
import { MongoAtlasLiveState } from "./MongoAtlasLiveState";
import { DemoControls, RiskCommandBar } from "./RiskCommandBar";
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

  if (risk === "watch" || activeForecast.endsWith("_v3")) return "bank";
  if (activeForecast.endsWith("_v2")) return "reply";
  if (activeForecast.endsWith("_v1")) return "baseline";

  const versions = new Set(state.forecasts?.map((forecast) => forecast.version));
  if (versions.has(3)) return "bank";
  if (versions.has(2)) return "reply";
  return "baseline";
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const state = await requestJson("/api/case-state");
        if (cancelled) return;

        const nextPhase = phaseFromState(state);
        setPhase(nextPhase);
        setError(null);

        if (nextPhase === "bank") setBankFeedArmed(false);
      } catch (refreshError) {
        if (!cancelled) {
          setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void refresh();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!bankFeedArmed) return;

    let cancelled = false;
    const interval = window.setInterval(() => {
      void requestJson("/api/case-state")
        .then((state) => {
          if (cancelled) return;

          const nextPhase = phaseFromState(state);
          setPhase(nextPhase);

          if (nextPhase === "bank") setBankFeedArmed(false);
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
          const result = await requestJson("/api/events/customer-reply", { method: "POST" });
          const nextPhase = phaseFromState(result);

          if (nextPhase === "baseline") {
            const state = await requestJson("/api/case-state");
            setPhase(phaseFromState(state));
          } else {
            setPhase(nextPhase);
          }

          setError(null);
        } catch (actionError) {
          setError(actionError instanceof Error ? actionError.message : String(actionError));
        }
      },
      startBankFeed: async () => {
        try {
          if (phase === "baseline") {
            await requestJson("/api/events/customer-reply", { method: "POST" });
            setPhase("reply");
          }

          await requestJson("/api/events/start-live-feed", { method: "POST" });

          setBankFeedArmed(true);
          setError(null);
        } catch (actionError) {
          setBankFeedArmed(false);
          setError(actionError instanceof Error ? actionError.message : String(actionError));
        }
      },
      reset: () => {
        setBankFeedArmed(false);
        setPhase("baseline");
        setError(null);
      }
    }),
    [phase]
  );

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto grid w-full max-w-[1400px] gap-5 px-4 pb-28 pt-5 sm:px-6 lg:px-8">
        <RiskCommandBar phase={phase} />

        {error ? <ErrorToast message={error} /> : null}

        <CashRunwayPanel bankFeedArmed={bankFeedArmed} phase={phase} />

        <section
          aria-label="Recommended actions"
          className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]"
        >
          <PaymentPlanRecommendation phase={phase} />
          <FounderBriefing phase={phase} />
        </section>

        <DraftApprovalPanel />

        <section
          aria-label="System state"
          className="grid gap-5 lg:grid-cols-2"
        >
          <AgentWorkers phase={phase} />
          <MongoAtlasLiveState phase={phase} />
        </section>

        <div className="sr-only" aria-live="polite">
          Current cockpit state is {phase}. {bankFeedArmed ? "Bank feed timer is running." : ""}
        </div>

        <FloatingDemoControls
          bankFeedArmed={bankFeedArmed}
          loading={loading}
          phase={phase}
          onReset={controls.reset}
          onSimulateReply={controls.simulateReply}
          onStartBankFeed={controls.startBankFeed}
        />
      </div>
    </main>
  );
}

function ErrorToast({ message }: { message: string }) {
  return (
    <div
      className="rounded-full border border-[rgba(239,106,74,0.45)] bg-[rgba(239,106,74,0.10)] px-4 py-2 text-xs font-medium tracking-tight text-[var(--red)]"
      role="alert"
    >
      <span
        aria-hidden
        className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--red)] align-middle shadow-[0_0_8px_rgba(239,106,74,0.7)]"
      />
      Live API error: {message}
    </div>
  );
}

function FloatingDemoControls(props: {
  phase: DemoPhase;
  bankFeedArmed: boolean;
  loading: boolean;
  onSimulateReply: () => void | Promise<void>;
  onStartBankFeed: () => void | Promise<void>;
  onReset: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 sm:bottom-6">
      <div className="pointer-events-auto rounded-full border border-[var(--line-strong)] bg-[var(--bg-deep)]/95 p-1.5 shadow-[var(--shadow)] backdrop-blur">
        <DemoControls {...props} />
      </div>
    </div>
  );
}
