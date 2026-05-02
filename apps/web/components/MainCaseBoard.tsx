import { CalendarDays, TrendingUp } from "lucide-react";
import { CashRunwayChart } from "./CashRunwayChart";
import { Panel } from "./Panel";
import { phaseSummary, type DemoPhase } from "./cockpit-data";

export function CashRunwayPanel({
  phase,
  bankFeedArmed
}: {
  phase: DemoPhase;
  bankFeedArmed: boolean;
}) {
  return (
    <Panel
      icon={<TrendingUp size={16} aria-hidden />}
      action={
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
          {bankFeedArmed ? "Live bank feed armed" : `Forecast ${phaseSummary[phase].forecastVersion}`}
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
      <div className="grid gap-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--amber-tint)] text-[var(--amber)] shadow-[var(--shadow-amber)]"
          >
            <CalendarDays size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="m-0 text-[1rem] font-semibold tracking-tight text-[var(--text)]">
              {headline}
            </h3>
            <p className="m-0 mt-1.5 text-[0.85rem] font-normal leading-6 text-[var(--text-muted)]">
              {description}
            </p>
            <p className="m-0 mt-2 text-[0.72rem] font-medium text-[var(--text-faint)]">
              {summary.supplierDetail}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--amber)] px-4 text-sm font-semibold text-[#1a1100] shadow-[var(--shadow-amber)] transition hover:bg-[var(--amber-soft)]"
            type="button"
          >
            Approve plan
          </button>
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--line-strong)] bg-transparent px-4 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--amber)]/60 hover:text-[var(--amber-soft)]"
            type="button"
          >
            View details
          </button>
        </div>
      </div>
    </Panel>
  );
}
