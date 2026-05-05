"use client";

const RISK_COLORS: Record<string, string> = {
  safe: "bg-green-100 text-green-800",
  watch: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export function RiskBadge({ status }: { status: string }) {
  const color = RISK_COLORS[status] ?? "bg-gray-100 text-gray-800";
  return (
    <span
      data-testid="risk-badge"
      data-risk={status}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ${color}`}
    >
      {status}
    </span>
  );
}
