"use client";

import { ChevronDown, ScrollText } from "lucide-react";
import { useState } from "react";
import { Panel } from "./Panel";
import { auditTrailByPhase, type DemoPhase } from "./cockpit-data";

export function AuditTrail({ phase }: { phase: DemoPhase }) {
  const [expanded, setExpanded] = useState(false);
  const items = auditTrailByPhase[phase];

  return (
    <Panel
      icon={<ScrollText size={16} aria-hidden />}
      title="Audit trail"
      action={
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[var(--text-faint)]">
          For judges
        </span>
      }
      variant="default"
    >
      <button
        aria-controls="audit-trail-list"
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2.5 text-left transition hover:border-[var(--line-strong)]"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <span className="min-w-0">
          <span className="block text-[0.85rem] font-semibold tracking-tight text-[var(--text)]">
            Every decision is durably stored in MongoDB
          </span>
          <span className="mt-0.5 block text-[0.72rem] font-normal text-[var(--text-muted)]">
            7 collections — plain English in front, engineering name behind it for proof.
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={`shrink-0 text-[var(--text-muted)] transition ${expanded ? "rotate-180" : ""}`}
          size={16}
        />
      </button>

      {expanded ? (
        <ul id="audit-trail-list" className="m-0 mt-3 grid gap-1.5 p-0">
          {items.map((item) => {
            const isMemoryWrite = item.collection === "memory_cards" && item.count.startsWith("1");

            return (
              <li
                key={item.collection}
                className={`grid grid-cols-[170px_72px_1fr] items-baseline gap-3 rounded-[var(--radius-sm)] border px-3 py-2 ${
                  isMemoryWrite
                    ? "border-[rgba(245,166,35,0.45)] bg-[var(--amber-tint)]"
                    : "border-[var(--line)] bg-[var(--surface-muted)]"
                }`}
              >
                <code
                  className={`font-mono text-[0.72rem] ${
                    isMemoryWrite ? "text-[var(--amber-soft)]" : "text-[var(--amber)]"
                  }`}
                >
                  {item.collection}
                </code>
                <span className="text-[0.72rem] font-semibold tabular text-[var(--text)]">
                  {item.count}
                </span>
                <span className="text-[0.78rem] font-normal leading-5 text-[var(--text-muted)]">
                  {item.english}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Panel>
  );
}
