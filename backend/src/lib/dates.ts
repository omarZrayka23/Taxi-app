import { badRequest } from './errors.js';

const DAY_MS = 86_400_000;

/** Parse a YYYY-MM-DD string into a UTC midnight Date. */
export function parseDateOnly(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw badRequest('VALIDATION_ERROR', `Invalid date ${s}, expected YYYY-MM-DD`);
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw badRequest('VALIDATION_ERROR', `Invalid date ${s}`);
  }
  return d;
}

export const formatDateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** Number of rental days between start and (exclusive) end. */
export const daysBetween = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / DAY_MS);

/** Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd). */
export const rangesOverlap = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;

export const todayUtc = () => parseDateOnly(new Date().toISOString().slice(0, 10));
