import { Prisma, type VehicleIcon, type VehicleType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { num } from '../lib/money.js';
import { badRequest } from '../lib/errors.js';
import type { Rates } from './pricing.js';

export const vehicleCode = z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,19}$/);

export type VehicleSummary = { code: string; nameEn: string; nameAr: string; icon: VehicleIcon; capacity: number };

export const vehicleSummary = (v: VehicleType): VehicleSummary => ({
  code: v.code,
  nameEn: v.nameEn,
  nameAr: v.nameAr,
  icon: v.icon,
  capacity: v.capacity,
});

export const ratesOf = (v: VehicleType): Rates => ({
  mode: v.mode,
  baseFare: num(v.baseFare),
  perKm: num(v.perKm),
  perMin: num(v.perMin),
  minimumFare: num(v.minimumFare),
});

export const listVehicleTypes = (opts: { activeOnly?: boolean } = {}): Promise<VehicleType[]> =>
  prisma.vehicleType.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });

export async function requireVehicleType(code: string, opts: { active: boolean }): Promise<VehicleType> {
  const v = await prisma.vehicleType.findUnique({ where: { code } });
  if (!v) throw badRequest('INVALID_VEHICLE_TYPE', 'Unknown vehicle type');
  if (opts.active && !v.active) throw badRequest('INVALID_VEHICLE_TYPE', 'Vehicle type is not available');
  return v;
}

/** Today's built-in types; used by the seed and by the legacy-database migration. */
export const LEGACY_VEHICLE_TYPES: Record<'TAXI' | 'TUKTUK', Omit<Prisma.VehicleTypeCreateInput, 'monthlyFeeUsd'>> = {
  TAXI: {
    code: 'TAXI', nameEn: 'Taxi', nameAr: 'تاكسي', icon: 'CAR', capacity: 4, mode: 'CALCULATED', sortOrder: 0,
    baseFare: 1, perKm: 0.6, perMin: 0.05, minimumFare: 2,
  },
  TUKTUK: {
    code: 'TUKTUK', nameEn: 'Tuk-tuk', nameAr: 'توك توك', icon: 'TUKTUK', capacity: 3, mode: 'CALCULATED', sortOrder: 0,
    baseFare: 0.5, perKm: 0.4, perMin: 0.03, minimumFare: 1,
  },
};

export const serializeVehicleType = (v: VehicleType, driverCount: number) => ({
  code: v.code,
  nameEn: v.nameEn,
  nameAr: v.nameAr,
  icon: v.icon,
  capacity: v.capacity,
  mode: v.mode,
  baseFare: num(v.baseFare),
  perKm: num(v.perKm),
  perMin: num(v.perMin),
  minimumFare: num(v.minimumFare),
  monthlyFeeUsd: num(v.monthlyFeeUsd),
  active: v.active,
  sortOrder: v.sortOrder,
  driverCount,
});
