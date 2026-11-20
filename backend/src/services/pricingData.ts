import { prisma } from '../db.js';
import type { LatLng } from '../lib/geo.js';
import { num, toLbp } from '../lib/money.js';
import { quoteFare } from './pricing.js';
import { getRoute } from './routing.js';
import { serializePlace } from './serializers.js';
import { getSettings } from './settings.js';
import { listVehicleTypes, ratesOf, vehicleSummary } from './vehicleTypes.js';

/** Fare estimates for every vehicle type between two points. */
export async function estimateFares(pickup: LatLng, dropoff: LatLng) {
  const [settings, types, places, fares, route] = await Promise.all([
    getSettings(),
    listVehicleTypes({ activeOnly: true }),
    prisma.place.findMany({ where: { active: true } }),
    prisma.routeFare.findMany(),
    getRoute(pickup, dropoff),
  ]);
  const routeFares = fares.map((f) => ({ ...f, priceUsd: num(f.priceUsd) }));
  return {
    lbpRate: settings.lbpRate,
    estimates: types.map((v) => {
      const rates = ratesOf(v);
      const q = quoteFare({
        vehicleType: v.code,
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
        vehicleType: v.code,
        vehicle: vehicleSummary(v),
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
