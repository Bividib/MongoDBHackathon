import type { RiskStatus } from "@/lib/types";
import type { WorkerStatus } from "./cockpit-data";

type StatusTone = "risk" | "watch" | "safe" | "neutral" | "amber";

type StatusPillProps = {
  status: RiskStatus | WorkerStatus | string;
  tone?: StatusTone;
  size?: "sm" | "md";
};

function inferTone(status: string): StatusTone {
  const normalized = status.toLowerCase();

  if (normalized.includes("high") || normalized.includes("risk") || normalized.includes("late")) {
    return "risk";
  }

  if (normalized.includes("watch") || normalized.includes("pending") || normalized.includes("queued")) {
    return "watch";
  }

  if (normalized.includes("safe") || normalized.includes("complete") || normalized.includes("written") || normalized.includes("generated")) {
    return "safe";
  }

  return "neutral";
}

const toneClass: Record<StatusTone, string> = {
  risk: "border-[rgba(239,106,74,0.32)] bg-[rgba(239,106,74,0.12)] text-[var(--red)]",
  watch: "border-[rgba(245,166,35,0.32)] bg-[var(--amber-tint)] text-[var(--amber-soft)]",
  safe: "border-[rgba(52,211,153,0.32)] bg-[rgba(52,211,153,0.10)] text-[var(--green)]",
  neutral: "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text-muted)]",
  amber: "border-[rgba(245,166,35,0.45)] bg-[var(--amber-tint)] text-[var(--amber-soft)]"
};

export function StatusPill({ status, tone, size = "sm" }: StatusPillProps) {
  const resolved = tone ?? inferTone(status);
  const sizeClass =
    size === "sm"
      ? "h-6 px-2 text-[0.65rem] tracking-[0.12em]"
      : "h-7 px-2.5 text-[0.72rem] tracking-[0.1em]";

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-semibold uppercase ${sizeClass} ${toneClass[resolved]}`}
    >
      {status}
    </span>
  );
}
