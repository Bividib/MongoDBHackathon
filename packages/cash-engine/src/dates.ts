import type { DateInput } from "./types.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toDate(input: DateInput): Date {
  if (input instanceof Date) {
    return new Date(input.getTime());
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T00:00:00.000Z`);
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date input: ${input}`);
  }

  return parsed;
}

export function toUtcDateOnlyMs(input: DateInput): number {
  const date = toDate(input);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function addDays(input: DateInput, days: number): Date {
  const date = toDate(input);
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function daysBetween(start: DateInput, end: DateInput): number {
  return Math.round((toUtcDateOnlyMs(end) - toUtcDateOnlyMs(start)) / MS_PER_DAY);
}

export function daysUntil(asOfDate: DateInput, targetDate: DateInput): number {
  return daysBetween(asOfDate, targetDate);
}

export function isWithinHorizon(date: DateInput, asOfDate: DateInput, horizonDays: number): boolean {
  const days = daysUntil(asOfDate, date);
  return days >= 0 && days <= horizonDays;
}

export function isOnOrBefore(left: DateInput, right: DateInput): boolean {
  return toUtcDateOnlyMs(left) <= toUtcDateOnlyMs(right);
}

export function compareDateAsc(left: DateInput, right: DateInput): number {
  return toUtcDateOnlyMs(left) - toUtcDateOnlyMs(right);
}

export function toIsoDate(input: DateInput): string {
  return new Date(toUtcDateOnlyMs(input)).toISOString().slice(0, 10);
}
