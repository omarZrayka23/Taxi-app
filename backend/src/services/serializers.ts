import { Prisma } from '@prisma/client';
import type {
  Document,
  DriverProfile,
  LedgerEntry,
  OwnerProfile,
  Place,
  Subscription,
  User,
} from '@prisma/client';
import { formatDateOnly } from '../lib/dates.js';
import { num, numOrNull, toLbp } from '../lib/money.js';

// ---------- include shapes (keep queries and serializers in sync) ----------

export const userInclude = { driverProfile: true, ownerProfile: true } satisfies Prisma.UserInclude;
export type UserFull = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export const rideInclude = {
  passenger: true,
  driver: { include: { driverProfile: true } },
} satisfies Prisma.RideInclude;
export type RideFull = Prisma.RideGetPayload<{ include: typeof rideInclude }>;

export const listingInclude = {
  owner: { include: { ownerProfile: true } },
  place: true,
  photos: { orderBy: { id: 'asc' } },
} satisfies Prisma.RentalListingInclude;
export type ListingFull = Prisma.RentalListingGetPayload<{ include: typeof listingInclude }>;

export const bookingInclude = {
  listing: { include: { owner: { include: { ownerProfile: true } }, photos: { orderBy: { id: 'asc' }, take: 1 } } },
  renter: true,
} satisfies Prisma.RentalBookingInclude;
export type BookingFull = Prisma.RentalBookingGetPayload<{ include: typeof bookingInclude }>;

// ---------- serializers ----------

export const serializeDriverProfile = (d: DriverProfile, ratingAvg = 0, ratingCount = 0) => ({
  id: d.id,
  userId: d.userId,
  vehicleType: d.vehicleType,
  vehicleMake: d.vehicleMake,
  vehicleModel: d.vehicleModel,
  vehicleColor: d.vehicleColor,
  plateNumber: d.plateNumber,
  licenseNumber: d.licenseNumber,
  status: d.status,
  rejectionReason: d.rejectionReason,
  billingPlan: d.billingPlan,
  isOnline: d.isOnline,
  lat: d.lat,
  lng: d.lng,
  ratingAvg,
  ratingCount,
  createdAt: d.createdAt,
});

export const serializeOwnerProfile = (o: OwnerProfile) => ({
  id: o.id,
  userId: o.userId,
  type: o.type,
  businessName: o.businessName,
  status: o.status,
  rejectionReason: o.rejectionReason,
  createdAt: o.createdAt,
});

export const serializeUser = (u: UserFull) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  email: u.email,
  role: u.role,
  gender: u.gender,
  language: u.language,
  phoneVerified: u.phoneVerified,
  status: u.status,
  createdAt: u.createdAt,
  driverProfile: u.driverProfile ? serializeDriverProfile(u.driverProfile, u.ratingAvg, u.ratingCount) : null,
  ownerProfile: u.ownerProfile ? serializeOwnerProfile(u.ownerProfile) : null,
});

export const userSummary = (u: Pick<User, 'id' | 'name' | 'phone'>) => ({ id: u.id, name: u.name, phone: u.phone });

export const serializeDocument = (d: Document) => ({ id: d.id, userId: d.userId, type: d.type, url: d.url, createdAt: d.createdAt });

export const serializePlace = (p: Place) => ({
  id: p.id,
  nameEn: p.nameEn,
  nameAr: p.nameAr,
  lat: p.lat,
  lng: p.lng,
  radiusKm: p.radiusKm,
  active: p.active,
});

export const serializeRide = (r: RideFull) => {
  const fareUsd = num(r.fareUsd);
  const dp = r.driver?.driverProfile;
  return {
    id: r.id,
    status: r.status,
    vehicleType: r.vehicleType,
    driverGender: r.driverGender,
    pricingMode: r.pricingMode,
    pickupLat: r.pickupLat,
    pickupLng: r.pickupLng,
    pickupAddress: r.pickupAddress,
    dropoffLat: r.dropoffLat,
    dropoffLng: r.dropoffLng,
    dropoffAddress: r.dropoffAddress,
    distanceKm: r.distanceKm,
    durationMin: r.durationMin,
    fareUsd,
    fareLbp: toLbp(fareUsd, r.lbpRate),
    note: r.note,
    passenger: userSummary(r.passenger),
    driver:
      r.driver && dp
        ? {
            id: r.driver.id,
            name: r.driver.name,
            phone: r.driver.phone,
            vehicleType: dp.vehicleType,
            vehicleMake: dp.vehicleMake,
            vehicleModel: dp.vehicleModel,
            vehicleColor: dp.vehicleColor,
            plateNumber: dp.plateNumber,
            ratingAvg: r.driver.ratingAvg,
            lat: dp.lat,
            lng: dp.lng,
          }
        : null,
    requestedAt: r.requestedAt,
    acceptedAt: r.acceptedAt,
    arrivedAt: r.arrivedAt,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    cancelledAt: r.cancelledAt,
    cancelledBy: r.cancelledBy,
    cancelReason: r.cancelReason,
    ratingByPassenger: r.ratingByPassenger,
    ratingByDriver: r.ratingByDriver,
    commissionUsd: num(r.commissionUsd),
  };
};

export const serializeListing = (l: ListingFull) => ({
  id: l.id,
  owner: {
    id: l.owner.id,
    name: l.owner.name,
    phone: l.owner.phone,
    type: l.owner.ownerProfile?.type ?? 'INDIVIDUAL',
    businessName: l.owner.ownerProfile?.businessName ?? null,
  },
  make: l.make,
  model: l.model,
  year: l.year,
  seats: l.seats,
  transmission: l.transmission,
  fuelType: l.fuelType,
  color: l.color,
  place: { id: l.place.id, nameEn: l.place.nameEn, nameAr: l.place.nameAr },
  description: l.description,
  selfDrive: l.selfDrive,
  pricePerDayUsd: numOrNull(l.pricePerDayUsd),
  withDriver: l.withDriver,
  withDriverPricePerDayUsd: numOrNull(l.withDriverPricePerDayUsd),
  depositUsd: num(l.depositUsd),
  minDays: l.minDays,
  photos: l.photos.map((p) => ({ id: p.id, url: p.url })),
  status: l.status,
  rejectionReason: l.rejectionReason,
  isActive: l.isActive,
  createdAt: l.createdAt,
});

export const serializeBooking = (b: BookingFull) => {
  const totalUsd = num(b.totalUsd);
  const owner = b.listing.owner;
  return {
    id: b.id,
    listing: {
      id: b.listing.id,
      make: b.listing.make,
      model: b.listing.model,
      year: b.listing.year,
      photoUrl: b.listing.photos[0]?.url ?? null,
    },
    renter: userSummary(b.renter),
    owner: { ...userSummary(owner), businessName: owner.ownerProfile?.businessName ?? null },
    startDate: formatDateOnly(b.startDate),
    endDate: formatDateOnly(b.endDate),
    days: b.days,
    mode: b.mode,
    pricePerDayUsd: num(b.pricePerDayUsd),
    totalUsd,
    totalLbp: toLbp(totalUsd, b.lbpRate),
    depositUsd: num(b.depositUsd),
    commissionUsd: num(b.commissionUsd),
    status: b.status,
    note: b.note,
    rejectionReason: b.rejectionReason,
    createdAt: b.createdAt,
  };
};

export const serializeLedgerEntry = (e: LedgerEntry) => ({
  id: e.id,
  userId: e.userId,
  type: e.type,
  amountUsd: num(e.amountUsd),
  description: e.description,
  method: e.method,
  rideId: e.rideId,
  bookingId: e.bookingId,
  createdAt: e.createdAt,
});

export const serializeSubscription = (s: Subscription | null) =>
  s
    ? { id: s.id, userId: s.userId, periodStart: s.periodStart, periodEnd: s.periodEnd, active: s.periodEnd > new Date() }
    : null;
