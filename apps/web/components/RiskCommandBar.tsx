import { commandFacts, headlineFacts, phaseSummary, type DemoPhase } from "./cockpit-data";

type RiskCommandBarProps = {
  phase: DemoPhase;
};

export function RiskCommandBar({ phase }: RiskCommandBarProps) {
  const summary = phaseSummary[phase];
  const cashLabel = summary.cashLabel.includes("->")
    ? summary.cashLabel.split("->").pop()?.trim() ?? summary.cashLabel
    : summary.cashLabel;

  const headlineCopy =
    phase === "bank"
      ? "Risk eased to WATCH after Harbour Labs"
      : `Short by ${headlineFacts.shortBy} unless we act`;

  const headlineTone = phase === "bank" ? "text-[var(--green)]" : "text-[var(--amber-soft)]";

  return (
    <header className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--bg-deep)]/80 px-4 py-3 shadow-[var(--shadow)] backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[1.05rem] font-semibold tracking-tight text-[var(--text)]">
            RunwayOps
          </span>
        </div>

        <div className="hidden h-6 w-px bg-[var(--line-strong)] sm:block" aria-hidden />

        <PayrollPill phase={phase} />

        <div className="hidden h-6 w-px bg-[var(--line-strong)] lg:block" aria-hidden />

        <Stat label="Cash today" value={cashLabel} />
        <Stat label="Payroll due" value={commandFacts.payrollDue} />

        <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className={`m-0 text-base font-semibold tracking-tight ${headlineTone} amber-glow sm:text-[1.05rem]`}>
            {headlineCopy}
          </p>
          <p className="m-0 text-sm font-medium text-[var(--text-muted)]">
            {headlineFacts.approvalsCopy}
          </p>
          <Greeting name={headlineFacts.greeting} />
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span
      aria-hidden
      className="grid h-8 w-8 place-items-center rounded-md bg-[var(--surface-2)] text-[var(--amber)]"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4 L21 20 L3 20 Z" />
      </svg>
    </span>
  );
}

function PayrollPill({ phase }: { phase: DemoPhase }) {
  const isBank = phase === "bank";
  const pillClass = isBank
    ? "border-[var(--green)]/55 bg-[rgba(52,211,153,0.18)] text-[var(--green)]"
    : "border-[var(--red)]/55 bg-[rgba(239,106,74,0.16)] text-[var(--red)]";
  const dotClass = isBank
    ? "bg-[var(--green)] shadow-[0_0_8px_rgba(52,211,153,0.7)] motion-safe:animate-pulse"
    : "bg-[var(--red)] shadow-[0_0_8px_rgba(239,106,74,0.7)] motion-safe:animate-pulse";

  const label = isBank ? "Payroll Risk · WATCH" : "Payroll Risk · HIGH";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] ${pillClass}`}
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[0.68rem] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
        {label}
      </div>
      <div className="mt-1 text-[1.05rem] font-semibold tabular text-[var(--text)]">
        {value}
      </div>
    </div>
  );
}

function Greeting({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-[var(--text)]">{name}</span>
      <Avatar />
    </div>
  );
}

function Avatar() {
  return (
    <span
      aria-hidden
      className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-[var(--line-strong)] bg-gradient-to-br from-[#3a2a18] to-[#1f1815] text-sm font-semibold text-[var(--amber-soft)]"
    >
      EM
    </span>
  );
}

export function DemoControls({
  bankFeedArmed,
  loading,
  phase,
  onSimulateReply,
  onStartBankFeed,
  onReset
}: {
  phase: DemoPhase;
  bankFeedArmed: boolean;
  loading: boolean;
  onSimulateReply: () => void | Promise<void>;
  onStartBankFeed: () => void | Promise<void>;
  onReset: () => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <ControlButton
        disabled={loading || phase !== "baseline"}
        label="Simulate Customer A Reply"
        onClick={onSimulateReply}
        variant="primary"
      />
      <ControlButton
        disabled={loading || phase === "bank" || bankFeedArmed}
        label={bankFeedArmed ? "Bank Feed Running…" : "Start Live Bank Feed"}
        onClick={onStartBankFeed}
        variant="secondary"
      />
      <ControlButton
        label="Reset Demo"
        onClick={onReset}
        variant="ghost"
      />
    </div>
  );
}

function ControlButton({
  disabled = false,
  label,
  onClick,
  variant
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void | Promise<void>;
  variant: "primary" | "secondary" | "ghost";
}) {
  const variantClass: Record<typeof variant, string> = {
    primary:
      "border-transparent bg-[var(--amber)] text-[#1a1100] hover:bg-[var(--amber-soft)] shadow-[var(--shadow-amber)]",
    secondary:
      "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--amber)]/50 hover:bg-[var(--surface-2)]",
    ghost:
      "border-[var(--line)] bg-transparent text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
  };

  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 text-xs font-semibold tracking-tight transition disabled:cursor-not-allowed disabled:opacity-45 ${variantClass[variant]}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="leading-4">{label}</span>
    </button>
  );
}

