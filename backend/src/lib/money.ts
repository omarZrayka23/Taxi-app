import { Prisma } from '@prisma/client';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Round up to the nearest step (e.g. 0.5 USD). Step <= 0 means plain 2-decimal rounding. */
export function roundUpTo(n: number, step: number): number {
  if (!step || step <= 0) return round2(n);
  return round2(Math.ceil(round2(n / step) - 1e-9) * step);
}

export const num = (v: Prisma.Decimal | number | string | null | undefined): number =>
  v === null || v === undefined ? 0 : Number(v);

export const numOrNull = (v: Prisma.Decimal | number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

export const toLbp = (usd: number, rate: number) => Math.round(usd * rate);
