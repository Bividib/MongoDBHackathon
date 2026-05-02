import type { RiskStatus } from "@/lib/types";
import type { WorkerStatus } from "./cockpit-data";

type StatusPillProps = {
  status: RiskStatus | WorkerStatus | string;
  tone?: "risk" | "watch" | "safe" | "neutral";
};

export function StatusPill({ status, tone }: StatusPillProps) {
  const normalized = status.toLowerCase();
  const resolvedTone =
    tone ??
    (normalized.includes("high") || normalized.includes("risk")
      ? "risk"
      : normalized.includes("watch") || normalized.includes("pending")
        ? "watch"
        : normalized.includes("safe") || normalized.includes("complete")
          ? "safe"
          : "neutral");

  const toneClass = {
    risk: "border-red-200 bg-red-50 text-[var(--red)]",
    watch: "border-amber-200 bg-amber-50 text-[var(--amber)]",
    safe: "border-emerald-200 bg-emerald-50 text-[var(--green)]",
    neutral: "border-slate-200 bg-slate-50 text-[var(--muted)]"
  }[resolvedTone];

  return (
    <span
      className={`inline-flex h-7 items-center whitespace-nowrap rounded-full border px-2.5 text-[0.68rem] font-black uppercase tracking-[0.08em] ${toneClass}`}
    >
      {status}
    </span>
  );
}
