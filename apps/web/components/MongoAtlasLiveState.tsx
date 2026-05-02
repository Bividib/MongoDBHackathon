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
      <p className="m-0 text-[0.78rem] font-normal leading-5 text-[var(--text-muted)]">
        {snapshot.message}
      </p>

      <dl className="m-0 mt-3 grid grid-cols-3 gap-1.5 p-0">
        {snapshot.counters.map((counter) => (
          <div
            key={counter.label}
            className={`rounded-[var(--radius-sm)] border px-2.5 py-2 ${
              counter.highlight
                ? "border-[rgba(245,166,35,0.45)] bg-[var(--amber-tint)] shadow-[var(--shadow-amber)]"
                : "border-[var(--line)] bg-[var(--surface-muted)]"
            }`}
          >
            <dt
              className={`m-0 text-[0.6rem] font-semibold uppercase tracking-[0.1em] ${
                counter.highlight ? "text-[var(--amber-soft)]" : "text-[var(--text-faint)]"
              }`}
            >
              {counter.label}
            </dt>
            <dd className="m-0 mt-0.5 flex flex-wrap items-baseline gap-1">
              <span
                className={`text-[0.95rem] font-semibold tabular ${
                  counter.highlight ? "text-[var(--amber-soft)]" : "text-[var(--text)]"
                }`}
              >
                {counter.value}
              </span>
              {counter.hint ? (
                <span
                  className={`text-[0.62rem] font-medium ${
                    counter.highlight ? "text-[var(--amber-soft)]" : "text-[var(--text-faint)]"
                  }`}
                >
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
