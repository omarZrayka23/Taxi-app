import type { CancelledBy, DriverProfile, Prisma, RideStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { conflict, notFound } from '../lib/errors.js';
import { haversineKm, type LatLng } from '../lib/geo.js';
import { round2 } from '../lib/money.js';
import { addLedgerEntry } from './billing.js';
import { sendPush } from './push.js';
import { emitToUser, emitToUsers, setDriverLocationHandler } from './realtime.js';
import { rideInclude, serializeRide, type RideFull } from './serializers.js';
import { getSettings } from './settings.js';

export const ACTIVE_RIDE_STATUSES: RideStatus[] = ['REQUESTED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];
export const DRIVER_BUSY_STATUSES: RideStatus[] = ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];
const MAX_OFFERS = 10;
const LOCATION_FRESH_MS = 2 * 60_000;

export async function loadRide(id: number): Promise<RideFull> {
  const ride = await prisma.ride.findUnique({ where: { id }, include: rideInclude });
  if (!ride) throw notFound('Ride');
  return ride;
}

/** Broadcast the current ride state to its passenger and driver. */
export function publishRide(ride: RideFull) {
  const payload = { ride: serializeRide(ride) };
  emitToUser(ride.passengerId, 'ride:update', payload);
  emitToUser(ride.driverId, 'ride:update', payload);
}

/** Tell drivers who received an offer that it's gone, and drop the offer rows. */
export async function closeOffers(rideId: number, exceptDriverId?: number) {
  const offers = await prisma.rideOffer.findMany({ where: { rideId } });
  await prisma.rideOffer.deleteMany({ where: { rideId } });
  emitToUsers(
    offers.map((o) => o.driverId).filter((id) => id !== exceptDriverId),
    'ride:offer:closed',
    { rideId },
  );
}

/** Online, approved, fresh-location, idle drivers of a vehicle type, nearest first. */
async function findAvailableDrivers(point: LatLng, vehicleType: DriverProfile['vehicleType'], radiusKm: number) {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((point.lat * Math.PI) / 180));
  const candidates = await prisma.driverProfile.findMany({
    where: {
      status: 'APPROVED',
      isOnline: true,
      vehicleType,
      lastLocationAt: { gte: new Date(Date.now() - LOCATION_FRESH_MS) },
      lat: { gte: point.lat - latDelta, lte: point.lat + latDelta },
      lng: { gte: point.lng - lngDelta, lte: point.lng + lngDelta },
      user: { status: 'ACTIVE', ridesAsDriver: { none: { status: { in: DRIVER_BUSY_STATUSES } } } },
    },
  });
  return candidates
    .map((d) => ({ driver: d, distance: haversineKm(point, { lat: d.lat!, lng: d.lng! }) }))
    .filter((c) => c.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .map((c) => c.driver);
}

function offerExpiry(ride: { requestedAt: Date }, timeoutSec: number) {
  return new Date(ride.requestedAt.getTime() + timeoutSec * 1000);
}

/** Offer a freshly requested ride to the nearest available drivers. */
export async function dispatchRide(ride: RideFull) {
  const settings = await getSettings();
  const drivers = await findAvailableDrivers(
    { lat: ride.pickupLat, lng: ride.pickupLng },
    ride.vehicleType,
    settings.searchRadiusKm,
  );
  const chosen = drivers.slice(0, MAX_OFFERS);
  if (chosen.length === 0) return;
  await prisma.rideOffer.createMany({
    data: chosen.map((d) => ({ rideId: ride.id, driverId: d.userId })),
    skipDuplicates: true,
  });
  const payload = { ride: serializeRide(ride), expiresAt: offerExpiry(ride, settings.offerTimeoutSec) };
  emitToUsers(chosen.map((d) => d.userId), 'ride:offer', payload);
  for (const d of chosen) sendPush(d.userId, 'New ride request', `${ride.pickupAddress} → ${ride.dropoffAddress}`, { rideId: ride.id });
}

/** When a driver comes online, offer them any open nearby rides they haven't seen. */
export async function offerOpenRidesToDriver(profile: DriverProfile) {
  if (profile.lat === null || profile.lng === null) return;
  const settings = await getSettings();
  const since = new Date(Date.now() - settings.offerTimeoutSec * 1000);
  const open = await prisma.ride.findMany({
    where: {
      status: 'REQUESTED',
      vehicleType: profile.vehicleType,
      requestedAt: { gte: since },
      offers: { none: { driverId: profile.userId } },
    },
    include: rideInclude,
  });
  const near = open.filter(
    (r) => haversineKm({ lat: r.pickupLat, lng: r.pickupLng }, { lat: profile.lat!, lng: profile.lng! }) <= settings.searchRadiusKm,
  );
  for (const ride of near) {
    await prisma.rideOffer.create({ data: { rideId: ride.id, driverId: profile.userId } });
    emitToUser(profile.userId, 'ride:offer', {
      ride: serializeRide(ride),
      expiresAt: offerExpiry(ride, settings.offerTimeoutSec),
    });
  }
}

/** Expire REQUESTED rides nobody accepted in time. Safe to run repeatedly. */
export async function expireStaleRides() {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.offerTimeoutSec * 1000);
  const stale = await prisma.ride.findMany({ where: { status: 'REQUESTED', requestedAt: { lt: cutoff } }, select: { id: true } });
  for (const { id } of stale) {
    const { count } = await prisma.ride.updateMany({
      where: { id, status: 'REQUESTED' },
      data: { status: 'EXPIRED', cancelledAt: new Date(), cancelledBy: 'SYSTEM', cancelReason: 'No driver accepted in time' },
    });
    if (count === 0) continue;
    await closeOffers(id);
    const ride = await loadRide(id);
    publishRide(ride);
    sendPush(ride.passengerId, 'No drivers available', 'Please try again in a moment.', { rideId: id });
  }
}

/**
 * Atomically move a ride from one of `from` statuses to `to`. Throws 409 when the ride is no longer
 * in an allowed state (e.g. another driver accepted first).
 */
export async function transitionRide(
  id: number,
  where: Prisma.RideWhereInput & { status: { in: RideStatus[] } },
  data: Prisma.RideUncheckedUpdateManyInput,
  errorCode = 'INVALID_RIDE_STATE',
): Promise<RideFull> {
  const { count } = await prisma.ride.updateMany({ where: { ...where, id }, data });
  if (count === 0) {
    const exists = await prisma.ride.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound('Ride');
    throw conflict(errorCode, 'This ride can no longer be updated this way');
  }
  const ride = await loadRide(id);
  publishRide(ride);
  return ride;
}

export async function cancelRide(id: number, by: CancelledBy, allowed: RideStatus[], reason?: string, extraWhere: Prisma.RideWhereInput = {}) {
  const ride = await transitionRide(
    id,
    { ...extraWhere, status: { in: allowed } },
    { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: by, cancelReason: reason ?? null },
  );
  await closeOffers(id);
  const notify = by === 'PASSENGER' ? ride.driverId : by === 'DRIVER' ? ride.passengerId : null;
  sendPush(notify, 'Ride cancelled', reason ?? 'The ride was cancelled.', { rideId: id });
  if (by === 'ADMIN') {
    sendPush(ride.passengerId, 'Ride cancelled', reason ?? 'The ride was cancelled by support.', { rideId: id });
    sendPush(ride.driverId, 'Ride cancelled', reason ?? 'The ride was cancelled by support.', { rideId: id });
  }
  return ride;
}

/** Complete a ride and charge commission to drivers on the COMMISSION plan. */
export async function completeRide(id: number, driverId: number): Promise<RideFull> {
  const settings = await getSettings();
  await prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findUnique({ where: { id } });
    if (!ride) throw notFound('Ride');
    if (ride.driverId !== driverId || ride.status !== 'IN_PROGRESS') {
      throw conflict('INVALID_RIDE_STATE', 'Only a ride in progress can be completed');
    }
    const profile = await tx.driverProfile.findUnique({ where: { userId: driverId } });
    const commission =
      profile?.billingPlan === 'COMMISSION' ? round2((Number(ride.fareUsd) * settings.commissionPercent) / 100) : 0;
    const { count } = await tx.ride.updateMany({
      where: { id, status: 'IN_PROGRESS' },
      data: { status: 'COMPLETED', completedAt: new Date(), commissionUsd: commission },
    });
    if (count === 0) throw conflict('INVALID_RIDE_STATE', 'Ride already completed');
    if (commission > 0) {
      await addLedgerEntry(tx, {
        userId: driverId,
        type: 'RIDE_COMMISSION',
        amountUsd: commission,
        description: `Commission ${settings.commissionPercent}% on ride #${id}`,
        rideId: id,
      });
    }
  });
  const ride = await loadRide(id);
  publishRide(ride);
  sendPush(ride.passengerId, 'You have arrived', `Please pay $${Number(ride.fareUsd).toFixed(2)} cash to the driver.`, { rideId: id });
  return ride;
}

/** Persist a driver's position and forward it to the passenger of their active ride. */
export async function updateDriverLocation(userId: number, lat: number, lng: number) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!profile || profile.status !== 'APPROVED') return;
  await prisma.driverProfile.update({ where: { userId }, data: { lat, lng, lastLocationAt: new Date() } });
  const active = await prisma.ride.findFirst({
    where: { driverId: userId, status: { in: DRIVER_BUSY_STATUSES } },
    select: { id: true, passengerId: true },
  });
  if (active) emitToUser(active.passengerId, 'driver:location', { rideId: active.id, lat, lng });
}

setDriverLocationHandler(updateDriverLocation);

let sweeper: NodeJS.Timeout | null = null;
export function startRideSweeper(intervalMs = 10_000) {
  if (sweeper) return;
  sweeper = setInterval(() => {
    expireStaleRides().catch((err) => console.error('expireStaleRides failed', err));
  }, intervalMs);
  sweeper.unref();
}
