import { Database } from "lucide-react";
import { Panel } from "./Panel";
import { getAtlasRows, phaseSummary, type DemoPhase } from "./cockpit-data";

export function MongoAtlasLiveState({ phase }: { phase: DemoPhase }) {
  const rows = getAtlasRows(phase);
  const summary = phaseSummary[phase];

  return (
    <Panel
      action={
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
          {summary.caseStateLabel}
        </span>
      }
      eyebrow="Durable context engine"
      icon={<Database size={16} aria-hidden />}
      title="MongoDB Atlas live state"
      variant="default"
    >
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)]">
        <div className="grid grid-cols-[minmax(120px,0.95fr)_minmax(110px,0.9fr)_72px] gap-3 border-b border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
          <span>Collection</span>
          <span>Latest ID</span>
          <span className="text-right">Change</span>
        </div>
        <div className="grid max-h-[480px] overflow-auto scroll-stable">
          {rows.map((row) => (
            <article
              key={row.collection}
              className="grid gap-1.5 border-b border-[var(--line)] bg-transparent px-3 py-2.5 transition last:border-b-0 hover:bg-[var(--surface-2)]"
            >
              <div className="grid grid-cols-[minmax(120px,0.95fr)_minmax(110px,0.9fr)_72px] gap-3">
                <div className="min-w-0 text-sm font-semibold text-[var(--text)]">
                  {row.collection}
                </div>
                <div className="min-w-0 truncate font-mono text-[0.7rem] text-[var(--text-muted)]">
                  {row.documentId}
                </div>
                <div className="text-right text-[0.7rem] font-semibold text-[var(--amber-soft)]">
                  {row.change}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 text-[0.7rem] font-normal leading-5 text-[var(--text-faint)]">
                <span className="truncate">{row.why}</span>
                <span className="font-mono">{row.timestamp}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Panel>
  );
}
