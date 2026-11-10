import { describe, expect, it } from 'vitest';
import { calculatedFare, findRouteFare, matchPlace, quoteFare, type Rates } from '../src/services/pricing.js';
import { roundUpTo } from '../src/lib/money.js';

const rates: Rates = { mode: 'CALCULATED', baseFare: 1, perKm: 0.5, perMin: 0.1, minimumFare: 2 };
const minieh = { id: 1, lat: 34.4497, lng: 35.8186, radiusKm: 3, active: true };
const tripoli = { id: 2, lat: 34.4367, lng: 35.8497, radiusKm: 4, active: true };
const halba = { id: 3, lat: 34.5428, lng: 36.0797, radiusKm: 3, active: true };
const places = [minieh, tripoli, halba];
const fares = [
  { fromPlaceId: 1, toPlaceId: 2, vehicleType: 'TAXI' as const, priceUsd: 5, bidirectional: true },
  { fromPlaceId: 1, toPlaceId: 3, vehicleType: 'TAXI' as const, priceUsd: 15, bidirectional: false },
];

describe('roundUpTo', () => {
  it('rounds up to the step', () => {
    expect(roundUpTo(3.1, 0.5)).toBe(3.5);
    expect(roundUpTo(3.5, 0.5)).toBe(3.5);
    expect(roundUpTo(3.51, 0.5)).toBe(4);
    expect(roundUpTo(3.333, 0)).toBe(3.33);
  });
});

describe('calculatedFare', () => {
  it('applies base + per km + per minute, rounded up', () => {
    // 1 + 0.5*10 + 0.1*20 = 8
    expect(calculatedFare(rates, 10, 20, 0.5)).toBe(8);
    // 1 + 0.5*3.3 + 0.1*7 = 3.35 -> 3.5
    expect(calculatedFare(rates, 3.3, 7, 0.5)).toBe(3.5);
  });
  it('never goes below the minimum fare', () => {
    expect(calculatedFare(rates, 0.2, 1, 0.5)).toBe(2);
  });
});

describe('matchPlace', () => {
  it('returns the nearest place containing the point', () => {
    expect(matchPlace({ lat: 34.45, lng: 35.82 }, places)?.id).toBe(1);
  });
  it('returns null outside every radius', () => {
    expect(matchPlace({ lat: 33.89, lng: 35.5 }, places)).toBeNull();
  });
  it('ignores inactive places', () => {
    expect(matchPlace({ lat: 34.45, lng: 35.82 }, [{ ...minieh, active: false }])).toBeNull();
  });
});

describe('findRouteFare', () => {
  it('finds direct and bidirectional reverse routes', () => {
    expect(findRouteFare(1, 2, 'TAXI', fares)?.priceUsd).toBe(5);
    expect(findRouteFare(2, 1, 'TAXI', fares)?.priceUsd).toBe(5);
  });
  it('does not reverse one-way routes or mix vehicle types', () => {
    expect(findRouteFare(3, 1, 'TAXI', fares)).toBeNull();
    expect(findRouteFare(1, 2, 'TUKTUK', fares)).toBeNull();
  });
});

describe('quoteFare', () => {
  const base = {
    vehicleType: 'TAXI' as const,
    pickup: { lat: 34.45, lng: 35.82 },
    dropoff: { lat: 34.437, lng: 35.85 },
    distanceKm: 4,
    durationMin: 10,
    places,
    routeFares: fares,
    roundingStep: 0.5,
  };
  it('uses the fixed route price in FIXED_ROUTE mode', () => {
    const q = quoteFare({ ...base, rates: { ...rates, mode: 'FIXED_ROUTE' } });
    expect(q).toMatchObject({ fareUsd: 5, pricingMode: 'FIXED_ROUTE' });
    expect(q.fromPlace?.id).toBe(1);
    expect(q.toPlace?.id).toBe(2);
  });
  it('ignores route prices in CALCULATED mode', () => {
    expect(quoteFare({ ...base, rates }).pricingMode).toBe('CALCULATED');
  });
  it('falls back to calculated when no route price exists', () => {
    const q = quoteFare({ ...base, vehicleType: 'TUKTUK', rates: { ...rates, mode: 'FIXED_ROUTE' } });
    expect(q).toMatchObject({ fareUsd: 4, pricingMode: 'CALCULATED' });
  });
});
