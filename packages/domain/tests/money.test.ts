import { describe, expect, it } from "vitest";

import {
  addMoney,
  assertSameCurrency,
  compareMoney,
  formatMoney,
  maxMoney,
  minMoney,
  money,
  moneySchema,
  multiplyMoneyByRatio,
  subtractMoney
} from "../src/index.js";

describe("Money", () => {
  it("normalizes currency and stores integer minor units as bigint", () => {
    expect(money("12345", "gbp")).toEqual({
      amountMinor: 12345n,
      currency: "GBP"
    });

    expect(moneySchema.safeParse({ amountMinor: "12.30", currency: "GBP" }).success).toBe(
      false
    );
  });

  it("performs same-currency arithmetic without floating point money values", () => {
    const invoiceAmount = money("10005", "GBP");
    const paymentAmount = money(2505n, "GBP");

    expect(addMoney(invoiceAmount, paymentAmount)).toEqual(money(12510n, "GBP"));
    expect(subtractMoney(invoiceAmount, paymentAmount)).toEqual(money(7500n, "GBP"));
    expect(compareMoney(invoiceAmount, paymentAmount)).toBe(1);
    expect(minMoney(invoiceAmount, paymentAmount)).toBe(paymentAmount);
    expect(maxMoney(invoiceAmount, paymentAmount)).toBe(invoiceAmount);
  });

  it("rejects cross-currency arithmetic", () => {
    expect(() => assertSameCurrency(money(1n, "GBP"), money(1n, "EUR"))).toThrow(
      "Currency mismatch"
    );

    expect(() => addMoney(money(1n, "GBP"), money(1n, "USD"))).toThrow(
      "Currency mismatch"
    );
  });

  it("multiplies by integer ratios with explicit rounding", () => {
    expect(
      multiplyMoneyByRatio(money(10005n, "GBP"), {
        numerator: "1",
        denominator: "3",
        rounding: "nearest"
      })
    ).toEqual(money(3335n, "GBP"));

    expect(
      multiplyMoneyByRatio(money(10005n, "GBP"), {
        numerator: 1n,
        denominator: 3n,
        rounding: "towards_zero"
      })
    ).toEqual(money(3335n, "GBP"));

    expect(() =>
      multiplyMoneyByRatio(money(10005n, "GBP"), {
        numerator: "1",
        denominator: "0"
      })
    ).toThrow("denominator must be greater than zero");
  });

  it("formats money without converting the amount to a JavaScript float", () => {
    expect(formatMoney(money("123456789", "GBP"))).toBe("GBP 1,234,567.89");
    expect(formatMoney(money("-987", "EUR"))).toBe("EUR -9.87");
    expect(formatMoney(money("5000", "JPY"))).toBe("JPY 5,000");
  });
});
