import { describe, expect, it } from 'vitest';
import { normalizeLebanesePhone } from '../src/lib/phone.js';
import { daysBetween, parseDateOnly, rangesOverlap } from '../src/lib/dates.js';

describe('normalizeLebanesePhone', () => {
  it.each([
    ['03123456', '+9613123456'],
    ['3123456', '+9613123456'],
    ['+961 3 123 456', '+9613123456'],
    ['0096171123456', '+96171123456'],
    ['71-123-456', '+96171123456'],
    ['961 81 123456', '+96181123456'],
  ])('%s -> %s', (input, out) => expect(normalizeLebanesePhone(input)).toBe(out));

  it.each(['12', 'abc', '+33612345678', ''])('rejects %s', (input) => expect(normalizeLebanesePhone(input)).toBeNull());
});

describe('dates', () => {
  it('counts rental days with exclusive end', () => {
    expect(daysBetween(parseDateOnly('2026-11-10'), parseDateOnly('2026-11-13'))).toBe(3);
  });
  it('rejects impossible dates', () => {
    expect(() => parseDateOnly('2026-02-30')).toThrow();
    expect(() => parseDateOnly('10/11/2026')).toThrow();
  });
  it('treats back-to-back bookings as non-overlapping', () => {
    const d = parseDateOnly;
    expect(rangesOverlap(d('2026-11-10'), d('2026-11-12'), d('2026-11-12'), d('2026-11-14'))).toBe(false);
    expect(rangesOverlap(d('2026-11-10'), d('2026-11-13'), d('2026-11-12'), d('2026-11-14'))).toBe(true);
  });
});
