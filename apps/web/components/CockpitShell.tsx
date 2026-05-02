"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, MailCheck, Radio, RotateCcw } from "lucide-react";
import { AgentWorkers } from "./AgentWorkers";
import { AuditWhyPanel } from "./AuditWhyPanel";
import { DraftApprovalPanel } from "./DraftApprovalPanel";
import { EventFeed } from "./EventFeed";
import { FounderBriefing } from "./FounderBriefing";
import { MainCaseBoard } from "./MainCaseBoard";
import { MemoryCardPreview } from "./MemoryCardPreview";
import { MongoAtlasLiveState } from "./MongoAtlasLiveState";
import { RiskCommandBar } from "./RiskCommandBar";
import type { DemoPhase } from "./cockpit-data";

export function CockpitShell() {
  const [phase, setPhase] = useState<DemoPhase>("baseline");
  const [bankFeedArmed, setBankFeedArmed] = useState(false);

  useEffect(() => {
    if (!bankFeedArmed) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPhase("bank");
      setBankFeedArmed(false);
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [bankFeedArmed]);

  const controls = useMemo(
    () => ({
      simulateReply: () => {
        setBankFeedArmed(false);
        setPhase("reply");
      },
      startBankFeed: () => {
        setPhase((current) => (current === "baseline" ? "reply" : current));
        setBankFeedArmed(true);
      },
      reset: () => {
        setBankFeedArmed(false);
        setPhase("baseline");
      }
    }),
    []
  );

  return (
    <main className="min-h-screen bg-[var(--bg)] px-3 py-4 text-[var(--text)] sm:px-4 lg:px-6">
      <div className="mx-auto grid w-full max-w-[1840px] gap-4">
        <RiskCommandBar
          bankFeedArmed={bankFeedArmed}
          onReset={controls.reset}
          onSimulateReply={controls.simulateReply}
          onStartBankFeed={controls.startBankFeed}
          phase={phase}
        />

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_390px]">
          <EventFeed phase={phase} />

          <div className="grid gap-4">
            <MainCaseBoard bankFeedArmed={bankFeedArmed} phase={phase} />
            <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <AgentWorkers phase={phase} />
              <DraftApprovalPanel />
            </div>
          </div>

          <MongoAtlasLiveState phase={phase} />
        </div>

        <div className="grid gap-4 2xl:grid-cols-[1.05fr_0.95fr_0.85fr] lg:grid-cols-2">
          <AuditWhyPanel phase={phase} />
          <FounderBriefing phase={phase} />
          <MemoryCardPreview phase={phase} />
        </div>

        <div className="sr-only" aria-live="polite">
          Current cockpit state is {phase}. {bankFeedArmed ? "Bank feed timer is running." : ""}
        </div>

        <div className="fixed bottom-4 right-4 z-20 hidden gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 shadow-[var(--shadow-strong)] md:flex">
          <MiniControl
            disabled={phase !== "baseline"}
            icon={<MailCheck size={16} aria-hidden />}
            label="Reply"
            onClick={controls.simulateReply}
          />
          <MiniControl
            disabled={bankFeedArmed || phase === "bank"}
            icon={bankFeedArmed ? <Activity size={16} aria-hidden /> : <Radio size={16} aria-hidden />}
            label={bankFeedArmed ? "Live" : "Bank"}
            onClick={controls.startBankFeed}
          />
          <MiniControl
            icon={<RotateCcw size={16} aria-hidden />}
            label="Reset"
            onClick={controls.reset}
          />
        </div>
      </div>
    </main>
  );
}

function MiniControl({
  disabled = false,
  icon,
  label,
  onClick
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel-muted)] px-3 text-xs font-black uppercase tracking-[0.08em] text-[var(--navy)] transition hover:border-[var(--line-strong)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
