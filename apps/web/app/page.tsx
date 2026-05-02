import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BellRing,
  BriefcaseBusiness,
  Clock3,
  Database,
  FileText,
  Headphones,
  MailCheck,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import {
  DEMO_CASE,
  buildForecastSequence,
  formatCurrency
} from "@/lib/forecast";

const forecasts = buildForecastSequence();
const latestForecast = forecasts[forecasts.length - 1];

const eventFeed = [
  ["scheduler.payroll_scan", "Payroll-risk scan opened PR-2026-0508"],
  ["forecast.v1_created", "Baseline gap identified at £5,200"],
  ["drafts.created", "Three approval-ready actions queued"],
  ["email.received", "Northstar reply classified as conditional"],
  ["forecast.v2_created", "Scenario split preserved HIGH risk"],
  ["bank.transaction.posted", "Harbour Labs retainer +£1,200"],
  ["forecast.v3_created", "Risk moved HIGH -> WATCH"],
  ["memory_card.written", "Northstar PO behaviour stored"]
];

const workerRows = [
  ["Event Router", "complete", "Routed bank.transaction.posted"],
  ["Forecast Agent", "complete", "Generated forecast v3"],
  ["Customer Memory Agent", "complete", "Classified conditional promise"],
  ["Collections Agent", "queued", "Northstar confirmation draft"],
  ["Payment Run Agent", "complete", "Supplier X conditional hold"],
  ["Audit / Learning Agent", "complete", "Briefing and memory card"]
];

const liveStateRows = [
  ["event_inbox", "evt_bank_harbour_001", "+1", "Workflow wakeup"],
  ["agent_runs", "run_audit_006", "+6", "Worker trace"],
  ["cashflow_forecasts", "forecast_case_0508_v3", "v2 -> v3", "HIGH -> WATCH"],
  ["payment_run_plans", "plan_case_0508_v3", "v2 -> v3", "Conditional hold"],
  ["memory_cards", "mem_northstar_po_conditional_promises", "+1", "Future case memory"]
];

const draftRows = [
  ["Northstar confirmation", "Ask for explicit PO/payment confirmation", "pending"],
  ["Blue Finch reminder", "Formal finance-team wording with invoice attached", "pending"],
  ["Supplier X hold", "Hold within 5-day no-penalty grace terms", "pending"]
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--text)] md:p-6">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-4">
        <RiskCommandBar />

        <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <Panel title="Event Feed" icon={<BellRing size={18} aria-hidden />}>
            <ol className="space-y-3">
              {eventFeed.map(([type, label]) => (
                <li key={type} className="grid grid-cols-[10px_1fr] gap-3">
                  <span className="mt-2 h-2.5 w-2.5 rounded-full bg-[var(--blue)]" />
                  <span>
                    <span className="block text-xs font-semibold text-[var(--blue)]">
                      {type}
                    </span>
                    <span className="block text-sm text-[var(--muted)]">{label}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <div className="grid gap-4">
            <Panel
              title="Payroll Risk Case"
              icon={<BriefcaseBusiness size={18} aria-hidden />}
            >
              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {forecasts[0].scenarios.map((scenario) => (
                      <ScenarioCard
                        key={scenario.id}
                        label={scenario.label}
                        value={scenario.fridayPositionAfterPayroll}
                        risk={scenario.riskStatus}
                      />
                    ))}
                  </div>

                  <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="text-sm font-bold text-[var(--navy)]">
                        Live Replanning Cascade
                      </h2>
                      <span className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs font-semibold text-[var(--navy)]">
                        Forecast v{latestForecast.version}
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Metric label="Cash after bank event" value="£9,600" />
                      <Metric label="If Northstar slips" value="-£1,600" tone="risk" />
                      <Metric label="If Northstar pays" value="£800 left" tone="watch" />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <SectionLabel>Invoice Priority</SectionLabel>
                  <PriorityItem
                    name="Northstar Studio"
                    meta="INV-1042 · £4,800 · 18 days overdue"
                    note="Main payroll dependency; PO-dependent payer"
                  />
                  <PriorityItem
                    name="Blue Finch Ltd"
                    meta="INV-1048 · £2,200 · 7 days overdue"
                    note="Backup collection target; formal wording works"
                  />
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
                    <div className="mb-1 font-bold text-[var(--amber)]">
                      Supplier X Recommendation
                    </div>
                    <div className="text-[var(--text)]">
                      Full delay <ArrowRight className="mx-1 inline" size={14} aria-hidden />{" "}
                      conditional hold until Northstar payment clears.
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <Panel title="Agent Workers" icon={<ShieldCheck size={18} aria-hidden />}>
                <div className="space-y-3">
                  {workerRows.map(([name, status, detail]) => (
                    <div
                      key={name}
                      className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-[var(--line)] p-3"
                    >
                      <div>
                        <div className="text-sm font-bold text-[var(--navy)]">{name}</div>
                        <div className="text-xs text-[var(--muted)]">{detail}</div>
                      </div>
                      <StatusPill status={status} />
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Drafts / Approvals" icon={<MailCheck size={18} aria-hidden />}>
                <div className="space-y-3">
                  {draftRows.map(([title, detail, status]) => (
                    <div
                      key={title}
                      className="rounded-lg border border-[var(--line)] bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-[var(--navy)]">{title}</div>
                          <div className="mt-1 text-xs text-[var(--muted)]">{detail}</div>
                        </div>
                        <StatusPill status={status} />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>
          </div>

          <Panel title="MongoDB Atlas Live State" icon={<Database size={18} aria-hidden />}>
            <div className="space-y-3">
              {liveStateRows.map(([collection, id, change, why]) => (
                <div
                  key={id}
                  className="rounded-lg border border-[var(--line)] bg-white p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[var(--navy)]">{collection}</span>
                    <span className="rounded-full bg-[var(--panel-muted)] px-2 py-1 text-xs font-bold text-[var(--blue)]">
                      {change}
                    </span>
                  </div>
                  <div className="truncate text-xs text-[var(--muted)]">{id}</div>
                  <div className="mt-2 text-xs font-semibold text-[var(--text)]">{why}</div>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Panel title="Audit / Why" icon={<FileText size={18} aria-hidden />}>
            <div className="grid gap-3 md:grid-cols-2">
              <AuditItem
                title="What changed?"
                body="Harbour Labs posted a £1,200 retainer, reducing the Friday shortfall."
              />
              <AuditItem
                title="Why not safe?"
                body="Northstar's Friday payment depends on PO re-approval, so it cannot be counted as guaranteed cash."
              />
              <AuditItem
                title="Supplier X"
                body="The recommendation changes from full delay to conditional hold within written grace terms."
              />
              <AuditItem
                title="Approval"
                body="Customer emails and supplier timing remain pending human approval."
              />
            </div>
          </Panel>

          <Panel title="Founder Briefing + Memory" icon={<Headphones size={18} aria-hidden />}>
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-lg border border-[var(--line)] bg-white p-4">
                <div className="mb-2 text-sm font-bold text-[var(--navy)]">
                  Briefing Transcript
                </div>
                <p className="m-0 text-sm leading-6 text-[var(--muted)]">
                  Payroll risk is now watch, not cleared. Harbour Labs paid £1,200.
                  Northstar says they should be able to pay Friday, but payment depends
                  on PO re-approval. Approve the Northstar confirmation email, hold
                  Supplier X until Friday morning, and keep chasing Blue Finch.
                </p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-4">
                <div className="mb-2 text-sm font-bold text-[var(--navy)]">
                  Next Case Preview
                </div>
                <ul className="m-0 space-y-2 p-0 text-sm text-[var(--muted)]">
                  <li className="flex gap-2">
                    <BadgeCheck className="mt-0.5 shrink-0 text-[var(--green)]" size={16} />
                    Treat "should be able to pay" as conditional.
                  </li>
                  <li className="flex gap-2">
                    <BadgeCheck className="mt-0.5 shrink-0 text-[var(--green)]" size={16} />
                    Require explicit PO/payment confirmation.
                  </li>
                  <li className="flex gap-2">
                    <BadgeCheck className="mt-0.5 shrink-0 text-[var(--green)]" size={16} />
                    Use direct finance-team wording.
                  </li>
                </ul>
              </div>
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function RiskCommandBar() {
  return (
    <header className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--navy)] px-3 py-1 text-xs font-bold uppercase text-white">
              Payroll Risk Case
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase text-[var(--amber)]">
              WATCH
            </span>
            <span className="text-sm font-semibold text-[var(--muted)]">PR-2026-0508</span>
          </div>
          <h1 className="mt-2 text-2xl font-black text-[var(--navy)] md:text-3xl">
            RunwayOps
          </h1>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:min-w-[760px]">
          <CommandMetric icon={<WalletCards size={18} />} label="Cash" value="£8,400 -> £9,600" />
          <CommandMetric icon={<Clock3 size={18} />} label="Payroll Due" value="£11,200 Fri" />
          <CommandMetric icon={<AlertTriangle size={18} />} label="Worst Gap" value="£1,600" />
          <CommandMetric icon={<FileText size={18} />} label="Plan" value="v3 pending approval" />
        </div>
      </div>
    </header>
  );
}

function Panel({
  title,
  icon,
  children
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow)]">
      <div className="mb-4 flex items-center gap-2 text-[var(--navy)]">
        {icon}
        <h2 className="m-0 text-sm font-black uppercase">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function CommandMetric({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase text-[var(--muted)]">
        {icon}
        {label}
      </div>
      <div className="text-sm font-black text-[var(--navy)]">{value}</div>
    </div>
  );
}

function ScenarioCard({
  label,
  value,
  risk
}: {
  label: string;
  value: number;
  risk: string;
}) {
  const isPositive = value >= 0;
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="mb-2 min-h-10 text-sm font-bold text-[var(--navy)]">{label}</div>
      <div className={isPositive ? "text-2xl font-black text-[var(--green)]" : "text-2xl font-black text-[var(--red)]"}>
        {formatCurrency(value)}
      </div>
      <div className="mt-2 text-xs font-bold uppercase text-[var(--muted)]">{risk}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "risk" | "watch";
}) {
  const toneClass =
    tone === "risk"
      ? "text-[var(--red)]"
      : tone === "watch"
        ? "text-[var(--amber)]"
        : "text-[var(--navy)]";
  return (
    <div className="rounded-lg bg-white p-3">
      <div className="text-xs font-bold uppercase text-[var(--muted)]">{label}</div>
      <div className={`mt-1 text-xl font-black ${toneClass}`}>{value}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="m-0 text-xs font-black uppercase text-[var(--muted)]">{children}</h3>;
}

function PriorityItem({
  name,
  meta,
  note
}: {
  name: string;
  meta: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="text-sm font-black text-[var(--navy)]">{name}</div>
      <div className="mt-1 text-xs font-bold text-[var(--blue)]">{meta}</div>
      <div className="mt-2 text-sm text-[var(--muted)]">{note}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const className =
    status === "complete"
      ? "bg-green-50 text-[var(--green)]"
      : status === "queued"
        ? "bg-blue-50 text-[var(--blue)]"
        : "bg-amber-50 text-[var(--amber)]";
  return (
    <span className={`h-fit rounded-full px-2 py-1 text-xs font-black uppercase ${className}`}>
      {status}
    </span>
  );
}

function AuditItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="mb-1 text-sm font-black text-[var(--navy)]">{title}</div>
      <p className="m-0 text-sm leading-6 text-[var(--muted)]">{body}</p>
    </div>
  );
}
