import i18n from '@/i18n';
import { ApiError, NETWORK_ERROR } from '@/api/client';
import type { Place } from '@/api/types';

const isAr = () => i18n.language === 'ar';

export function formatUsd(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  const s = Number.isInteger(n) ? n.toString() : n.toFixed(2);
  return `$${s}`;
}

function groupThousands(n: number) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatLbp(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return `${groupThousands(Number(v))} ${i18n.t('common.lbp')}`;
}

export function usdToLbp(usd: number | null | undefined, rate: number | undefined): number | null {
  if (usd == null || !rate) return null;
  return Math.round(Number(usd) * rate);
}

export function formatKm(v: number | null | undefined) {
  if (v == null) return '—';
  return `${Number(v).toFixed(1)} ${i18n.t('common.km')}`;
}

export function formatMin(v: number | null | undefined) {
  if (v == null) return '—';
  return `${Math.round(Number(v))} ${i18n.t('common.min')}`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** YYYY-MM-DD → localized short date (dd/mm/yyyy). */
export function formatDate(ymd: string | null | undefined) {
  if (!ymd) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return formatDateTime(ymd).split(' ')[0];
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function placeName(p: Pick<Place, 'nameAr' | 'nameEn'> | null | undefined) {
  if (!p) return '';
  return isAr() ? p.nameAr || p.nameEn : p.nameEn || p.nameAr;
}

export function coordLabel(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// ---------- Phone ----------

/** Normalize a Lebanese phone to +961XXXXXXXX, or null if invalid. */
export function normalizeLebanesePhone(input: string): string | null {
  let s = input.replace(/[\s\-().]/g, '');
  if (s.startsWith('+961')) s = s.slice(4);
  else if (s.startsWith('00961')) s = s.slice(5);
  else if (s.startsWith('961') && s.length > 9) s = s.slice(3);
  if (s.startsWith('0')) s = s.slice(1);
  if (!/^\d{7,8}$/.test(s)) return null;
  return `+961${s}`;
}

// ---------- Dates for rentals ----------

export function toYmd(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function daysBetween(start: string, end: string) {
  return Math.round((parseYmd(end).getTime() - parseYmd(start).getTime()) / 86_400_000);
}

// ---------- Errors ----------

/** Translate an API error to a user-facing message (error code → i18n, fallback to server text). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === NETWORK_ERROR) return i18n.t('errors.NETWORK_ERROR');
    const key = `errors.${err.code}`;
    if (i18n.exists(key)) return i18n.t(key);
    if (err.message) return err.message;
    return i18n.t('errors.generic');
  }
  if (err instanceof Error && err.message) return err.message;
  return i18n.t('errors.generic');
}

export function errorCode(err: unknown): string | null {
  return err instanceof ApiError ? err.code : null;
}
