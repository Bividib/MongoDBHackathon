import { Database } from "lucide-react";
import { Panel } from "./Panel";
import { mongoStateByPhase, type DemoPhase } from "./cockpit-data";

export function MongoAtlasLiveState({ phase }: { phase: DemoPhase }) {
  const snapshot = mongoStateByPhase[phase];

  return (
    <Panel
      icon={<Database size={16} aria-hidden />}
      title="MongoDB Atlas"
      action={
        <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[var(--green)]">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-[var(--green)] shadow-[0_0_8px_rgba(52,211,153,0.7)]"
          />
          {snapshot.status === "connected" ? "Connected" : "Syncing"}
        </span>
      }
      variant="default"
    >
      <p className="m-0 text-[0.85rem] font-normal leading-6 text-[var(--text-muted)]">
        {snapshot.message}
      </p>

      <dl className="m-0 mt-4 grid grid-cols-2 gap-2.5 p-0">
        {snapshot.counters.map((counter) => (
          <div
            key={counter.label}
            className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-muted)] p-3"
          >
            <dt className="m-0 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
              {counter.label}
            </dt>
            <dd className="m-0 mt-1.5 flex items-baseline gap-2">
              <span className="text-[1.05rem] font-semibold tabular text-[var(--text)]">
                {counter.value}
              </span>
              {counter.hint ? (
                <span className="text-[0.7rem] font-medium text-[var(--text-faint)]">
                  {counter.hint}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
