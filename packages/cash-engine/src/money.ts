import {
  addMoney,
  assertSameCurrency,
  compareMoney,
  formatMoney,
  maxMoney,
  minMoney,
  money as domainMoney,
  multiplyMoneyByRatio as multiplyDomainMoneyByRatio,
  subtractMoney
} from "@runwayops/domain";
import type { CurrencyCode, Money } from "./types.ts";

export {
  addMoney,
  assertSameCurrency,
  compareMoney,
  formatMoney,
  maxMoney,
  minMoney,
  subtractMoney
} from "@runwayops/domain";

export function money(amountMinor: bigint | number | string, currency: CurrencyCode = "GBP"): Money {
  if (typeof amountMinor === "number") {
    if (!Number.isSafeInteger(amountMinor)) {
      throw new Error("Money amountMinor must be a safe integer minor-unit value.");
    }
    return domainMoney(BigInt(amountMinor), currency);
  }

  return domainMoney(amountMinor, currency);
}

export function zeroMoney(currency: CurrencyCode = "GBP"): Money {
  return money(0n, currency);
}

export function negateMoney(value: Money): Money {
  return money(-value.amountMinor, value.currency);
}

export function isPositiveMoney(value: Money): boolean {
  return value.amountMinor > 0n;
}

export function isNegativeMoney(value: Money): boolean {
  return value.amountMinor < 0n;
}

export function sumMoney(values: Money[], currency?: CurrencyCode): Money {
  const resolvedCurrency = currency ?? values[0]?.currency ?? "GBP";
  return values.reduce((total, value) => addMoney(total, value), zeroMoney(resolvedCurrency));
}

export function clampMoneyToZero(value: Money): Money {
  return value.amountMinor < 0n ? zeroMoney(value.currency) : value;
}

export function multiplyMoneyByBasisPoints(value: Money, basisPoints: number): Money {
  if (!Number.isInteger(basisPoints)) {
    throw new Error("Basis points must be an integer.");
  }

  const bounded = Math.max(0, Math.min(10000, basisPoints));
  return multiplyDomainMoneyByRatio(value, {
    numerator: BigInt(bounded),
    denominator: 10000n,
    rounding: "towards_zero"
  });
}

export function ratioToBasisPoints(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    throw new Error("Ratio must be finite.");
  }

  return Math.max(0, Math.min(10000, Math.round(ratio * 10000)));
}

export function multiplyMoneyByRatio(value: Money, ratio: number): Money {
  return multiplyMoneyByBasisPoints(value, ratioToBasisPoints(ratio));
}
