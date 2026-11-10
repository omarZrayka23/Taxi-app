import { prisma } from '../db.js';

export const DEFAULT_SETTINGS = {
  commissionPercent: 10,
  rentalCommissionPercent: 10,
  monthlyFeeTaxiUsd: 30,
  monthlyFeeTuktukUsd: 15,
  lbpRate: 89500,
  maxDebtUsd: 20,
  searchRadiusKm: 5,
  offerTimeoutSec: 60,
  fareRoundingUsd: 0.5,
  supportPhone: '+96170000000',
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;

let cache: { value: Settings; at: number } | null = null;
const TTL_MS = 10_000;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await prisma.setting.findMany();
  const value: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!(row.key in DEFAULT_SETTINGS)) continue;
    const key = row.key as SettingKey;
    const def = DEFAULT_SETTINGS[key];
    (value as Record<string, unknown>)[key] = typeof def === 'number' ? Number(row.value) : row.value;
  }
  cache = { value, at: Date.now() };
  return value;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const entries = Object.entries(patch).filter(([k, v]) => k in DEFAULT_SETTINGS && v !== undefined);
  await prisma.$transaction(
    entries.map(([key, v]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value: String(v) }, update: { value: String(v) } }),
    ),
  );
  cache = null;
  return getSettings();
}

export const monthlyFeeFor = (s: Settings, vehicleType: 'TAXI' | 'TUKTUK') =>
  vehicleType === 'TAXI' ? s.monthlyFeeTaxiUsd : s.monthlyFeeTuktukUsd;
