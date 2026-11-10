const rawUrl = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4000';

/** Server origin, e.g. http://10.0.2.2:4000 (no trailing slash). */
export const SERVER_URL = rawUrl.replace(/\/+$/, '').replace(/\/api$/, '');
/** REST API base. */
export const API_BASE = `${SERVER_URL}/api`;

/** Default map centre: Minieh, North Lebanon. */
export const MINIEH = { latitude: 34.48, longitude: 35.93 };

/** Turn a relative upload URL (/uploads/x.jpg) into an absolute one. */
export function fileUrl(relative: string | null | undefined): string | undefined {
  if (!relative) return undefined;
  if (/^https?:\/\//i.test(relative)) return relative;
  return `${SERVER_URL}${relative.startsWith('/') ? '' : '/'}${relative}`;
}
