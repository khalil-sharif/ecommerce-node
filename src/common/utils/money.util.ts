import { Prisma } from '@prisma/client';

export type Numeric = number | string | Prisma.Decimal;

/** Convert any Decimal/string/number to a JS number rounded to 2 decimals. */
export function toNumber(value: Numeric | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value.toString());
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Round a money value to 2 decimal places. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Convert a major-unit amount (e.g. 12.50) to Stripe minor units (1250). */
export function toMinorUnits(amount: Numeric): number {
  return Math.round(toNumber(amount) * 100);
}

/** Convert Stripe minor units (1250) back to major units (12.50). */
export function fromMinorUnits(amount: number): number {
  return round2(amount / 100);
}
