import dayjs from 'dayjs';

const usdFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** `$12.50`, `-$3.00`; em dash for empty values. */
export function formatUsd(v: number | string | null | undefined): string {
  const n = toNumber(v);
  if (n === null) return '—';
  const s = `$${usdFormatter.format(Math.abs(n))}`;
  return n < 0 ? `-${s}` : s;
}

/** `1,500,000 LBP` */
export function formatLbp(v: number | string | null | undefined): string {
  const n = toNumber(v);
  if (n === null) return '—';
  return `${intFormatter.format(Math.round(n))} LBP`;
}

export function formatNumber(v: number | string | null | undefined, digits = 0): string {
  const n = toNumber(v);
  if (n === null) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n);
}

export function formatDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  const d = dayjs(v);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : v;
}

export function formatDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = dayjs(v);
  return d.isValid() ? d.format('YYYY-MM-DD') : v;
}

/** `IN_PROGRESS` -> `In progress` */
export function humanize(v: string | null | undefined): string {
  if (!v) return '—';
  const s = v.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function usdToLbp(usd: number | null | undefined, lbpRate: number | null | undefined): number | null {
  if (usd === null || usd === undefined || !lbpRate) return null;
  return Math.round(Number(usd) * Number(lbpRate));
}
