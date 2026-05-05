"use client";

import type { IntegrationHealthBanner } from "@/fixtures/types";

export function StaleBanner({
  health,
}: {
  health: IntegrationHealthBanner;
}) {
  if (health.unhealthyConnectors.length === 0) return null;
  return (
    <div
      data-testid="stale-banner"
      className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800"
    >
      {health.unhealthyConnectors.map((c) => (
        <span key={c.provider}>
          {c.provider.charAt(0).toUpperCase() + c.provider.slice(1)} last synced{" "}
          {c.lastSuccessfulSyncAt
            ? formatHoursAgo(c.lastSuccessfulSyncAt)
            : "unknown"}{" "}
          &mdash; forecast may be stale.{" "}
          <a href="/integrations" className="underline font-medium">
            Open Integration Health
          </a>
        </span>
      ))}
    </div>
  );
}

function formatHoursAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.round(diff / 3_600_000);
  return `${hours} hours ago`;
}
