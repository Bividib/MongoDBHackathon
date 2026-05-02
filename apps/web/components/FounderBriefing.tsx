"use client";

import { ChevronDown, Headphones, Pause, Play } from "lucide-react";
import { useState } from "react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import { founderBriefing, type DemoPhase } from "./cockpit-data";

export function FounderBriefing({ phase }: { phase: DemoPhase }) {
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const generated = phase === "bank";
  const transcript = generated
    ? founderBriefing.transcript
    : phase === "reply"
      ? "Briefing is queued until a cash-changing bank event lands. Northstar's promise is conditional, so risk stays HIGH."
      : "Briefing is queued. RunwayOps will generate the founder action brief after live replanning evidence is available.";

  return (
    <Panel
      action={
        <StatusPill
          status={generated ? "ready" : "queued"}
          tone={generated ? "safe" : "watch"}
        />
      }
      icon={<Headphones size={16} aria-hidden />}
      title="Founder briefing"
      variant="default"
    >
      <div className="flex items-center gap-3">
        <button
          aria-label={playing ? "Pause briefing" : "Play briefing"}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--amber)] text-[#1a1100] shadow-[var(--shadow-amber)] transition hover:bg-[var(--amber-soft)] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!generated}
          onClick={() => setPlaying((value) => !value)}
          type="button"
        >
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[0.9rem] font-semibold tracking-tight text-[var(--text)]">
            {generated ? "Action brief · ready to play" : "Awaiting bank event"}
          </div>
          <div className="mt-0.5 text-[0.7rem] font-medium text-[var(--text-faint)]">
            {generated ? `${founderBriefing.duration} · ElevenLabs cached` : "~30s once generated"}
          </div>
        </div>
        <button
          aria-expanded={expanded}
          className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-full border border-[var(--line-strong)] bg-transparent px-3 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--amber)]/60 hover:text-[var(--text)]"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          Transcript
          <ChevronDown
            aria-hidden
            className={`transition ${expanded ? "rotate-180" : ""}`}
            size={13}
          />
        </button>
      </div>

      {expanded ? (
        <p className="m-0 mt-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-[0.85rem] font-normal leading-6 text-[var(--text)]">
          {transcript}
        </p>
      ) : null}
    </Panel>
  );
}
