import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  Database,
  MailCheck,
  Radio,
  RotateCcw,
  WalletCards
} from "lucide-react";
import type { ReactNode } from "react";
import { StatusPill } from "./StatusPill";
import { commandFacts, phaseSummary, type DemoPhase } from "./cockpit-data";

type RiskCommandBarProps = {
  phase: DemoPhase;
  bankFeedArmed: boolean;
  loading?: boolean;
  onSimulateReply: () => void | Promise<void>;
  onStartBankFeed: () => void | Promise<void>;
  onReset: () => void;
};

export function RiskCommandBar({
  phase,
  bankFeedArmed,
  loading = false,
  onReset,
  onSimulateReply,
  onStartBankFeed
}: RiskCommandBarProps) {
  const summary = phaseSummary[phase];

  return (
    <header className="rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow)]">
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.8fr)_auto] xl:items-center">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 items-center rounded-full bg-[var(--navy)] px-3 text-[0.68rem] font-black uppercase tracking-[0.1em] text-white">
              Payroll Risk Case
            </span>
            <StatusPill status={summary.riskStatus.toUpperCase()} />
            <span className="text-xs font-black uppercase tracking-[0.08em] text-[var(--muted)]">
              {commandFacts.caseRef}
            </span>
          </div>
          <div className="grid gap-1">
            <h1 className="m-0 text-2xl font-black tracking-normal text-[var(--navy)] sm:text-3xl">
              RunwayOps
            </h1>
            <p className="m-0 max-w-[72ch] text-sm font-semibold leading-6 text-[var(--muted)]">
              Payroll Risk Command for SMEs · {commandFacts.companyName}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-6">
          <CommandMetric
            icon={<WalletCards size={18} aria-hidden />}
            label="Cash today"
            value={summary.cashLabel}
          />
          <CommandMetric
            icon={<CalendarClock size={18} aria-hidden />}
            label="Payroll due"
            value={`${commandFacts.payrollDue} ${commandFacts.payrollDate}`}
          />
          <CommandMetric
            icon={<AlertTriangle size={18} aria-hidden />}
            label="Projected gap"
            value={summary.projectedGapLabel}
            helper={summary.projectedGapDetail}
          />
          <CommandMetric
            icon={<ClipboardCheck size={18} aria-hidden />}
            label="Approvals"
            value={`${commandFacts.approvalsPending} pending`}
          />
          <CommandMetric
            icon={<Database size={18} aria-hidden />}
            label="Plan"
            value={`${summary.planVersion} · ${summary.forecastVersion}`}
          />
          <CommandMetric
            icon={<CalendarClock size={18} aria-hidden />}
            label="Time to payroll"
            value={commandFacts.timeToPayroll}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:w-[300px] xl:grid-cols-1">
          <CommandButton
            disabled={loading || phase !== "baseline"}
            icon={<MailCheck size={17} aria-hidden />}
            label="Simulate Customer A Reply"
            onClick={onSimulateReply}
          />
          <CommandButton
            disabled={loading || phase === "bank" || bankFeedArmed}
            icon={<Radio size={17} aria-hidden />}
            label={bankFeedArmed ? "Bank Feed Running" : "Start Live Bank Feed"}
            onClick={onStartBankFeed}
          />
          <CommandButton
            icon={<RotateCcw size={17} aria-hidden />}
            label="Reset Demo"
            onClick={onReset}
            variant="secondary"
          />
        </div>
      </div>

      <div className="grid gap-3 border-t border-[var(--line)] px-4 py-3 md:grid-cols-[1fr_auto] md:items-center">
        <p className="m-0 text-sm font-semibold leading-6 text-[var(--text)]">
          {summary.headline}
        </p>
        <span className="text-xs font-black uppercase tracking-[0.08em] text-[var(--muted)]">
          {summary.caseStateLabel}
        </span>
      </div>
    </header>
  );
}

function CommandMetric({
  icon,
  label,
  value,
  helper
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="min-h-[86px] rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-3">
      <div className="mb-2 flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
        <span className="text-[var(--blue)]">{icon}</span>
        {label}
      </div>
      <div className="text-balance text-sm font-black leading-5 text-[var(--navy)]">
        {value}
      </div>
      {helper ? (
        <div className="mt-1 text-[0.72rem] font-semibold leading-4 text-[var(--muted)]">
          {helper}
        </div>
      ) : null}
    </div>
  );
}

function CommandButton({
  disabled = false,
  icon,
  label,
  onClick,
  variant = "primary"
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
  variant?: "primary" | "secondary";
}) {
  const variantClass =
    variant === "primary"
      ? "border-[var(--navy)] bg-[var(--navy)] text-white hover:bg-[#18395d]"
      : "border-[var(--line)] bg-white text-[var(--navy)] hover:border-[var(--line-strong)] hover:bg-[var(--panel-muted)]";

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-xs font-black uppercase tracking-[0.08em] transition disabled:cursor-not-allowed disabled:opacity-45 ${variantClass}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="text-center leading-4">{label}</span>
    </button>
  );
}
