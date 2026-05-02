import { Sparkles } from "lucide-react";
import { Panel } from "./Panel";
import { whatChangedByPhase, type DemoPhase } from "./cockpit-data";

export function EventFeed({ phase }: { phase: DemoPhase }) {
  const items = whatChangedByPhase[phase];

  return (
    <Panel
      icon={<Sparkles size={16} aria-hidden />}
      title="What changed today"
      variant="default"
    >
      <ul className="m-0 grid gap-3 p-0" aria-label="Today's notable changes">
        {items.map((item, index) => (
          <li
            key={`${item.label}-${index}`}
            className="flex items-start gap-3 text-[0.92rem] font-medium leading-6 text-[var(--text)]"
          >
            <span
              aria-hidden
              className={`mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                item.tone === "amber"
                  ? "bg-[var(--amber)] shadow-[0_0_8px_rgba(245,166,35,0.7)]"
                  : "bg-[var(--text-faint)]"
              }`}
            />
            <span className={item.tone === "amber" ? "text-[var(--text)]" : "text-[var(--text-muted)]"}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
