import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { ratesOf, vehicleCode, vehicleSummary } from '../src/services/vehicleTypes.js';

const van = {
  code: 'VAN_7', nameEn: 'Van 7', nameAr: 'فان ٧', icon: 'VAN', capacity: 7, mode: 'FIXED_ROUTE',
  baseFare: new Prisma.Decimal(2), perKm: new Prisma.Decimal(1.2), perMin: new Prisma.Decimal(0.1),
  minimumFare: new Prisma.Decimal(5), monthlyFeeUsd: new Prisma.Decimal(40), active: true, sortOrder: 3,
  createdAt: new Date(), updatedAt: new Date(),
} as const;

describe('vehicleCode', () => {
  it('accepts uppercase codes', () => {
    expect(vehicleCode.parse('VAN_7')).toBe('VAN_7');
  });
  it.each(['van 7', 'Van-7', '7VAN', '', 'A'.repeat(21)])('rejects %j', (c) => {
    expect(vehicleCode.safeParse(c).success).toBe(false);
  });
});

describe('ratesOf / vehicleSummary', () => {
  it('converts decimals to numbers', () => {
    expect(ratesOf(van as any)).toEqual({ mode: 'FIXED_ROUTE', baseFare: 2, perKm: 1.2, perMin: 0.1, minimumFare: 5 });
  });
  it('exposes only display fields', () => {
    expect(vehicleSummary(van as any)).toEqual({ code: 'VAN_7', nameEn: 'Van 7', nameAr: 'فان ٧', icon: 'VAN', capacity: 7 });
  });
});
