"use client";

import { Headphones, Play, Square } from "lucide-react";
import { useState } from "react";
import { Panel } from "./Panel";
import { StatusPill } from "./StatusPill";
import { founderBriefing, type DemoPhase } from "./cockpit-data";

export function FounderBriefing({ phase }: { phase: DemoPhase }) {
  const [playing, setPlaying] = useState(false);
  const generated = phase === "bank";

  return (
    <Panel
      action={<StatusPill status={generated ? "generated" : "queued"} tone={generated ? "safe" : "watch"} />}
      eyebrow="Founder action brief"
      icon={<Headphones size={18} aria-hidden />}
      title="Founder Briefing"
    >
      <div className="grid gap-4">
        <div className="rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="m-0 text-sm font-black text-[var(--navy)]">
                {founderBriefing.title}
              </h3>
              <p className="m-0 mt-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                {founderBriefing.source}
              </p>
            </div>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--navy)] bg-[var(--navy)] px-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#18395d] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!generated}
              onClick={() => setPlaying((value) => !value)}
              type="button"
            >
              {playing ? <Square size={15} aria-hidden /> : <Play size={15} aria-hidden />}
              {playing ? "Stop" : "Play"}
            </button>
          </div>
          <div className="mt-3 grid gap-2 text-xs font-bold text-[var(--muted)] sm:grid-cols-[1fr_auto]">
            <span className="truncate">{founderBriefing.audioKey}</span>
            <span>{founderBriefing.duration}</span>
          </div>
        </div>

        <article className="rounded-md border border-[var(--line)] bg-white p-4">
          <h3 className="m-0 text-sm font-black uppercase tracking-[0.08em] text-[var(--navy)]">
            Transcript
          </h3>
          <p className="m-0 mt-3 text-sm font-semibold leading-7 text-[var(--text)]">
            {founderBriefing.transcript}
          </p>
        </article>
      </div>
    </Panel>
  );
}
