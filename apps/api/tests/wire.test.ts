/**
 * Unit tests for the wire-format serializer that converts bigint to
 * string at the HTTP boundary. Without this, every endpoint that
 * returns a domain object containing Money would crash on reply.send.
 */
import { describe, expect, it } from "vitest";

import { bigintToWire } from "../src/lib/wire.js";

describe("bigintToWire", () => {
  it("converts a top-level bigint to its decimal string", () => {
    expect(bigintToWire(42n)).toBe("42");
    expect(bigintToWire(0n)).toBe("0");
    expect(bigintToWire(-7n)).toBe("-7");
  });

  it("converts bigints nested in objects", () => {
    const input = {
      amountMinor: 1850000n,
      currency: "GBP",
    };
    expect(bigintToWire(input)).toEqual({
      amountMinor: "1850000",
      currency: "GBP",
    });
  });

  it("converts bigints nested in arrays", () => {
    const input = [{ amount: 100n }, { amount: 200n }];
    expect(bigintToWire(input)).toEqual([
      { amount: "100" },
      { amount: "200" },
    ]);
  });

  it("preserves a 21-digit bigint losslessly (above Number.MAX_SAFE_INTEGER)", () => {
    const input = { huge: 999999999999999999999n };
    const result = bigintToWire(input) as { huge: string };
    expect(result.huge).toBe("999999999999999999999");
    // Round through real JSON.stringify to confirm the wire form survives.
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(JSON.parse(JSON.stringify(result)).huge).toBe("999999999999999999999");
  });

  it("preserves Date instances (handed to JSON.stringify which calls toJSON)", () => {
    const d = new Date("2026-05-04T00:00:00.000Z");
    const result = bigintToWire({ when: d }) as { when: Date };
    expect(result.when).toBe(d);
  });

  it("recurses through deeply nested structures", () => {
    const input = {
      forecast: {
        cashBalance: { amountMinor: 3200000n, currency: "GBP" },
        expectedInflows: [
          { id: "in_1", amount: { amountMinor: 1850000n, currency: "GBP" } },
        ],
      },
    };
    const result = bigintToWire(input);
    expect(result).toEqual({
      forecast: {
        cashBalance: { amountMinor: "3200000", currency: "GBP" },
        expectedInflows: [
          { id: "in_1", amount: { amountMinor: "1850000", currency: "GBP" } },
        ],
      },
    });
    // Critical: full object must serialize through JSON.stringify without throwing.
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("returns primitives unchanged", () => {
    expect(bigintToWire("hello")).toBe("hello");
    expect(bigintToWire(42)).toBe(42);
    expect(bigintToWire(true)).toBe(true);
    expect(bigintToWire(null)).toBe(null);
    expect(bigintToWire(undefined)).toBe(undefined);
  });
});
