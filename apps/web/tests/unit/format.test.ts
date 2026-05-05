import { describe, it, expect } from "vitest";
import { toDisplayMoney, formatDate, pct, relativeTime } from "@/lib/format";

describe("toDisplayMoney", () => {
  it("formats GBP correctly", () => {
    const result = toDisplayMoney({ amountMinor: 1_500_000n, currency: "GBP" });
    expect(result.formatted).toBe("£15,000.00");
    expect(result.rawMinor).toBe("1500000");
    expect(result.currency).toBe("GBP");
  });

  it("handles zero", () => {
    const result = toDisplayMoney({ amountMinor: 0n, currency: "GBP" });
    expect(result.formatted).toBe("£0.00");
  });

  it("handles negative amounts", () => {
    const result = toDisplayMoney({ amountMinor: -50_000n, currency: "USD" });
    expect(result.formatted).toBe("-$500.00");
  });

  it("handles EUR", () => {
    const result = toDisplayMoney({ amountMinor: 99n, currency: "EUR" });
    expect(result.formatted).toContain("0.99");
  });

  it("handles unknown currency", () => {
    const result = toDisplayMoney({ amountMinor: 100n, currency: "JPY" });
    expect(result.formatted).toContain("JPY");
  });
});

describe("formatDate", () => {
  it("formats ISO string", () => {
    const result = formatDate("2026-05-05");
    expect(result).toMatch(/5 May 2026/);
  });
});

describe("pct", () => {
  it("converts 0.42 to 42%", () => {
    expect(pct(0.42)).toBe("42%");
  });

  it("converts 1.0 to 100%", () => {
    expect(pct(1.0)).toBe("100%");
  });
});

describe("relativeTime", () => {
  it("returns 'just now' for recent date", () => {
    const result = relativeTime(new Date());
    expect(result).toBe("just now");
  });
});
