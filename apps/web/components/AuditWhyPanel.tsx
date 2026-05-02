import { FileSearch, ListChecks } from "lucide-react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import {
  auditQuestions,
  phaseSummary,
  retrievalEvidence,
  type DemoPhase
} from "./cockpit-data";

export function AuditWhyPanel({ phase }: { phase: DemoPhase }) {
  const summary = phaseSummary[phase];

  return (
    <Panel
      action={<StatusPill status={summary.riskStatus} />}
      eyebrow="Decision trace"
      icon={<FileSearch size={18} aria-hidden />}
      title="Audit / Why Panel"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {auditQuestions.map((item) => (
          <article
            key={item.question}
            className="rounded-md border border-[var(--line)] bg-white p-3"
          >
            <h3 className="m-0 text-sm font-black text-[var(--navy)]">{item.question}</h3>
            <p className="m-0 mt-2 text-sm font-semibold leading-6 text-[var(--muted)]">
              {item.answer}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.08em] text-[var(--navy)]">
          <ListChecks size={16} aria-hidden />
          Evidence Used
        </div>
        <div className="flex flex-wrap gap-2">
          {retrievalEvidence.map((item) => (
            <span
              key={item}
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--text)]"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}
