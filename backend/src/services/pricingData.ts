import type { VehicleType } from '@prisma/client';
import { prisma } from '../db.js';
import type { LatLng } from '../lib/geo.js';
import { num, toLbp } from '../lib/money.js';
import { quoteFare, type Rates } from './pricing.js';
import { getRoute } from './routing.js';
import { serializePlace } from './serializers.js';
import { getSettings } from './settings.js';

export const VEHICLE_TYPES: VehicleType[] = ['TAXI', 'TUKTUK'];

/** Used when the admin has not configured a vehicle type yet. */
export const DEFAULT_RATES: Record<VehicleType, Omit<Rates, 'mode'>> = {
  TAXI: { baseFare: 1, perKm: 0.6, perMin: 0.05, minimumFare: 2 },
  TUKTUK: { baseFare: 0.5, perKm: 0.4, perMin: 0.03, minimumFare: 1 },
};

export async function getPricingRules(): Promise<(Rates & { type: VehicleType })[]> {
  const rows = await prisma.pricingRule.findMany();
  return VEHICLE_TYPES.map((type) => {
    const row = rows.find((r) => r.vehicleType === type);
    if (!row) return { type, mode: 'CALCULATED' as const, ...DEFAULT_RATES[type] };
    return {
      type,
      mode: row.mode,
      baseFare: num(row.baseFare),
      perKm: num(row.perKm),
      perMin: num(row.perMin),
      minimumFare: num(row.minimumFare),
    };
  });
}

/** Fare estimates for every vehicle type between two points. */
export async function estimateFares(pickup: LatLng, dropoff: LatLng) {
  const [settings, rules, places, fares, route] = await Promise.all([
    getSettings(),
    getPricingRules(),
    prisma.place.findMany({ where: { active: true } }),
    prisma.routeFare.findMany(),
    getRoute(pickup, dropoff),
  ]);
  const routeFares = fares.map((f) => ({ ...f, priceUsd: num(f.priceUsd) }));
  return {
    lbpRate: settings.lbpRate,
    estimates: rules.map((rates) => {
      const q = quoteFare({
        vehicleType: rates.type,
        rates,
        pickup,
        dropoff,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        places,
        routeFares,
        roundingStep: settings.fareRoundingUsd,
      });
      return {
        vehicleType: rates.type,
        fareUsd: q.fareUsd,
        fareLbp: toLbp(q.fareUsd, settings.lbpRate),
        pricingMode: q.pricingMode,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        fromPlace: q.fromPlace ? serializePlace(q.fromPlace) : null,
        toPlace: q.toPlace ? serializePlace(q.toPlace) : null,
      };
    }),
  };
}
