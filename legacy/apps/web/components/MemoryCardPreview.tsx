import { BrainCircuit, Sparkle } from "lucide-react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import { memoryCard, type DemoPhase } from "./cockpit-data";

export function MemoryCardPreview({ phase }: { phase: DemoPhase }) {
  const written = phase === "bank";
  const body = written
    ? memoryCard.body
    : phase === "reply"
      ? "Memory write is pending. The reply has been classified as conditional; the rule will commit after the live replanning cascade."
      : "Next-case memory is pending. RunwayOps will write the Northstar behaviour card after the case has enough evidence.";

  return (
    <Panel
      action={
        <StatusPill
          status={written ? "written" : "preview"}
          tone={written ? "safe" : "neutral"}
        />
      }
      eyebrow="Learning loop"
      icon={<BrainCircuit size={16} aria-hidden />}
      title="Memory card · next case preview"
      variant="default"
    >
      <div className="grid gap-3">
        <article className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-muted)] p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="m-0 text-sm font-semibold tracking-tight text-[var(--text)]">
                {memoryCard.title}
              </h3>
              <p className="m-0 mt-0.5 font-mono text-[0.7rem] text-[var(--text-faint)]">
                {memoryCard.id}
              </p>
            </div>
          </div>
          <p className="m-0 mt-3 text-sm font-normal leading-6 text-[var(--text-muted)]">
            {body}
          </p>
        </article>

        <article
          className={`rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-muted)] p-3.5 ${
            written ? "" : "opacity-70"
          }`}
        >
          <h3 className="m-0 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            Next case preview
          </h3>
          <ul className="m-0 mt-2.5 grid gap-2 p-0">
            {memoryCard.preview.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm font-normal leading-5 text-[var(--text)]"
              >
                <Sparkle
                  aria-hidden
                  className="mt-0.5 shrink-0 text-[var(--amber)]"
                  size={13}
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
