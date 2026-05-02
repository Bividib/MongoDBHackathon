import { BadgeCheck, BrainCircuit } from "lucide-react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import { memoryCard, type DemoPhase } from "./cockpit-data";

export function MemoryCardPreview({ phase }: { phase: DemoPhase }) {
  const written = phase === "bank";

  return (
    <Panel
      action={<StatusPill status={written ? "written" : "preview"} tone={written ? "safe" : "neutral"} />}
      eyebrow="Learning loop"
      icon={<BrainCircuit size={18} aria-hidden />}
      title="Memory Card + Next Case Preview"
    >
      <div className="grid gap-4">
        <article className="rounded-md border border-[var(--line)] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="m-0 text-sm font-black text-[var(--navy)]">
                {memoryCard.title}
              </h3>
              <p className="m-0 mt-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--blue)]">
                {memoryCard.id}
              </p>
            </div>
            <StatusPill status={written ? "memory_cards +1" : "pending write"} />
          </div>
          <p className="m-0 text-sm font-semibold leading-6 text-[var(--muted)]">
            {memoryCard.body}
          </p>
        </article>

        <article className="rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-4">
          <h3 className="m-0 text-sm font-black uppercase tracking-[0.08em] text-[var(--navy)]">
            Next Case Preview
          </h3>
          <ul className="m-0 mt-3 grid gap-2 p-0">
            {memoryCard.preview.map((item) => (
              <li
                key={item}
                className="flex gap-2 rounded-md border border-[var(--line)] bg-white p-3 text-sm font-semibold leading-5 text-[var(--text)]"
              >
                <BadgeCheck
                  className="mt-0.5 shrink-0 text-[var(--green)]"
                  size={16}
                  aria-hidden
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </Panel>
  );
}
