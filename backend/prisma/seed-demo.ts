/**
 * DEMO DATA — fills the database with realistic sample passengers, drivers, owners, rides, rentals and billing
 * so the admin panel and the app have something to show. Never run this on a production database.
 *
 *   npm run seed           # required first: admin, settings, vehicle types, places, route prices
 *   npm run seed:demo      # adds the demo data (skips if it is already there)
 *   npm run seed:demo -- --reset   # deletes the demo data and creates it again
 *
 * Every demo account uses a +961761000xx phone number and the password `demo1234`.
 * Generated placeholder images (documents, car photos) are written to uploads/demo-*.png.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import bcrypt from 'bcryptjs';
import {
  PrismaClient,
  type ApprovalStatus,
  type BillingPlan,
  type BookingStatus,
  type DocumentType,
  type FuelType,
  type Gender,
  type OwnerType,
  type Place,
  type Prisma,
  type RentalMode,
  type Transmission,
} from '@prisma/client';
import { haversineKm } from '../src/lib/geo.js';
import { round2 } from '../src/lib/money.js';
import { calculatedFare, findRouteFare, matchPlace } from '../src/services/pricing.js';
import { ratesOf } from '../src/services/vehicleTypes.js';
import { DEFAULT_SETTINGS } from '../src/services/settings.js';
import { uploadRoot } from '../src/services/uploads.js';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'demo1234';
const PHONE_PREFIX = '+961761000';
const phoneOf = (n: number) => `${PHONE_PREFIX}${String(n).padStart(2, '0')}`;

// ---------------------------------------------------------------- deterministic random
let seed = 20261120;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + rand() * (max - min);
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
const jitter = (km: number) => (rand() - 0.5) * 2 * (km / 111);

const DAY = 86_400_000;
const MIN = 60_000;
const now = new Date();
const daysAgo = (d: number, hour = 12) => {
  const x = new Date(now.getTime() - d * DAY);
  x.setHours(hour, intBetween(0, 59), 0, 0);
  return x;
};
const dateOnly = (offsetDays: number) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Date(d.getTime() + offsetDays * DAY);
};

// ---------------------------------------------------------------- placeholder PNGs (no dependencies)
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const shade = ([r, g, b]: Rgb, f: number): Rgb => [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v * f)))) as Rgb;

/** A simple picture: background, a horizon band and a rounded "car" or "card" block in the middle. */
function placeholderPng(w: number, h: number, bg: Rgb, fg: Rgb, kind: 'car' | 'card'): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      let c: Rgb = y > h * 0.72 ? shade(bg, 0.8) : bg;
      if (kind === 'car') {
        const body = x > w * 0.18 && x < w * 0.82 && y > h * 0.45 && y < h * 0.7;
        const roof = x > w * 0.32 && x < w * 0.68 && y > h * 0.3 && y <= h * 0.45;
        const window = roof && x > w * 0.35 && x < w * 0.65 && y > h * 0.33;
        const wheel = [0.3, 0.7].some((cx) => (x - w * cx) ** 2 + (y - h * 0.7) ** 2 < (h * 0.08) ** 2);
        if (body || roof) c = fg;
        if (window) c = [190, 215, 235];
        if (wheel) c = [35, 35, 35];
      } else {
        const card = x > w * 0.1 && x < w * 0.9 && y > h * 0.15 && y < h * 0.85;
        const photo = x > w * 0.15 && x < w * 0.38 && y > h * 0.25 && y < h * 0.7;
        const line = x > w * 0.45 && x < w * 0.85 && [0.3, 0.42, 0.54, 0.66].some((ly) => Math.abs(y - h * ly) < h * 0.025);
        if (card) c = [250, 250, 250];
        if (photo) c = fg;
        if (line) c = shade(fg, 0.7);
      }
      raw.set(c, row + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function writeImage(name: string, png: Buffer) {
  fs.mkdirSync(uploadRoot, { recursive: true });
  fs.writeFileSync(path.join(uploadRoot, name), png);
  return `/uploads/${name}`;
}

const CAR_COLORS: Record<string, string> = {
  White: '#e8e8e8', Black: '#2b2b2b', Silver: '#b8bcc2', Grey: '#7d838a', Red: '#b3262e', Blue: '#2457a6',
  Yellow: '#e6b800', Green: '#2e7d4f', Beige: '#d8c7a3',
};
const carPhoto = (key: string, color: string, variant: number) =>
  writeImage(
    `demo-car-${key}-${variant}.png`,
    placeholderPng(480, 320, variant === 0 ? [214, 230, 242] : [226, 222, 210], hex(CAR_COLORS[color] ?? '#888888'), 'car'),
  );
const DOC_COLORS: Record<DocumentType, string> = {
  ID_CARD: '#3f7cc4', DRIVER_LICENSE: '#c46a3f', CAR_REGISTRATION: '#3fa36b', INSURANCE: '#8a4fc4',
  VEHICLE_PHOTO: '#c4a33f', BUSINESS_LICENSE: '#c43f6a',
};
const docImage = (userKey: string, type: DocumentType) =>
  writeImage(`demo-doc-${userKey}-${type.toLowerCase()}.png`, placeholderPng(480, 300, [236, 240, 244], hex(DOC_COLORS[type]), 'card'));

// ---------------------------------------------------------------- demo people
interface PersonSeed {
  n: number;
  name: string;
  gender: Gender;
  language: 'ar' | 'en';
  email?: string;
  blocked?: boolean;
  joinedDaysAgo: number;
}

const PASSENGERS: PersonSeed[] = [
  { n: 1, name: 'Rami Khaled', gender: 'MALE', language: 'ar', joinedDaysAgo: 58 },
  { n: 2, name: 'Lina Haddad', gender: 'FEMALE', language: 'en', email: 'lina.haddad@example.com', joinedDaysAgo: 55 },
  { n: 3, name: 'Mohammad Ali', gender: 'MALE', language: 'ar', joinedDaysAgo: 50 },
  { n: 4, name: 'Fatima Zein', gender: 'FEMALE', language: 'ar', joinedDaysAgo: 44 },
  { n: 5, name: 'Omar Sabbagh', gender: 'MALE', language: 'en', email: 'omar.s@example.com', joinedDaysAgo: 40 },
  { n: 6, name: 'Nour Merhebi', gender: 'FEMALE', language: 'ar', joinedDaysAgo: 33 },
  { n: 7, name: 'Hassan Ayoubi', gender: 'MALE', language: 'ar', joinedDaysAgo: 27 },
  { n: 8, name: 'Maya Kassem', gender: 'FEMALE', language: 'en', joinedDaysAgo: 19 },
  { n: 9, name: 'Ziad Hamoud', gender: 'MALE', language: 'ar', joinedDaysAgo: 12 },
  { n: 10, name: 'Rana Dib', gender: 'FEMALE', language: 'ar', joinedDaysAgo: 6 },
  { n: 11, name: 'Karim Fakhoury', gender: 'MALE', language: 'ar', blocked: true, joinedDaysAgo: 30 },
];

interface DriverSeed extends PersonSeed {
  vehicleType: string;
  make: string;
  model: string;
  color: string;
  plate: string;
  status: ApprovalStatus;
  plan: BillingPlan;
  online?: boolean;
  at: string; // place nameEn the driver is near
  rejectionReason?: string;
  owesUsd?: number; // extra unpaid balance to show the debt limit
}

const DRIVERS: DriverSeed[] = [
  { n: 21, name: 'Khaled Mrad', gender: 'MALE', language: 'ar', joinedDaysAgo: 60, vehicleType: 'TAXI', make: 'Toyota', model: 'Corolla', color: 'White', plate: 'T 123456', status: 'APPROVED', plan: 'COMMISSION', online: true, at: 'Minieh' },
  { n: 22, name: 'Samir Taleb', gender: 'MALE', language: 'ar', joinedDaysAgo: 57, vehicleType: 'TAXI', make: 'Hyundai', model: 'Elantra', color: 'Silver', plate: 'T 228914', status: 'APPROVED', plan: 'MONTHLY', online: true, at: 'Tripoli' },
  { n: 23, name: 'Hiba Chaar', gender: 'FEMALE', language: 'ar', joinedDaysAgo: 52, vehicleType: 'TAXI', make: 'Kia', model: 'Cerato', color: 'Grey', plate: 'T 310077', status: 'APPROVED', plan: 'COMMISSION', online: true, at: 'Minieh' },
  { n: 24, name: 'Ahmad Rifai', gender: 'MALE', language: 'ar', joinedDaysAgo: 49, vehicleType: 'TUKTUK', make: 'Bajaj', model: 'RE', color: 'Yellow', plate: 'M 44120', status: 'APPROVED', plan: 'COMMISSION', online: true, at: 'Minieh' },
  { n: 25, name: 'Youssef Darwich', gender: 'MALE', language: 'ar', joinedDaysAgo: 45, vehicleType: 'TUKTUK', make: 'TVS', model: 'King', color: 'Green', plate: 'M 51833', status: 'APPROVED', plan: 'MONTHLY', online: false, at: 'Beddawi' },
  { n: 26, name: 'Bilal Osman', gender: 'MALE', language: 'en', joinedDaysAgo: 41, vehicleType: 'MOTORCYCLE', make: 'Honda', model: 'CG 125', color: 'Red', plate: 'M 60421', status: 'APPROVED', plan: 'COMMISSION', online: true, at: 'Deir Ammar' },
  { n: 27, name: 'Walid Saad', gender: 'MALE', language: 'ar', joinedDaysAgo: 38, vehicleType: 'VAN_7', make: 'Kia', model: 'Carnival', color: 'Black', plate: 'P 712340', status: 'APPROVED', plan: 'MONTHLY', online: false, at: 'Tripoli' },
  { n: 28, name: 'Jamil Hamdan', gender: 'MALE', language: 'ar', joinedDaysAgo: 35, vehicleType: 'TAXI', make: 'Nissan', model: 'Sunny', color: 'White', plate: 'T 405512', status: 'APPROVED', plan: 'COMMISSION', online: false, at: 'Minieh', owesUsd: 24 },
  { n: 29, name: 'Rola Hijazi', gender: 'FEMALE', language: 'en', joinedDaysAgo: 4, vehicleType: 'TAXI', make: 'Toyota', model: 'Yaris', color: 'Blue', plate: 'T 518800', status: 'PENDING', plan: 'COMMISSION', at: 'Minieh' },
  { n: 30, name: 'Tarek Moussa', gender: 'MALE', language: 'ar', joinedDaysAgo: 3, vehicleType: 'TUKTUK', make: 'Bajaj', model: 'RE', color: 'Blue', plate: 'M 70215', status: 'PENDING', plan: 'COMMISSION', at: 'Bhannine' },
  { n: 31, name: 'Fadi Kanaan', gender: 'MALE', language: 'ar', joinedDaysAgo: 2, vehicleType: 'VAN_11', make: 'Toyota', model: 'HiAce', color: 'White', plate: 'P 800114', status: 'PENDING', plan: 'MONTHLY', at: 'Halba' },
  { n: 32, name: 'Imad Sleiman', gender: 'MALE', language: 'ar', joinedDaysAgo: 20, vehicleType: 'TAXI', make: 'Chevrolet', model: 'Aveo', color: 'Red', plate: 'T 999001', status: 'REJECTED', plan: 'COMMISSION', at: 'Zgharta', rejectionReason: 'Driving license photo is unreadable — please upload a clear photo.' },
  { n: 33, name: 'Nabil Chehade', gender: 'MALE', language: 'ar', joinedDaysAgo: 47, vehicleType: 'TAXI', make: 'Mercedes', model: 'E200', color: 'Black', plate: 'T 112233', status: 'SUSPENDED', plan: 'COMMISSION', at: 'Tripoli', rejectionReason: 'Repeated passenger complaints.' },
];

interface OwnerSeed extends PersonSeed {
  type: OwnerType;
  businessName?: string;
  status: ApprovalStatus;
  rejectionReason?: string;
}

const OWNERS: OwnerSeed[] = [
  { n: 41, name: 'Georges Nasr', gender: 'MALE', language: 'en', joinedDaysAgo: 54, type: 'INDIVIDUAL', status: 'APPROVED' },
  { n: 42, name: 'North Wheels Rent', gender: 'MALE', language: 'ar', joinedDaysAgo: 51, type: 'AGENCY', businessName: 'North Wheels', status: 'APPROVED' },
  { n: 43, name: 'Sara Adra', gender: 'FEMALE', language: 'ar', joinedDaysAgo: 22, type: 'INDIVIDUAL', status: 'APPROVED' },
  { n: 44, name: 'Cedar Drive Agency', gender: 'MALE', language: 'en', joinedDaysAgo: 5, type: 'AGENCY', businessName: 'Cedar Drive', status: 'PENDING' },
  { n: 45, name: 'Mazen Halabi', gender: 'MALE', language: 'ar', joinedDaysAgo: 15, type: 'INDIVIDUAL', status: 'REJECTED', rejectionReason: 'ID card does not match the account name.' },
];

interface ListingSeed {
  key: string;
  owner: number | 'PLATFORM';
  make: string;
  model: string;
  year: number;
  seats: number;
  transmission: Transmission;
  fuelType: FuelType;
  color: string;
  place: string;
  description: string;
  selfDrive?: number; // price per day
  withDriver?: number;
  deposit: number;
  minDays?: number;
  status: ApprovalStatus;
  isActive?: boolean;
  rejectionReason?: string;
}

const LISTINGS: ListingSeed[] = [
  { key: 'rio', owner: 41, make: 'Kia', model: 'Rio', year: 2019, seats: 5, transmission: 'AUTOMATIC', fuelType: 'GASOLINE', color: 'Silver', place: 'Minieh', description: 'Economical city car, full A/C, recently serviced.', selfDrive: 30, deposit: 150, status: 'APPROVED' },
  { key: 'tucson', owner: 41, make: 'Hyundai', model: 'Tucson', year: 2021, seats: 5, transmission: 'AUTOMATIC', fuelType: 'GASOLINE', color: 'White', place: 'Minieh', description: 'Comfortable SUV, great for trips to the mountains.', selfDrive: 55, withDriver: 85, deposit: 300, minDays: 2, status: 'APPROVED' },
  { key: 'yaris', owner: 42, make: 'Toyota', model: 'Yaris', year: 2020, seats: 5, transmission: 'AUTOMATIC', fuelType: 'GASOLINE', color: 'Red', place: 'Tripoli', description: 'Small and easy to park in Tripoli. Unlimited km.', selfDrive: 28, deposit: 150, status: 'APPROVED' },
  { key: 'camry', owner: 42, make: 'Toyota', model: 'Camry', year: 2022, seats: 5, transmission: 'AUTOMATIC', fuelType: 'HYBRID', color: 'Black', place: 'Tripoli', description: 'Hybrid sedan, ideal for business trips and airport transfers.', selfDrive: 65, withDriver: 95, deposit: 400, status: 'APPROVED' },
  { key: 'hiace', owner: 42, make: 'Toyota', model: 'HiAce', year: 2018, seats: 12, transmission: 'MANUAL', fuelType: 'DIESEL', color: 'White', place: 'Tripoli', description: 'Van with driver for weddings, groups and family trips.', withDriver: 120, deposit: 0, status: 'APPROVED' },
  { key: 'picanto', owner: 43, make: 'Kia', model: 'Picanto', year: 2017, seats: 4, transmission: 'MANUAL', fuelType: 'GASOLINE', color: 'Blue', place: 'Beddawi', description: 'Cheap and reliable. Manual gearbox.', selfDrive: 20, deposit: 100, status: 'APPROVED' },
  { key: 'sportage', owner: 43, make: 'Kia', model: 'Sportage', year: 2023, seats: 5, transmission: 'AUTOMATIC', fuelType: 'GASOLINE', color: 'Grey', place: 'Beddawi', description: 'Almost new SUV.', selfDrive: 60, deposit: 350, minDays: 3, status: 'PENDING' },
  { key: 'golf', owner: 43, make: 'Volkswagen', model: 'Golf', year: 2012, seats: 5, transmission: 'MANUAL', fuelType: 'GASOLINE', color: 'Green', place: 'Beddawi', description: 'Older hatchback.', selfDrive: 18, deposit: 100, status: 'REJECTED', rejectionReason: 'Photos do not show the car clearly; please add photos of the outside and inside.' },
  { key: 'corolla-p', owner: 'PLATFORM', make: 'Toyota', model: 'Corolla', year: 2022, seats: 5, transmission: 'AUTOMATIC', fuelType: 'GASOLINE', color: 'White', place: 'Minieh', description: 'Cedra car — insured, with 24/7 support.', selfDrive: 40, withDriver: 70, deposit: 200, status: 'APPROVED' },
  { key: 'tiguan-p', owner: 'PLATFORM', make: 'Volkswagen', model: 'Tiguan', year: 2021, seats: 5, transmission: 'AUTOMATIC', fuelType: 'DIESEL', color: 'Beige', place: 'Tripoli', description: 'Cedra SUV — insured, with 24/7 support.', selfDrive: 58, deposit: 300, status: 'APPROVED', isActive: false },
];

// ---------------------------------------------------------------- helpers
async function demoUserIds() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PHONE_PREFIX } }, select: { id: true } });
  return users.map((u) => u.id);
}

async function resetDemo() {
  const ids = await demoUserIds();
  if (!ids.length) return;
  const listings = await prisma.rentalListing.findMany({ where: { ownerId: { in: ids } }, select: { id: true } });
  const listingIds = listings.map((l) => l.id);
  const rides = await prisma.ride.findMany({ where: { OR: [{ passengerId: { in: ids } }, { driverId: { in: ids } }] }, select: { id: true } });
  const rideIds = rides.map((r) => r.id);
  const bookings = await prisma.rentalBooking.findMany({
    where: { OR: [{ renterId: { in: ids } }, { listingId: { in: listingIds } }] },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);
  // Platform cars are owned by the admin; demo ones are tagged by their description.
  const platformListings = await prisma.rentalListing.findMany({ where: { description: { startsWith: 'Cedra ' } }, select: { id: true } });
  const platformBookings = await prisma.rentalBooking.findMany({
    where: { listingId: { in: platformListings.map((l) => l.id) } },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.ledgerEntry.deleteMany({
      where: { OR: [{ userId: { in: ids } }, { rideId: { in: rideIds } }, { bookingId: { in: [...bookingIds, ...platformBookings.map((b) => b.id)] } }] },
    }),
    prisma.rentalBooking.deleteMany({ where: { id: { in: [...bookingIds, ...platformBookings.map((b) => b.id)] } } }),
    prisma.rentalListing.deleteMany({ where: { id: { in: [...listingIds, ...platformListings.map((l) => l.id)] } } }),
    prisma.ride.deleteMany({ where: { id: { in: rideIds } } }),
    prisma.subscription.deleteMany({ where: { userId: { in: ids } } }),
    prisma.user.deleteMany({ where: { id: { in: ids } } }),
  ]);
  for (const f of fs.existsSync(uploadRoot) ? fs.readdirSync(uploadRoot) : []) {
    if (f.startsWith('demo-')) fs.rmSync(path.join(uploadRoot, f));
  }
  console.log(`Removed demo data (${ids.length} users).`);
}

async function main() {
  if (process.argv.includes('--reset')) await resetDemo();
  else if ((await demoUserIds()).length) {
    console.log('Demo data is already there. Run `npm run seed:demo -- --reset` to recreate it.');
    return;
  }

  const [places, vehicleTypes, routeFares, settingRows, admin] = await Promise.all([
    prisma.place.findMany(),
    prisma.vehicleType.findMany(),
    prisma.routeFare.findMany(),
    prisma.setting.findMany(),
    prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { id: 'asc' } }),
  ]);
  if (!admin || !places.length || !vehicleTypes.length) throw new Error('Run `npm run seed` first.');
  const settings = { ...DEFAULT_SETTINGS } as Record<string, number | string>;
  for (const r of settingRows) settings[r.key] = typeof settings[r.key] === 'number' ? Number(r.value) : r.value;
  const commissionPct = Number(settings.commissionPercent);
  const rentalCommissionPct = Number(settings.rentalCommissionPercent);
  const lbpRate = Number(settings.lbpRate);
  const roundingStep = Number(settings.fareRoundingUsd);

  const placeBy = (nameEn: string): Place => {
    const p = places.find((x) => x.nameEn === nameEn);
    if (!p) throw new Error(`Place ${nameEn} not found — run \`npm run seed\` first.`);
    return p;
  };
  const vehicleBy = (code: string) => {
    const v = vehicleTypes.find((x) => x.code === code);
    if (!v) throw new Error(`Vehicle type ${code} not found — run \`npm run seed\` first.`);
    return v;
  };
  const fares = routeFares.map((f) => ({ ...f, priceUsd: Number(f.priceUsd) }));

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const createUser = (p: PersonSeed, extra: Partial<Prisma.UserCreateInput> = {}) =>
    prisma.user.create({
      data: {
        name: p.name,
        phone: phoneOf(p.n),
        email: p.email,
        passwordHash,
        gender: p.gender,
        language: p.language,
        phoneVerified: true,
        status: p.blocked ? 'BLOCKED' : 'ACTIVE',
        createdAt: daysAgo(p.joinedDaysAgo, 10),
        ...extra,
      },
    });

  // ---- passengers
  const passengers = [];
  for (const p of PASSENGERS) passengers.push(await createUser(p));
  const activePassengers = passengers.filter((p) => p.status === 'ACTIVE');

  // ---- drivers
  const drivers: { user: { id: number }; seed: DriverSeed }[] = [];
  for (const d of DRIVERS) {
    const near = placeBy(d.at);
    const user = await createUser(d, {
      driverProfile: {
        create: {
          vehicle: { connect: { code: vehicleBy(d.vehicleType).code } },
          vehicleMake: d.make,
          vehicleModel: d.model,
          vehicleColor: d.color,
          plateNumber: d.plate,
          licenseNumber: `DL-${100000 + d.n * 7919}`,
          status: d.status,
          rejectionReason: d.rejectionReason,
          billingPlan: d.plan,
          isOnline: !!d.online && d.status === 'APPROVED',
          lat: d.status === 'APPROVED' ? near.lat + jitter(1) : null,
          lng: d.status === 'APPROVED' ? near.lng + jitter(1) : null,
          lastLocationAt: d.status === 'APPROVED' ? new Date(now.getTime() - (d.online ? intBetween(1, 5) : intBetween(60, 600)) * MIN) : null,
          createdAt: daysAgo(d.joinedDaysAgo, 10),
        },
      },
    });
    const docTypes: DocumentType[] = ['ID_CARD', 'DRIVER_LICENSE', 'CAR_REGISTRATION', 'INSURANCE', 'VEHICLE_PHOTO'];
    await prisma.document.createMany({
      data: docTypes.map((type) => ({
        userId: user.id,
        type,
        url: type === 'VEHICLE_PHOTO' ? carPhoto(`driver${d.n}`, d.color, 0) : docImage(`driver${d.n}`, type),
        createdAt: daysAgo(d.joinedDaysAgo, 11),
      })),
    });
    drivers.push({ user, seed: d });
  }
  const workingDrivers = drivers.filter((d) => d.seed.status === 'APPROVED' || d.seed.status === 'SUSPENDED');

  // ---- monthly subscriptions (one expired driver to show "subscription required")
  for (const d of drivers.filter((x) => x.seed.plan === 'MONTHLY' && x.seed.status === 'APPROVED')) {
    const fee = Number(vehicleBy(d.seed.vehicleType).monthlyFeeUsd);
    const expired = d.seed.n === 27;
    const periods: [number, number][] = expired ? [[-50, -20]] : [[-45, -15], [-15, 15]];
    for (const [s, e] of periods) {
      const periodStart = new Date(now.getTime() + s * DAY);
      const periodEnd = new Date(now.getTime() + e * DAY);
      await prisma.subscription.create({ data: { userId: d.user.id, periodStart, periodEnd, createdAt: periodStart } });
      if (fee > 0) {
        await prisma.ledgerEntry.create({
          data: {
            userId: d.user.id,
            type: 'SUBSCRIPTION_FEE',
            amountUsd: fee,
            description: `Monthly subscription × 1 (until ${periodEnd.toISOString().slice(0, 10)})`,
            createdById: admin.id,
            createdAt: periodStart,
          },
        });
        await prisma.ledgerEntry.create({
          data: {
            userId: d.user.id,
            type: 'PAYMENT',
            amountUsd: -fee,
            method: pick(['CASH', 'WHISH', 'OMT'] as const),
            description: 'Payment received (subscription)',
            createdById: admin.id,
            createdAt: new Date(periodStart.getTime() + 2 * 3600_000),
          },
        });
      }
    }
  }

  // ---- rides over the last 30 days
  const ROUTE_POOL: [string, string, number][] = [
    // from, to, weight
    ['Minieh', 'Tripoli', 6], ['Minieh', 'Deir Ammar', 4], ['Minieh', 'Bhannine', 3], ['Minieh', 'Beddawi', 3],
    ['Tripoli', 'Minieh', 5], ['Beddawi', 'Tripoli', 3], ['Minieh', 'El Mina', 2], ['Tripoli', 'El Mina', 2],
    ['Minieh', 'Minieh', 4], ['Minieh', 'Zgharta', 1], ['Minieh', 'Halba', 1], ['Minieh', 'Beirut', 1],
  ];
  const weighted = ROUTE_POOL.flatMap(([a, b, w]) => Array.from({ length: w }, () => [a, b] as const));
  const STREETS = ['Main road', 'Near the mosque', 'Municipality square', 'Next to the pharmacy', 'School street', 'Seaside road', 'Market', 'Gas station'];
  const ratingsByDriver = new Map<number, number[]>();
  const owed = new Map<number, number>();
  let rideCount = 0;

  for (let i = 0; i < 140; i++) {
    const [fromName, toName] = pick(weighted);
    const from = placeBy(fromName);
    const to = placeBy(toName);
    const pickup = { lat: from.lat + jitter(from.radiusKm * 0.6), lng: from.lng + jitter(from.radiusKm * 0.6) };
    const dropoff = { lat: to.lat + jitter(to.radiusKm * 0.6), lng: to.lng + jitter(to.radiusKm * 0.6) };
    const distanceKm = Math.max(0.8, round2(haversineKm(pickup, dropoff) * 1.3));
    const durationMin = round2(distanceKm * 2.2 + 3);
    // Long trips are taxi/van only.
    const eligible = workingDrivers.filter((d) =>
      distanceKm > 25 ? ['TAXI', 'VAN_7'].includes(d.seed.vehicleType) : true,
    );
    const driver = pick(eligible);
    const v = vehicleBy(driver.seed.vehicleType);
    const fromPlace = matchPlace(pickup, places);
    const toPlace = matchPlace(dropoff, places);
    const fixed =
      v.mode === 'FIXED_ROUTE' && fromPlace && toPlace ? findRouteFare(fromPlace.id, toPlace.id, v.code, fares) : null;
    const fareUsd = fixed ? fixed.priceUsd : calculatedFare(ratesOf(v), distanceKm, durationMin, roundingStep);
    const passenger = pick(activePassengers);
    const day = Math.pow(rand(), 1.4) * 30; // more rides recently
    const requestedAt = new Date(now.getTime() - day * DAY - intBetween(1, 600) * MIN);
    if (requestedAt.getTime() > now.getTime() - 30 * MIN) continue;

    const roll = rand();
    const status = driver.seed.status === 'SUSPENDED' && day < 10 ? 'CANCELLED' : roll < 0.8 ? 'COMPLETED' : roll < 0.92 ? 'CANCELLED' : 'EXPIRED';
    const base: Prisma.RideUncheckedCreateInput = {
      passengerId: passenger.id,
      vehicleType: v.code,
      driverGender: passenger.gender === 'FEMALE' && rand() < 0.3 ? 'FEMALE' : null,
      pricingMode: fixed ? 'FIXED_ROUTE' : 'CALCULATED',
      status,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      pickupAddress: `${pick(STREETS)}, ${from.nameEn}`,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      dropoffAddress: `${pick(STREETS)}, ${to.nameEn}`,
      distanceKm,
      durationMin,
      fareUsd,
      lbpRate,
      note: rand() < 0.15 ? pick(['I have a small bag', 'Please call when you arrive', 'Two kids with me', 'In front of the bakery']) : null,
      requestedAt,
    };
    if (base.driverGender === 'FEMALE' && driver.seed.gender !== 'FEMALE') base.driverGender = null;

    if (status === 'EXPIRED') {
      await prisma.ride.create({ data: { ...base, cancelledAt: new Date(requestedAt.getTime() + 60_000), cancelledBy: 'SYSTEM', cancelReason: 'No driver accepted' } });
      rideCount++;
      continue;
    }
    const acceptedAt = new Date(requestedAt.getTime() + intBetween(10, 50) * 1000);
    if (status === 'CANCELLED') {
      const by = pick(['PASSENGER', 'PASSENGER', 'DRIVER'] as const);
      await prisma.ride.create({
        data: {
          ...base,
          driverId: driver.user.id,
          acceptedAt,
          cancelledAt: new Date(acceptedAt.getTime() + intBetween(1, 6) * MIN),
          cancelledBy: by,
          cancelReason: by === 'PASSENGER' ? pick(['Changed my plans', 'Driver too far', 'Found another ride']) : pick(['Car problem', 'Passenger not at pickup']),
        },
      });
      rideCount++;
      continue;
    }
    const arrivedAt = new Date(acceptedAt.getTime() + intBetween(2, 8) * MIN);
    const startedAt = new Date(arrivedAt.getTime() + intBetween(1, 3) * MIN);
    const completedAt = new Date(startedAt.getTime() + durationMin * MIN);
    const commissionUsd = driver.seed.plan === 'COMMISSION' ? round2((fareUsd * commissionPct) / 100) : 0;
    const ratingByPassenger = rand() < 0.75 ? (rand() < 0.7 ? 5 : rand() < 0.8 ? 4 : intBetween(2, 3)) : null;
    const ride = await prisma.ride.create({
      data: {
        ...base,
        driverId: driver.user.id,
        acceptedAt,
        arrivedAt,
        startedAt,
        completedAt,
        commissionUsd,
        ratingByPassenger,
        ratingByDriver: rand() < 0.6 ? pick([4, 5, 5, 5]) : null,
      },
    });
    rideCount++;
    if (ratingByPassenger) ratingsByDriver.set(driver.user.id, [...(ratingsByDriver.get(driver.user.id) ?? []), ratingByPassenger]);
    if (commissionUsd > 0) {
      await prisma.ledgerEntry.create({
        data: {
          userId: driver.user.id,
          type: 'RIDE_COMMISSION',
          amountUsd: commissionUsd,
          description: `Commission ${commissionPct}% on ride #${ride.id}`,
          rideId: ride.id,
          createdAt: completedAt,
        },
      });
      owed.set(driver.user.id, round2((owed.get(driver.user.id) ?? 0) + commissionUsd));
    }
  }

  // Commission drivers settle up weekly; leave a realistic open balance.
  for (const d of workingDrivers.filter((x) => x.seed.plan === 'COMMISSION')) {
    const total = owed.get(d.user.id) ?? 0;
    if (d.seed.owesUsd) {
      // Over the debt limit (blocked from going online): make the balance land exactly on owesUsd.
      const diff = round2(total - d.seed.owesUsd);
      await prisma.ledgerEntry.create({
        data:
          diff > 0
            ? { userId: d.user.id, type: 'PAYMENT', amountUsd: -diff, method: 'CASH', description: 'Payment received (CASH)', createdById: admin.id, createdAt: daysAgo(21, 15) }
            : { userId: d.user.id, type: 'ADJUSTMENT', amountUsd: -diff, description: 'Adjustment — unpaid commission from cash trips', createdById: admin.id, createdAt: daysAgo(3, 18) },
      });
      continue;
    }
    const paid = round2(total * between(0.6, 0.85));
    if (paid > 0) {
      for (const [share, ago] of [[0.5, 16], [0.5, 6]] as const) {
        await prisma.ledgerEntry.create({
          data: {
            userId: d.user.id,
            type: 'PAYMENT',
            amountUsd: -round2(paid * share),
            method: pick(['CASH', 'WHISH', 'OMT'] as const),
            description: `Payment received (weekly settlement)`,
            createdById: admin.id,
            createdAt: daysAgo(ago, 17),
          },
        });
      }
    }
  }

  for (const [driverId, ratings] of ratingsByDriver) {
    await prisma.user.update({
      where: { id: driverId },
      data: { ratingAvg: round2(ratings.reduce((a, b) => a + b, 0) / ratings.length), ratingCount: ratings.length },
    });
  }

  // ---- car owners and listings
  const owners = new Map<number, { id: number; type: OwnerType }>();
  for (const o of OWNERS) {
    const user = await createUser(o, {
      ownerProfile: { create: { type: o.type, businessName: o.businessName, status: o.status, rejectionReason: o.rejectionReason, createdAt: daysAgo(o.joinedDaysAgo, 10) } },
    });
    const docTypes: DocumentType[] = o.type === 'AGENCY' ? ['ID_CARD', 'BUSINESS_LICENSE'] : ['ID_CARD'];
    await prisma.document.createMany({
      data: docTypes.map((type) => ({ userId: user.id, type, url: docImage(`owner${o.n}`, type), createdAt: daysAgo(o.joinedDaysAgo, 11) })),
    });
    owners.set(o.n, { id: user.id, type: o.type });
  }
  // Passengers who rent self-drive need a driving licence on file.
  const renters = activePassengers.slice(0, 6);
  for (const r of renters) {
    await prisma.document.create({ data: { userId: r.id, type: 'DRIVER_LICENSE', url: docImage(`renter${r.id}`, 'DRIVER_LICENSE') } });
  }

  const listings: { id: number; seed: ListingSeed; ownerId: number; ownerType: OwnerType }[] = [];
  for (const l of LISTINGS) {
    const owner = l.owner === 'PLATFORM' ? { id: admin.id, type: 'PLATFORM' as OwnerType } : owners.get(l.owner)!;
    const listing = await prisma.rentalListing.create({
      data: {
        ownerId: owner.id,
        make: l.make,
        model: l.model,
        year: l.year,
        seats: l.seats,
        transmission: l.transmission,
        fuelType: l.fuelType,
        color: l.color,
        placeId: placeBy(l.place).id,
        description: l.description,
        selfDrive: l.selfDrive !== undefined,
        pricePerDayUsd: l.selfDrive ?? null,
        withDriver: l.withDriver !== undefined,
        withDriverPricePerDayUsd: l.withDriver ?? null,
        depositUsd: l.deposit,
        minDays: l.minDays ?? 1,
        status: l.status,
        rejectionReason: l.rejectionReason,
        isActive: l.isActive ?? true,
        createdAt: daysAgo(intBetween(8, 45), 14),
        photos: { create: [0, 1].map((v) => ({ url: carPhoto(l.key, l.color, v) })) },
      },
    });
    listings.push({ id: listing.id, seed: l, ownerId: owner.id, ownerType: owner.type });
  }

  // ---- bookings: [listing key, renter index, start offset days, days, mode, status]
  const BOOKINGS: [string, number, number, number, RentalMode, BookingStatus, string?][] = [
    ['rio', 0, -40, 3, 'SELF_DRIVE', 'COMPLETED'],
    ['tucson', 1, -33, 4, 'WITH_DRIVER', 'COMPLETED'],
    ['yaris', 2, -28, 2, 'SELF_DRIVE', 'COMPLETED'],
    ['camry', 3, -21, 5, 'SELF_DRIVE', 'COMPLETED'],
    ['hiace', 4, -14, 1, 'WITH_DRIVER', 'COMPLETED'],
    ['corolla-p', 5, -12, 3, 'SELF_DRIVE', 'COMPLETED'],
    ['picanto', 0, -9, 4, 'SELF_DRIVE', 'COMPLETED'],
    ['rio', 1, -18, 2, 'SELF_DRIVE', 'CANCELLED'],
    ['yaris', 3, -6, 3, 'SELF_DRIVE', 'REJECTED', 'Car is in the garage that week, sorry.'],
    ['camry', 2, -1, 4, 'WITH_DRIVER', 'ACTIVE'],
    ['corolla-p', 4, -2, 5, 'SELF_DRIVE', 'ACTIVE'],
    ['tucson', 0, 3, 3, 'SELF_DRIVE', 'CONFIRMED'],
    ['hiace', 5, 6, 1, 'WITH_DRIVER', 'CONFIRMED'],
    ['rio', 3, 5, 2, 'SELF_DRIVE', 'PENDING'],
    ['yaris', 1, 9, 7, 'SELF_DRIVE', 'PENDING'],
    ['picanto', 2, 12, 3, 'SELF_DRIVE', 'PENDING'],
  ];
  const ownerCommission = new Map<number, number>();
  for (const [key, renterIdx, startOffset, days, mode, status, rejectionReason] of BOOKINGS) {
    const l = listings.find((x) => x.seed.key === key)!;
    const pricePerDayUsd = mode === 'SELF_DRIVE' ? l.seed.selfDrive! : l.seed.withDriver!;
    const totalUsd = round2(pricePerDayUsd * days);
    const commissionUsd = status === 'COMPLETED' && l.ownerType !== 'PLATFORM' ? round2((totalUsd * rentalCommissionPct) / 100) : 0;
    const startDate = dateOnly(startOffset);
    const createdAt = new Date(startDate.getTime() - intBetween(2, 6) * DAY);
    const booking = await prisma.rentalBooking.create({
      data: {
        listingId: l.id,
        renterId: renters[renterIdx].id,
        startDate,
        endDate: dateOnly(startOffset + days),
        days,
        mode,
        pricePerDayUsd,
        totalUsd,
        depositUsd: mode === 'SELF_DRIVE' ? l.seed.deposit : 0,
        commissionUsd,
        lbpRate,
        status,
        note: rand() < 0.3 ? 'I will pick up the car in the morning.' : null,
        rejectionReason: rejectionReason ?? null,
        createdAt,
      },
    });
    if (commissionUsd > 0) {
      await prisma.ledgerEntry.create({
        data: {
          userId: l.ownerId,
          type: 'RENTAL_COMMISSION',
          amountUsd: commissionUsd,
          description: `Commission ${rentalCommissionPct}% on rental #${booking.id}`,
          bookingId: booking.id,
          createdAt: dateOnly(startOffset + days),
        },
      });
      ownerCommission.set(l.ownerId, round2((ownerCommission.get(l.ownerId) ?? 0) + commissionUsd));
    }
  }
  // The agency has paid its rental commission so far; the individual owner still owes.
  const agency = owners.get(42)!;
  const agencyOwed = ownerCommission.get(agency.id) ?? 0;
  if (agencyOwed > 0) {
    await prisma.ledgerEntry.create({
      data: { userId: agency.id, type: 'PAYMENT', amountUsd: -agencyOwed, method: 'WHISH', description: 'Payment received (WHISH)', createdById: admin.id, createdAt: daysAgo(4, 13) },
    });
  }

  console.log(
    [
      `Demo data added: ${passengers.length} passengers, ${drivers.length} drivers, ${owners.size} car owners,`,
      `${listings.length} rental listings, ${BOOKINGS.length} bookings and ${rideCount} rides.`,
      `Every demo account uses password "${DEMO_PASSWORD}". Try:`,
      `  passenger  ${phoneOf(1)}  (${PASSENGERS[0].name})`,
      `  driver     ${phoneOf(21)}  (${DRIVERS[0].name}, Taxi, online in Minieh)`,
      `  owner      ${phoneOf(41)}  (${OWNERS[0].name})`,
    ].join('\n'),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
