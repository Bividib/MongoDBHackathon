import { BellRing, CheckCircle2, Circle, TimerReset } from "lucide-react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import { eventRows, phaseOrder, type DemoPhase } from "./cockpit-data";

export function EventFeed({ phase }: { phase: DemoPhase }) {
  const currentOrder = phaseOrder[phase];

  return (
    <Panel
      className="xl:min-h-[840px]"
      eyebrow="Event-driven case"
      icon={<BellRing size={18} aria-hidden />}
      title="Event Feed"
    >
      <ol className="grid gap-2" aria-label="RunwayOps event feed">
        {eventRows.map((event) => {
          const isComplete = phaseOrder[event.phase] <= currentOrder;

          return (
            <li
              key={event.id}
              className={`grid grid-cols-[28px_1fr] gap-3 rounded-md border p-3 transition ${
                isComplete
                  ? "border-[var(--line)] bg-white"
                  : "border-dashed border-[var(--line)] bg-[var(--panel-muted)] opacity-60"
              }`}
            >
              <span
                className={`mt-0.5 grid h-7 w-7 place-items-center rounded-full ${
                  isComplete
                    ? "bg-emerald-50 text-[var(--green)]"
                    : "bg-white text-[var(--muted)]"
                }`}
              >
                {isComplete ? (
                  <CheckCircle2 size={16} aria-hidden />
                ) : (
                  <Circle size={14} aria-hidden />
                )}
              </span>
              <span className="min-w-0">
                <span className="flex items-start justify-between gap-2">
                  <span className="break-words text-xs font-black text-[var(--blue)]">
                    {event.eventType}
                  </span>
                  <span className="whitespace-nowrap text-[0.68rem] font-bold text-[var(--muted)]">
                    {event.time}
                  </span>
                </span>
                <span className="mt-1 block text-sm font-semibold leading-5 text-[var(--text)]">
                  {event.label}
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusPill status={isComplete ? "written" : "pending"} />
                  <span className="inline-flex items-center gap-1 text-[0.72rem] font-bold text-[var(--muted)]">
                    <TimerReset size={13} aria-hidden />
                    {event.change}
                  </span>
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
