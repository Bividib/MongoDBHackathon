import { Cpu, DatabaseZap } from "lucide-react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import { workerRows, type DemoPhase, type WorkerStatus } from "./cockpit-data";

export function AgentWorkers({ phase }: { phase: DemoPhase }) {
  return (
    <Panel
      eyebrow="Six specialist workers"
      icon={<Cpu size={18} aria-hidden />}
      title="Agent Workers"
    >
      <div className="grid gap-3">
        {workerRows[phase].map((worker) => (
          <article
            key={worker.name}
            className="rounded-md border border-[var(--line)] bg-white p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="m-0 text-sm font-black leading-5 text-[var(--navy)]">
                  {worker.name}
                </h3>
                <p className="m-0 mt-1 text-sm font-semibold leading-5 text-[var(--muted)]">
                  {worker.detail}
                </p>
              </div>
              <StatusPill status={worker.status} tone={statusTone(worker.status)} />
            </div>
            <div className="mt-3 grid gap-2 rounded-md border border-[var(--line)] bg-[var(--panel-muted)] px-3 py-2 text-xs font-bold text-[var(--muted)] sm:grid-cols-[1fr_auto] sm:items-center">
              <span className="truncate">{worker.runId}</span>
              <span className="inline-flex items-center gap-1 text-[var(--blue)]">
                <DatabaseZap size={13} aria-hidden />
                {worker.writes}
              </span>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function statusTone(status: WorkerStatus) {
  if (status === "complete") {
    return "safe";
  }

  if (status === "running" || status === "queued") {
    return "watch";
  }

  return "neutral";
}
