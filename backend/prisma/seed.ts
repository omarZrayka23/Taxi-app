/**
 * Seeds the first admin, default settings, pricing and starter places/route prices for North Lebanon.
 * Coordinates and prices are STARTING POINTS — review them in the admin panel before launch.
 * Safe to run more than once.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, type VehicleType } from '@prisma/client';
import { normalizeLebanesePhone } from '../src/lib/phone.js';
import { DEFAULT_SETTINGS } from '../src/services/settings.js';

const prisma = new PrismaClient();

// Approximate town centres; radius = how far from the centre counts as "in" the place for fixed prices.
const PLACES = [
  { key: 'minieh', nameEn: 'Minieh', nameAr: 'المنية', lat: 34.48, lng: 35.93, radiusKm: 2.5 },
  { key: 'deirAmmar', nameEn: 'Deir Ammar', nameAr: 'دير عمار', lat: 34.462, lng: 35.902, radiusKm: 1.5 },
  { key: 'beddawi', nameEn: 'Beddawi', nameAr: 'البداوي', lat: 34.452, lng: 35.87, radiusKm: 1.5 },
  { key: 'bhannine', nameEn: 'Bhannine', nameAr: 'بحنين', lat: 34.5, lng: 35.95, radiusKm: 1.5 },
  { key: 'tripoli', nameEn: 'Tripoli', nameAr: 'طرابلس', lat: 34.436, lng: 35.845, radiusKm: 4 },
  { key: 'mina', nameEn: 'El Mina', nameAr: 'الميناء', lat: 34.452, lng: 35.815, radiusKm: 1.5 },
  { key: 'zgharta', nameEn: 'Zgharta', nameAr: 'زغرتا', lat: 34.398, lng: 35.895, radiusKm: 2 },
  { key: 'halba', nameEn: 'Halba', nameAr: 'حلبا', lat: 34.543, lng: 36.08, radiusKm: 2.5 },
  { key: 'beirut', nameEn: 'Beirut', nameAr: 'بيروت', lat: 33.8938, lng: 35.5018, radiusKm: 6 },
] as const;

type PlaceKey = (typeof PLACES)[number]['key'];

// [from, to, taxi USD, tuk-tuk USD | null]
const ROUTES: [PlaceKey, PlaceKey, number, number | null][] = [
  ['minieh', 'deirAmmar', 2, 1.5],
  ['minieh', 'beddawi', 3, 2],
  ['minieh', 'bhannine', 2, 1.5],
  ['minieh', 'tripoli', 5, 3],
  ['minieh', 'mina', 6, 4],
  ['minieh', 'zgharta', 7, null],
  ['minieh', 'halba', 10, null],
  ['minieh', 'beirut', 60, null],
  ['beddawi', 'tripoli', 3, 2],
];

async function main() {
  // Settings (only fill missing keys so re-running doesn't overwrite admin changes)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value: String(value) }, update: {} });
  }

  const rules: Record<VehicleType, { baseFare: number; perKm: number; perMin: number; minimumFare: number }> = {
    TAXI: { baseFare: 1, perKm: 0.6, perMin: 0.05, minimumFare: 2 },
    TUKTUK: { baseFare: 0.5, perKm: 0.4, perMin: 0.03, minimumFare: 1 },
  };
  for (const [vehicleType, r] of Object.entries(rules) as [VehicleType, (typeof rules)[VehicleType]][]) {
    await prisma.pricingRule.upsert({
      where: { vehicleType },
      create: { vehicleType, mode: 'FIXED_ROUTE', ...r },
      update: {},
    });
  }

  const ids = {} as Record<PlaceKey, number>;
  for (const { key, ...p } of PLACES) {
    const existing = await prisma.place.findFirst({ where: { nameEn: p.nameEn } });
    ids[key] = (existing ?? (await prisma.place.create({ data: p }))).id;
  }

  for (const [from, to, taxi, tuktuk] of ROUTES) {
    const prices: [VehicleType, number | null][] = [
      ['TAXI', taxi],
      ['TUKTUK', tuktuk],
    ];
    for (const [vehicleType, priceUsd] of prices) {
      if (priceUsd === null) continue;
      await prisma.routeFare.upsert({
        where: { fromPlaceId_toPlaceId_vehicleType: { fromPlaceId: ids[from], toPlaceId: ids[to], vehicleType } },
        create: { fromPlaceId: ids[from], toPlaceId: ids[to], vehicleType, priceUsd, bidirectional: true },
        update: {},
      });
    }
  }

  const phone = normalizeLebanesePhone(process.env.ADMIN_PHONE ?? '+96170000000');
  if (!phone) throw new Error('ADMIN_PHONE is not a valid Lebanese number');
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  const admin = await prisma.user.upsert({
    where: { phone },
    create: { name: 'Admin', phone, passwordHash: await bcrypt.hash(password, 10), role: 'ADMIN', phoneVerified: true, language: 'en' },
    update: { role: 'ADMIN' },
  });
  await prisma.ownerProfile.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id, type: 'PLATFORM', businessName: 'Cedra', status: 'APPROVED' },
    update: {},
  });

  console.log(`Seed done. Admin login: ${phone} / ${process.env.ADMIN_PASSWORD ? '(ADMIN_PASSWORD)' : password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
