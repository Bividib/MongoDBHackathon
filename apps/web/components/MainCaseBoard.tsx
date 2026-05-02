"use client";

import { CalendarDays, ChevronDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { CashRunwayChart } from "./CashRunwayChart";
import { Panel } from "./Panel";
import { phaseSummary, type DemoPhase } from "./cockpit-data";

export function CashRunwayPanel({
  phase,
  bankEventSubmitting
}: {
  phase: DemoPhase;
  bankEventSubmitting: boolean;
}) {
  return (
    <Panel
      icon={<TrendingUp size={16} aria-hidden />}
      action={
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
          {bankEventSubmitting ? "Processing bank event" : `Forecast ${phaseSummary[phase].forecastVersion}`}
        </span>
      }
      title="Cash runway forecast"
      variant="default"
    >
      <CashRunwayChart phase={phase} />
    </Panel>
  );
}

export function PaymentPlanRecommendation({ phase }: { phase: DemoPhase }) {
  const [expanded, setExpanded] = useState(false);
  const summary = phaseSummary[phase];
  const headline =
    phase === "bank"
      ? "Hold Supplier X until Friday morning"
      : "Delay Supplier X by 5 days";
  const description =
    phase === "bank"
      ? "Cash improved to £9,600. Hold within the grace period until Northstar's payment confirms, then release."
      : "Supplier X gives us a 5-day grace period at no cost. Using it now buys breathing room while we chase customers.";

  return (
    <Panel
      icon={<CalendarDays size={16} aria-hidden />}
      title="Payment run recommendation"
      action={
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
          Plan {summary.planVersion}
        </span>
      }
      variant="default"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--amber-tint)] text-[var(--amber)]"
        >
          <CalendarDays size={16} aria-hidden />
        </span>
        <h3 className="m-0 min-w-0 flex-1 text-[0.95rem] font-semibold leading-5 tracking-tight text-[var(--text)]">
          {headline}
        </h3>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full bg-[var(--amber)] px-4 text-xs font-semibold text-[#1a1100] shadow-[var(--shadow-amber)] transition hover:bg-[var(--amber-soft)]"
          type="button"
        >
          Approve plan
        </button>
        <button
          aria-expanded={expanded}
          className="inline-flex min-h-9 items-center justify-center gap-1 rounded-full border border-[var(--line-strong)] bg-transparent px-3 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--amber)]/60 hover:text-[var(--text)]"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "Hide details" : "View details"}
          <ChevronDown
            aria-hidden
            className={`transition ${expanded ? "rotate-180" : ""}`}
            size={13}
          />
        </button>
      </div>

      {expanded ? (
        <div className="mt-3 grid gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <p className="m-0 text-[0.85rem] font-normal leading-6 text-[var(--text-muted)]">
            {description}
          </p>
          <p className="m-0 text-[0.72rem] font-medium text-[var(--text-faint)]">
            {summary.supplierDetail}
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
