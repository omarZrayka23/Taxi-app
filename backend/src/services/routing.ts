import { config } from '../config.js';
import { haversineKm, type LatLng } from '../lib/geo.js';
import { round2 } from '../lib/money.js';

export interface RouteInfo {
  distanceKm: number;
  durationMin: number;
}

/** Straight-line distance × road factor, at an average urban speed. Works offline. */
export function estimateRoute(a: LatLng, b: LatLng): RouteInfo {
  const ROAD_FACTOR = 1.35;
  const AVG_SPEED_KMH = 30;
  const distanceKm = haversineKm(a, b) * ROAD_FACTOR;
  return { distanceKm: round2(distanceKm), durationMin: round2((distanceKm / AVG_SPEED_KMH) * 60) };
}

async function osrmRoute(a: LatLng, b: LatLng): Promise<RouteInfo> {
  const url = `${config.osrmUrl}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = (await res.json()) as { routes?: { distance: number; duration: number }[] };
  const r = data.routes?.[0];
  if (!r) throw new Error('OSRM: no route');
  return { distanceKm: round2(r.distance / 1000), durationMin: round2(r.duration / 60) };
}

async function googleRoute(a: LatLng, b: LatLng): Promise<RouteInfo> {
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${a.lat},${a.lng}` +
    `&destinations=${b.lat},${b.lng}&mode=driving&key=${config.googleMapsApiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  const data = (await res.json()) as {
    rows?: { elements?: { status: string; distance: { value: number }; duration: { value: number } }[] }[];
  };
  const el = data.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK') throw new Error('Google: no route');
  return { distanceKm: round2(el.distance.value / 1000), durationMin: round2(el.duration.value / 60) };
}

/** Road distance/time using the configured provider; falls back to the offline estimate on any failure. */
export async function getRoute(a: LatLng, b: LatLng): Promise<RouteInfo> {
  try {
    if (config.routingProvider === 'osrm') return await osrmRoute(a, b);
    if (config.routingProvider === 'google' && config.googleMapsApiKey) return await googleRoute(a, b);
  } catch (err) {
    console.warn('Routing provider failed, using estimate:', (err as Error).message);
  }
  return estimateRoute(a, b);
}
