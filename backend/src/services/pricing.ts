import type { PricingMode } from '@prisma/client';
import { haversineKm, type LatLng } from '../lib/geo.js';
import { roundUpTo } from '../lib/money.js';

export interface Rates {
  mode: PricingMode;
  baseFare: number;
  perKm: number;
  perMin: number;
  minimumFare: number;
}

export interface PlaceLike {
  id: number;
  lat: number;
  lng: number;
  radiusKm: number;
  active: boolean;
}

export interface RouteFareLike {
  fromPlaceId: number;
  toPlaceId: number;
  vehicleType: string;
  priceUsd: number;
  bidirectional: boolean;
}

export function calculatedFare(rates: Rates, distanceKm: number, durationMin: number, roundingStep: number): number {
  const raw = rates.baseFare + rates.perKm * distanceKm + rates.perMin * durationMin;
  return roundUpTo(Math.max(rates.minimumFare, raw), roundingStep);
}

/** Nearest active place whose radius contains the point, or null. */
export function matchPlace<P extends PlaceLike>(point: LatLng, places: P[]): P | null {
  let best: P | null = null;
  let bestDist = Infinity;
  for (const p of places) {
    if (!p.active) continue;
    const d = haversineKm(point, p);
    if (d <= p.radiusKm && d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

export function findRouteFare<R extends RouteFareLike>(
  fromId: number,
  toId: number,
  vehicleType: string,
  fares: R[],
): R | null {
  const direct = fares.find((f) => f.vehicleType === vehicleType && f.fromPlaceId === fromId && f.toPlaceId === toId);
  if (direct) return direct;
  return (
    fares.find(
      (f) => f.vehicleType === vehicleType && f.bidirectional && f.fromPlaceId === toId && f.toPlaceId === fromId,
    ) ?? null
  );
}

export interface FareQuote<P> {
  fareUsd: number;
  pricingMode: PricingMode;
  fromPlace: P | null;
  toPlace: P | null;
}

/**
 * Decide the fare for one vehicle type. FIXED_ROUTE uses the admin route price when both ends match
 * places and a route price exists; otherwise it falls back to the calculated fare.
 */
export function quoteFare<P extends PlaceLike, R extends RouteFareLike>(args: {
  vehicleType: string;
  rates: Rates;
  pickup: LatLng;
  dropoff: LatLng;
  distanceKm: number;
  durationMin: number;
  places: P[];
  routeFares: R[];
  roundingStep: number;
}): FareQuote<P> {
  const fromPlace = matchPlace(args.pickup, args.places);
  const toPlace = matchPlace(args.dropoff, args.places);
  if (args.rates.mode === 'FIXED_ROUTE' && fromPlace && toPlace) {
    const route = findRouteFare(fromPlace.id, toPlace.id, args.vehicleType, args.routeFares);
    if (route) return { fareUsd: route.priceUsd, pricingMode: 'FIXED_ROUTE', fromPlace, toPlace };
  }
  return {
    fareUsd: calculatedFare(args.rates, args.distanceKm, args.durationMin, args.roundingStep),
    pricingMode: 'CALCULATED',
    fromPlace,
    toPlace,
  };
}
