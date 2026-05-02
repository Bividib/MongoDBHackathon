import { Cpu, DatabaseZap } from "lucide-react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import { workerRows, type DemoPhase, type WorkerStatus } from "./cockpit-data";

export function AgentWorkers({ phase }: { phase: DemoPhase }) {
  return (
    <Panel
      eyebrow="Six specialist workers"
      icon={<Cpu size={16} aria-hidden />}
      title="Agent workers"
      variant="default"
    >
      <div className="grid gap-2.5">
        {workerRows[phase].map((worker) => (
          <article
            key={worker.name}
            className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-muted)] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="m-0 text-[0.9rem] font-semibold tracking-tight text-[var(--text)]">
                  {worker.name}
                </h3>
                <p className="m-0 mt-1 text-xs font-normal leading-5 text-[var(--text-muted)]">
                  {worker.detail}
                </p>
              </div>
              <StatusPill status={worker.status} tone={statusTone(worker.status)} />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[0.7rem] font-medium text-[var(--text-faint)]">
              <span className="truncate font-mono">{worker.runId}</span>
              <span className="inline-flex items-center gap-1.5 text-[var(--amber-soft)]">
                <DatabaseZap size={12} aria-hidden />
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
  if (status === "complete") return "safe";
  if (status === "running" || status === "queued") return "watch";
  return "neutral";
}
