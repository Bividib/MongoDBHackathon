import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  GitBranch,
  ReceiptText,
  ShieldAlert
} from "lucide-react";
import { formatCurrency } from "@/lib/forecast";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import {
  approvalQueue,
  invoicePriority,
  phaseForecasts,
  phaseOrder,
  phaseSummary,
  runwayTimeline,
  type DemoPhase
} from "./cockpit-data";

export function MainCaseBoard({
  phase,
  bankFeedArmed
}: {
  phase: DemoPhase;
  bankFeedArmed: boolean;
}) {
  const forecast = phaseForecasts[phase];
  const summary = phaseSummary[phase];
  const currentOrder = phaseOrder[phase];

  return (
    <Panel
      action={<StatusPill status={`Forecast ${summary.forecastVersion}`} tone="neutral" />}
      eyebrow="Main work surface"
      icon={<BriefcaseBusiness size={18} aria-hidden />}
      title="Main Case Board"
    >
      <div className="grid gap-4">
        <div className="grid gap-4 2xl:grid-cols-[1.08fr_0.92fr]">
          <section className="rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="m-0 text-sm font-black uppercase tracking-[0.08em] text-[var(--navy)]">
                  Cash Runway Timeline
                </h3>
                <p className="m-0 mt-1 text-sm font-semibold text-[var(--muted)]">
                  Deterministic cash math keeps the agentic decisions explainable.
                </p>
              </div>
              <StatusPill status={bankFeedArmed ? "bank feed live" : summary.riskStatus} />
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              {runwayTimeline.map((step) => {
                const isActive = phaseOrder[step.phase] <= currentOrder || bankFeedArmed;
                return (
                  <div
                    key={`${step.day}-${step.title}`}
                    className={`min-h-[150px] rounded-md border p-3 ${
                      isActive
                        ? "border-[var(--line-strong)] bg-white"
                        : "border-dashed border-[var(--line)] bg-[var(--panel-muted)] opacity-60"
                    }`}
                  >
                    <div className="mb-3 flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                      <CalendarDays size={14} aria-hidden />
                      {step.day}
                    </div>
                    <div className="text-sm font-black leading-5 text-[var(--navy)]">
                      {step.title}
                    </div>
                    <div
                      className={`mt-2 text-xl font-black ${
                        step.amount.startsWith("-")
                          ? "text-[var(--red)]"
                          : step.amount.startsWith("+")
                            ? "text-[var(--green)]"
                            : "text-[var(--navy)]"
                      }`}
                    >
                      {step.amount}
                    </div>
                    <p className="m-0 mt-2 text-xs font-semibold leading-5 text-[var(--muted)]">
                      {step.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-md border border-[var(--line)] bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <GitBranch size={18} className="text-[var(--blue)]" aria-hidden />
              <h3 className="m-0 text-sm font-black uppercase tracking-[0.08em] text-[var(--navy)]">
                Scenario Split
              </h3>
            </div>
            <div className="grid gap-3">
              {forecast.scenarios.map((scenario) => (
                <article
                  key={scenario.id}
                  className="rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="m-0 text-sm font-black leading-5 text-[var(--navy)]">
                        {scenario.label}
                      </h4>
                      {scenario.confidence ? (
                        <p className="m-0 mt-1 text-xs font-bold text-[var(--muted)]">
                          Conditional confidence {Math.round(scenario.confidence * 100)}%
                        </p>
                      ) : null}
                    </div>
                    <StatusPill status={scenario.riskStatus} />
                  </div>
                  <div
                    className={`mt-3 text-2xl font-black ${
                      scenario.fridayPositionAfterPayroll >= 0
                        ? "text-[var(--green)]"
                        : "text-[var(--red)]"
                    }`}
                  >
                    {formatCurrency(scenario.fridayPositionAfterPayroll)}
                  </div>
                  {scenario.balanceAfterSupplierPaid !== undefined ? (
                    <div className="mt-1 text-sm font-bold text-[var(--muted)]">
                      {formatCurrency(scenario.balanceAfterSupplierPaid)} after Supplier X
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>

        <div className="grid gap-4 2xl:grid-cols-[0.95fr_0.75fr_0.8fr]">
          <section className="rounded-md border border-[var(--line)] bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <ReceiptText size={18} className="text-[var(--blue)]" aria-hidden />
              <h3 className="m-0 text-sm font-black uppercase tracking-[0.08em] text-[var(--navy)]">
                Invoice Priority
              </h3>
            </div>
            <div className="grid gap-3">
              {invoicePriority.map((invoice) => (
                <article
                  key={invoice.invoice}
                  className="rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="m-0 text-sm font-black text-[var(--navy)]">
                        {invoice.customer}
                      </h4>
                      <p className="m-0 mt-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--blue)]">
                        {invoice.invoice} · {invoice.amount} · {invoice.age}
                      </p>
                    </div>
                  </div>
                  <p className="m-0 mt-3 text-sm font-semibold leading-5 text-[var(--muted)]">
                    {invoice.reason}
                  </p>
                  <div className="mt-3 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold leading-5 text-[var(--text)]">
                    {invoice.action}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-4">
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert size={18} className="text-[var(--amber)]" aria-hidden />
              <h3 className="m-0 text-sm font-black uppercase tracking-[0.08em] text-[var(--navy)]">
                Payment Run Recommendation
              </h3>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm font-black text-[var(--amber)]">
                Full delay
                <ArrowRight size={15} aria-hidden />
                {summary.supplierRecommendation}
              </div>
              <p className="m-0 mt-3 text-sm font-semibold leading-6 text-[var(--text)]">
                {summary.supplierDetail}
              </p>
            </div>
            <div className="mt-3 grid gap-2 text-xs font-bold text-[var(--muted)]">
              <span>Supplier: MotionPrint</span>
              <span>Amount: £2,400</span>
              <span>Essentiality: non-critical this week</span>
            </div>
          </section>

          <section className="rounded-md border border-[var(--line)] bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <FileText size={18} className="text-[var(--blue)]" aria-hidden />
              <h3 className="m-0 text-sm font-black uppercase tracking-[0.08em] text-[var(--navy)]">
                Approval Queue
              </h3>
            </div>
            <div className="grid gap-2">
              {approvalQueue.map((item) => (
                <div
                  key={item.title}
                  className="rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-[var(--navy)]">{item.title}</div>
                      <div className="mt-1 text-xs font-bold text-[var(--muted)]">
                        {item.owner} · {item.due}
                      </div>
                    </div>
                    <StatusPill status="pending" />
                  </div>
                  <div className="mt-2 text-[0.72rem] font-black uppercase tracking-[0.08em] text-[var(--blue)]">
                    {item.collection}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Panel>
  );
}
