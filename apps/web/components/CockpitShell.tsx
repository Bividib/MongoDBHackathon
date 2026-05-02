"use client";

import { useEffect, useMemo, useState } from "react";
import { AgentWorkers } from "./AgentWorkers";
import { AuditTrail } from "./AuditTrail";
import { CustomerCommsPanel } from "./CustomerCommsPanel";
import { DraftApprovalPanel } from "./DraftApprovalPanel";
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
  const [bankEventSubmitting, setBankEventSubmitting] = useState(false);
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

        if (nextPhase === "bank") setBankEventSubmitting(false);
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

  const controls = useMemo(
    () => ({
      simulateReply: async () => {
        try {
          setBankEventSubmitting(false);
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
          setBankEventSubmitting(true);
          await requestJson("/api/events/bank-transaction", { method: "POST" });
          const state = await requestJson("/api/case-state");
          setPhase(phaseFromState(state));
          setError(null);
        } catch (actionError) {
          setError(actionError instanceof Error ? actionError.message : String(actionError));
        } finally {
          setBankEventSubmitting(false);
        }
      },
      reset: () => {
        setBankEventSubmitting(false);
        setPhase("baseline");
        setError(null);
      }
    }),
    [phase]
  );

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto grid w-full max-w-[1400px] gap-3 px-4 pb-24 pt-3 sm:px-5 lg:px-6">
        <RiskCommandBar phase={phase} />
        <DemoStepExplainer phase={phase} bankEventSubmitting={bankEventSubmitting} />

        {error ? <ErrorToast message={error} /> : null}

        <section aria-label="Forecast and plan" className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <CashRunwayPanel bankEventSubmitting={bankEventSubmitting} phase={phase} />
          <div className="grid gap-3">
            <PaymentPlanRecommendation phase={phase} />
            <CustomerCommsPanel phase={phase} />
          </div>
        </section>

        <DraftApprovalPanel />

        <section
          aria-label="System state"
          className="grid gap-3 lg:grid-cols-[1fr_1fr]"
        >
          <AgentWorkers phase={phase} />
          <div className="grid gap-3">
            <MongoAtlasLiveState phase={phase} />
            <AuditTrail phase={phase} />
          </div>
        </section>

        <div className="sr-only" aria-live="polite">
          Current cockpit state is {phase}. {bankEventSubmitting ? "Bank event is processing." : ""}
        </div>

        <FloatingDemoControls
          bankEventSubmitting={bankEventSubmitting}
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

function DemoStepExplainer({
  phase,
  bankEventSubmitting
}: {
  phase: DemoPhase;
  bankEventSubmitting: boolean;
}) {
  const steps = [
    {
      label: "1",
      title: "Customer reply",
      body:
        phase === "baseline"
          ? "Click Step 1 to insert Northstar's conditional email into MongoDB."
          : "\"Should be able to pay Friday once the PO is re-approved\" is stored as a conditional promise, so risk stays HIGH.",
      active: phase === "baseline",
      done: phase === "reply" || phase === "bank"
    },
    {
      label: "2",
      title: "Agent replan",
      body:
        phase === "bank"
          ? "Harbour Labs paid GBP 1,200; the graph replanned the case immediately."
          : "Click Step 2 after the reply to post the bank transaction with no timer delay.",
      active: phase === "reply" || bankEventSubmitting,
      done: phase === "bank"
    },
    {
      label: "3",
      title: "Approval decision",
      body:
        phase === "bank"
          ? "Risk is WATCH, not SAFE. Approvals, audit proof, and memory are ready."
          : "The screen shows why the agents recommend each action before anything is sent.",
      active: phase === "bank",
      done: phase === "bank"
    }
  ];

  return (
    <section
      aria-label="Demo workflow"
      className="grid gap-2 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]/82 p-3 shadow-[var(--shadow)] sm:grid-cols-3"
    >
      {steps.map((step) => (
        <article
          key={step.label}
          className={`grid grid-cols-[2rem_1fr] gap-3 rounded-[var(--radius-sm)] border p-3 ${
            step.active || step.done
              ? "border-[rgba(245,166,35,0.45)] bg-[var(--amber-tint)]"
              : "border-[var(--line)] bg-[var(--surface-muted)]"
          }`}
        >
          <span
            className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${
              step.done
                ? "bg-[var(--green)] text-[#06150f]"
                : step.active
                  ? "bg-[var(--amber)] text-[#1a1100]"
                  : "bg-[var(--surface-2)] text-[var(--text-muted)]"
            }`}
          >
            {step.done ? "OK" : step.label}
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-semibold tracking-tight text-[var(--text)]">
              {step.title}
            </strong>
            <span className="mt-1 block text-[0.78rem] leading-5 text-[var(--text-muted)]">
              {bankEventSubmitting && step.label === "2"
                ? "Posting the bank transaction and rerunning LangGraph now..."
                : step.body}
            </span>
          </span>
        </article>
      ))}
    </section>
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
  bankEventSubmitting: boolean;
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
