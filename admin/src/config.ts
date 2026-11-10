const rawOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:4000').trim();

/** Server origin, e.g. http://localhost:4000 (no trailing slash). */
export const API_ORIGIN = rawOrigin.replace(/\/+$/, '');

/** REST base, e.g. http://localhost:4000/api */
export const API_BASE = `${API_ORIGIN}/api`;

/** Turn a relative upload URL (/uploads/abc.jpg) into an absolute one. */
export function fileUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}
