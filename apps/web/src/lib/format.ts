/**
 * Display-safe money type (no bigint — safe for RSC serialization).
 */
export type DisplayMoney = {
  /** Formatted string e.g. "£12,500.00" */
  formatted: string;
  /** amountMinor as string e.g. "1250000" */
  rawMinor: string;
  /** ISO currency code */
  currency: string;
};

/**
 * Convert a domain Money (bigint amountMinor) to a display-safe shape.
 */
export function toDisplayMoney(m: {
  amountMinor: bigint;
  currency: string;
}): DisplayMoney {
  const sign = m.amountMinor < 0n ? "-" : "";
  const abs = m.amountMinor < 0n ? -m.amountMinor : m.amountMinor;
  const major = abs / 100n;
  const minor = abs % 100n;
  const sym = currencySymbol(m.currency);
  const majorStr = major.toLocaleString("en-GB");
  const formatted = `${sign}${sym}${majorStr}.${minor.toString().padStart(2, "0")}`;
  return { formatted, rawMinor: m.amountMinor.toString(), currency: m.currency };
}

function currencySymbol(code: string): string {
  switch (code.toUpperCase()) {
    case "GBP": return "£";
    case "USD": return "$";
    case "EUR": return "€";
    default: return `${code} `;
  }
}

/** Format a Date or ISO string for display. */
export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Format relative time e.g. "4 hours ago". */
export function relativeTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = Date.now() - date.getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Percentage display e.g. 0.42 -> "42%" */
export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
