import { z } from "zod";

export type CurrencyCode = "GBP" | "USD" | "EUR" | (string & {});

export const currencyCodeSchema = z
  .string()
  .trim()
  .transform((currency) => currency.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Currency must be a three-letter ISO code"));

const amountMinorSchema = z.preprocess((value) => {
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }

  return value;
}, z.bigint());

export const moneySchema = z
  .object({
    amountMinor: amountMinorSchema,
    currency: currencyCodeSchema
  })
  .strict();

export type Money = Readonly<z.infer<typeof moneySchema>>;

export type MoneyRatio = Readonly<{
  numerator: bigint | string;
  denominator: bigint | string;
  rounding?: "towards_zero" | "down" | "up" | "nearest";
}>;

const currencyMinorUnits: Record<string, number> = {
  EUR: 2,
  GBP: 2,
  JPY: 0,
  USD: 2
};

const toIntegerBigInt = (value: bigint | string, fieldName: string): bigint => {
  if (typeof value === "bigint") {
    return value;
  }

  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${fieldName} must be an integer`);
  }

  return BigInt(value);
};

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

const roundDivision = (
  numerator: bigint,
  denominator: bigint,
  rounding: NonNullable<MoneyRatio["rounding"]>
): bigint => {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;

  if (remainder === 0n) {
    return quotient;
  }

  if (rounding === "towards_zero") {
    return quotient;
  }

  if (rounding === "down") {
    return numerator < 0n ? quotient - 1n : quotient;
  }

  if (rounding === "up") {
    return numerator > 0n ? quotient + 1n : quotient;
  }

  return abs(remainder) * 2n >= denominator
    ? quotient + (numerator < 0n ? -1n : 1n)
    : quotient;
};

export const money = (amountMinor: bigint | string, currency: CurrencyCode): Money =>
  Object.freeze(moneySchema.parse({ amountMinor, currency }));

export const assertSameCurrency = (left: Money, right: Money): void => {
  if (left.currency !== right.currency) {
    throw new Error(`Currency mismatch: ${left.currency} !== ${right.currency}`);
  }
};

export const addMoney = (left: Money, right: Money): Money => {
  assertSameCurrency(left, right);
  return money(left.amountMinor + right.amountMinor, left.currency);
};

export const subtractMoney = (left: Money, right: Money): Money => {
  assertSameCurrency(left, right);
  return money(left.amountMinor - right.amountMinor, left.currency);
};

export const multiplyMoneyByRatio = (input: Money, ratio: MoneyRatio): Money => {
  const numerator = toIntegerBigInt(ratio.numerator, "numerator");
  const denominator = toIntegerBigInt(ratio.denominator, "denominator");

  if (denominator <= 0n) {
    throw new Error("denominator must be greater than zero");
  }

  return money(
    roundDivision(input.amountMinor * numerator, denominator, ratio.rounding ?? "nearest"),
    input.currency
  );
};

export const compareMoney = (left: Money, right: Money): -1 | 0 | 1 => {
  assertSameCurrency(left, right);

  if (left.amountMinor < right.amountMinor) {
    return -1;
  }

  if (left.amountMinor > right.amountMinor) {
    return 1;
  }

  return 0;
};

export const minMoney = (left: Money, right: Money): Money =>
  compareMoney(left, right) <= 0 ? left : right;

export const maxMoney = (left: Money, right: Money): Money =>
  compareMoney(left, right) >= 0 ? left : right;

export const formatMoney = (input: Money): string => {
  const minorUnits = currencyMinorUnits[input.currency] ?? 2;
  const sign = input.amountMinor < 0n ? "-" : "";
  const absoluteAmount = abs(input.amountMinor);
  const divisor = 10n ** BigInt(minorUnits);
  const major = minorUnits === 0 ? absoluteAmount : absoluteAmount / divisor;
  const minor = minorUnits === 0 ? 0n : absoluteAmount % divisor;
  const groupedMajor = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimalSuffix =
    minorUnits === 0 ? "" : `.${minor.toString().padStart(minorUnits, "0")}`;

  return `${input.currency} ${sign}${groupedMajor}${decimalSuffix}`;
};
