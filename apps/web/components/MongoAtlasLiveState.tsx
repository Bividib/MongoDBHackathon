import { Database, ServerCog } from "lucide-react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import { getAtlasRows, phaseSummary, type DemoPhase } from "./cockpit-data";

export function MongoAtlasLiveState({ phase }: { phase: DemoPhase }) {
  const rows = getAtlasRows(phase);
  const summary = phaseSummary[phase];

  return (
    <Panel
      action={<StatusPill status={summary.caseStateLabel} tone="neutral" />}
      className="xl:min-h-[840px]"
      eyebrow="Durable context engine"
      icon={<Database size={18} aria-hidden />}
      title="MongoDB Atlas Live State"
    >
      <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex items-center gap-2 text-sm font-black text-[var(--green)]">
          <ServerCog size={16} aria-hidden />
          event_inbox wakes the workflow; collections preserve the audit.
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-[var(--line)]">
        <div className="grid grid-cols-[minmax(120px,0.85fr)_minmax(130px,1fr)_90px] gap-2 border-b border-[var(--line)] bg-[var(--panel-muted)] px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
          <span>Collection</span>
          <span>Latest ID</span>
          <span>Change</span>
        </div>
        <div className="grid max-h-[672px] overflow-auto">
          {rows.map((row) => (
            <article
              key={row.collection}
              className="grid gap-2 border-b border-[var(--line)] bg-white px-3 py-3 last:border-b-0"
            >
              <div className="grid grid-cols-[minmax(120px,0.85fr)_minmax(130px,1fr)_90px] gap-2">
                <div className="min-w-0 text-sm font-black text-[var(--navy)]">
                  {row.collection}
                </div>
                <div className="min-w-0 truncate text-xs font-bold text-[var(--muted)]">
                  {row.documentId}
                </div>
                <div className="text-right text-xs font-black text-[var(--blue)]">
                  {row.change}
                </div>
              </div>
              <div className="grid gap-2 text-xs font-semibold leading-5 text-[var(--muted)] sm:grid-cols-[1fr_auto] sm:items-center">
                <span>{row.why}</span>
                <span className="font-black text-[var(--navy)]">{row.timestamp}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Panel>
  );
}
