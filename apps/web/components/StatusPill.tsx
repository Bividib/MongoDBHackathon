import { AlertTriangle, Check, Clock, Minus } from "lucide-react";
import type { ReactNode } from "react";
import type { RiskStatus } from "@/lib/types";
import type { WorkerStatus } from "./cockpit-data";

type StatusTone = "risk" | "watch" | "safe" | "neutral" | "amber";

type StatusPillProps = {
  status: RiskStatus | WorkerStatus | string;
  tone?: StatusTone;
  size?: "sm" | "md";
  showIcon?: boolean;
};

function inferTone(status: string): StatusTone {
  const normalized = status.toLowerCase();

  if (normalized.includes("high") || normalized.includes("risk") || normalized.includes("late")) {
    return "risk";
  }

  if (normalized.includes("watch") || normalized.includes("pending") || normalized.includes("queued")) {
    return "watch";
  }

  if (normalized.includes("safe") || normalized.includes("complete") || normalized.includes("written") || normalized.includes("generated") || normalized.includes("ready")) {
    return "safe";
  }

  return "neutral";
}

const toneClass: Record<StatusTone, string> = {
  // filled, glowing — the "this is dangerous" pill
  risk: "border-[var(--red)]/70 bg-[rgba(239,106,74,0.22)] text-[var(--red)] shadow-[0_0_14px_rgba(239,106,74,0.32)]",
  // outline + amber tint — "watch but not safe"
  watch: "border-[var(--amber)]/55 bg-[var(--amber-tint)] text-[var(--amber-soft)]",
  // filled green with a subtle glow — "this is good / done"
  safe: "border-[var(--green)]/55 bg-[rgba(52,211,153,0.18)] text-[var(--green)] shadow-[0_0_12px_rgba(52,211,153,0.22)]",
  // flat — "informational, no signal"
  neutral: "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text-muted)]",
  // amber inline accent
  amber: "border-[rgba(245,166,35,0.55)] bg-[var(--amber-tint)] text-[var(--amber-soft)]"
};

const toneIcon: Record<StatusTone, ReactNode> = {
  risk: <AlertTriangle size={11} aria-hidden />,
  watch: <Clock size={11} aria-hidden />,
  safe: <Check size={11} aria-hidden />,
  neutral: <Minus size={11} aria-hidden />,
  amber: <Clock size={11} aria-hidden />
};

export function StatusPill({ status, tone, size = "sm", showIcon = true }: StatusPillProps) {
  const resolved = tone ?? inferTone(status);
  const sizeClass =
    size === "sm"
      ? "h-6 px-2 gap-1 text-[0.65rem] tracking-[0.12em]"
      : "h-7 px-2.5 gap-1.5 text-[0.72rem] tracking-[0.1em]";

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-semibold uppercase ${sizeClass} ${toneClass[resolved]}`}
    >
      {showIcon ? toneIcon[resolved] : null}
      {status}
    </span>
  );
}
