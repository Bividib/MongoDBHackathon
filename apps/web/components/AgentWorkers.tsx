import { Check, Clock, Cpu } from "lucide-react";
import { Panel } from "./Panel";
import { agentSummaryByPhase, type DemoPhase, type WorkerStatus } from "./cockpit-data";

export function AgentWorkers({ phase }: { phase: DemoPhase }) {
  const agents = agentSummaryByPhase[phase];

  return (
    <Panel
      icon={<Cpu size={16} aria-hidden />}
      title="Agent status"
      action={
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
          What the team did
        </span>
      }
      variant="default"
    >
      <ul className="m-0 grid gap-1.5 p-0">
        {agents.map((agent) => (
          <li
            key={agent.name}
            className="grid grid-cols-[18px_1fr_auto] items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-muted)] px-2.5 py-1.5"
          >
            <StatusIcon status={agent.status} />
            <div className="min-w-0">
              <span className="block truncate text-[0.82rem] font-semibold tracking-tight text-[var(--text)]">
                {agent.name}
              </span>
              <span className="block truncate text-[0.72rem] font-normal text-[var(--text-muted)]">
                {agent.summary}
              </span>
            </div>
            <span
              className={`text-[0.62rem] font-semibold uppercase tracking-[0.12em] ${labelColor(
                agent.status
              )}`}
            >
              {labelText(agent.status)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function StatusIcon({ status }: { status: WorkerStatus }) {
  if (status === "complete") {
    return (
      <span
        aria-hidden
        className="grid h-4 w-4 place-items-center rounded-full bg-[rgba(52,211,153,0.15)] text-[var(--green)]"
      >
        <Check size={10} />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="grid h-4 w-4 place-items-center rounded-full bg-[var(--amber-tint)] text-[var(--amber-soft)]"
    >
      <Clock size={10} />
    </span>
  );
}

function labelColor(status: WorkerStatus): string {
  if (status === "complete") return "text-[var(--green)]";
  return "text-[var(--amber-soft)]";
}

function labelText(status: WorkerStatus): string {
  if (status === "complete") return "Done";
  if (status === "running") return "Working";
  return "Waiting";
}
