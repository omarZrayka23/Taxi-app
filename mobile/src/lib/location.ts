import * as Location from 'expo-location';
import type { LatLng } from '@/api/types';

export async function ensureLocationPermission(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const res = await Location.requestForegroundPermissionsAsync();
    return res.granted;
  } catch {
    return false;
  }
}

/** Current position or null (no permission / services off / timeout). */
export async function getCurrentPosition(timeoutMs = 10000): Promise<LatLng | null> {
  if (!(await ensureLocationPermission())) return null;
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
    const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
    const pos = (await Promise.race([fresh, timeout])) ?? last;
    if (!pos) return null;
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/** Best-effort short address for a coordinate. */
export async function reverseGeocode(p: LatLng): Promise<string | null> {
  try {
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
    const res = await Promise.race([Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng }), timeout]);
    const a = res?.[0];
    if (!a) return null;
    const parts = [a.name, a.street, a.district, a.city].filter(
      (x, i, arr): x is string => !!x && arr.indexOf(x) === i,
    );
    return parts.slice(0, 3).join(', ') || null;
  } catch {
    return null;
  }
}
