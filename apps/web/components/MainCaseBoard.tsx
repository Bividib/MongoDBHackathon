import { CalendarDays } from "lucide-react";
import { CashRunwayChart } from "./CashRunwayChart";
import { Panel } from "./Panel";
import { invoicePriority, phaseSummary, type DemoPhase } from "./cockpit-data";

export function MainCaseBoard({
  phase,
  bankFeedArmed
}: {
  phase: DemoPhase;
  bankFeedArmed: boolean;
}) {
  return (
    <div className="grid gap-4">
      <CashRunwayPanel bankFeedArmed={bankFeedArmed} phase={phase} />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <InvoicePriorityBoard phase={phase} />
        <PaymentPlanRecommendation phase={phase} />
      </div>
    </div>
  );
}

function CashRunwayPanel({ phase, bankFeedArmed }: { phase: DemoPhase; bankFeedArmed: boolean }) {
  return (
    <Panel
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

function InvoicePriorityBoard({ phase: _phase }: { phase: DemoPhase }) {
  return (
    <Panel title="Invoice priority board" variant="default">
      <div className="grid gap-3">
        {invoicePriority.map((invoice, index) => (
          <article
            key={invoice.invoice}
            className="grid grid-cols-[36px_1fr_auto] items-center gap-4 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3.5 transition hover:border-[var(--line-strong)]"
          >
            <span
              aria-hidden
              className="grid h-9 w-9 place-items-center rounded-full border border-[rgba(245,166,35,0.4)] bg-[var(--amber-tint)] text-sm font-semibold text-[var(--amber-soft)]"
            >
              {index + 1}
            </span>

            <div className="min-w-0">
              <h3 className="m-0 text-[0.95rem] font-semibold tracking-tight text-[var(--text)]">
                {invoice.customer}
              </h3>
              <p className="m-0 mt-0.5 text-sm font-normal leading-5 text-[var(--text-muted)]">
                {invoice.behaviour}
              </p>
            </div>

            <div className="text-right">
              <div className="text-[0.95rem] font-semibold tabular text-[var(--text)]">
                {invoice.amount}
              </div>
              <div className="mt-0.5 text-xs font-medium text-[var(--red)]">
                {invoice.age}
              </div>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function PaymentPlanRecommendation({ phase }: { phase: DemoPhase }) {
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
    <Panel title="Payment plan recommendation" variant="default">
      <div className="grid gap-4">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--amber-tint)] text-[var(--amber)] shadow-[var(--shadow-amber)]"
          >
            <CalendarDays size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="m-0 text-[1.05rem] font-semibold tracking-tight text-[var(--text)]">
              {headline}
            </h3>
            <p className="m-0 mt-1.5 text-sm font-normal leading-6 text-[var(--text-muted)]">
              {description}
            </p>
            <p className="m-0 mt-2 text-xs font-medium text-[var(--text-faint)]">
              {summary.supplierDetail}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--amber)] px-5 text-sm font-semibold text-[#1a1100] shadow-[var(--shadow-amber)] transition hover:bg-[var(--amber-soft)]"
            type="button"
          >
            Approve plan
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line-strong)] bg-transparent px-5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--amber)]/60 hover:text-[var(--amber-soft)]"
            type="button"
          >
            View details
          </button>
        </div>
      </div>
    </Panel>
  );
}
