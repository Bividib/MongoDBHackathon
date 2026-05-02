"use client";

import { Headphones, Pause, Play } from "lucide-react";
import { useState } from "react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import { founderBriefing, type DemoPhase } from "./cockpit-data";

export function FounderBriefing({ phase }: { phase: DemoPhase }) {
  const [playing, setPlaying] = useState(false);
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
          status={generated ? "generated" : "queued"}
          tone={generated ? "safe" : "watch"}
        />
      }
      eyebrow="Founder action brief"
      icon={<Headphones size={16} aria-hidden />}
      title="Founder briefing"
      variant="default"
    >
      <div className="grid gap-3">
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <button
            aria-label={playing ? "Pause briefing" : "Play briefing"}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--amber)] text-[#1a1100] shadow-[var(--shadow-amber)] transition hover:bg-[var(--amber-soft)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!generated}
            onClick={() => setPlaying((value) => !value)}
            type="button"
          >
            {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </button>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight text-[var(--text)]">
              {founderBriefing.title}
            </div>
            <div className="mt-0.5 text-[0.7rem] font-medium text-[var(--text-faint)]">
              {generated ? founderBriefing.duration : "--:--"} ·{" "}
              {generated ? "ElevenLabs · cached MP3" : "Awaiting bank event"}
            </div>
          </div>
        </div>

        <article>
          <h3 className="m-0 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            Transcript
          </h3>
          <p className="m-0 mt-2 text-sm font-normal leading-7 text-[var(--text)]">
            {transcript}
          </p>
        </article>
      </div>
    </Panel>
  );
}
