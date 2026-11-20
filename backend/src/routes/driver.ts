import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { num } from '../lib/money.js';
import { requireVehicleType, vehicleCode } from '../services/vehicleTypes.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { latLng, pageArgs, pagination } from '../lib/validate.js';
import { me, requireAuth } from '../middleware/auth.js';
import { assertDriverCanWork, balanceOf, latestSubscription } from '../services/billing.js';
import { DRIVER_BUSY_STATUSES, offerOpenRidesToDriver, updateDriverLocation } from '../services/rides.js';
import {
  rideInclude,
  serializeDriverProfile,
  serializeLedgerEntry,
  serializeRide,
  serializeSubscription,
} from '../services/serializers.js';
import { getSettings } from '../services/settings.js';

export const driverRouter = Router();
driverRouter.use(requireAuth);

const billingPlan = z.enum(['COMMISSION', 'MONTHLY']);

async function serializeMyProfile(userId: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { driverProfile: { include: { vehicle: true } } } });
  if (!user.driverProfile) throw notFound('Driver profile');
  return serializeDriverProfile(user.driverProfile, user.ratingAvg, user.ratingCount);
}

async function requireProfile(userId: number) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId }, include: { vehicle: true } });
  if (!profile) throw forbidden('You have not applied as a driver', 'NOT_A_DRIVER');
  return profile;
}

driverRouter.post('/apply', async (req, res) => {
  const user = me(req);
  const body = z
    .object({
      vehicleType: vehicleCode,
      vehicleMake: z.string().trim().min(1).max(60),
      vehicleModel: z.string().trim().min(1).max(60),
      vehicleColor: z.string().trim().min(1).max(40),
      plateNumber: z.string().trim().min(1).max(30),
      licenseNumber: z.string().trim().min(1).max(40),
      billingPlan,
    })
    .parse(req.body);
  await requireVehicleType(body.vehicleType, { active: true });
  const existing = await prisma.driverProfile.findUnique({ where: { userId: user.id } });
  if (existing && existing.status !== 'REJECTED') {
    throw conflict('ALREADY_APPLIED', `Your driver application is ${existing.status.toLowerCase()}`);
  }
  await prisma.driverProfile.upsert({
    where: { userId: user.id },
    create: { ...body, userId: user.id },
    update: { ...body, status: 'PENDING', rejectionReason: null },
  });
  res.status(existing ? 200 : 201).json({ driverProfile: await serializeMyProfile(user.id) });
});

driverRouter.patch('/profile', async (req, res) => {
  const user = me(req);
  const body = z
    .object({ billingPlan: billingPlan.optional(), vehicleColor: z.string().trim().min(1).max(40).optional() })
    .parse(req.body);
  const profile = await requireProfile(user.id);
  if (profile.isOnline) throw conflict('GO_OFFLINE_FIRST', 'Go offline before changing your profile');
  await prisma.driverProfile.update({ where: { userId: user.id }, data: body });
  res.json({ driverProfile: await serializeMyProfile(user.id) });
});

driverRouter.post('/online', async (req, res) => {
  const user = me(req);
  const { lat, lng } = latLng.parse(req.body);
  const profile = await requireProfile(user.id);
  await assertDriverCanWork(profile);
  const updated = await prisma.driverProfile.update({
    where: { userId: user.id },
    data: { isOnline: true, lat, lng, lastLocationAt: new Date() },
  });
  await offerOpenRidesToDriver(updated);
  res.json({ driverProfile: await serializeMyProfile(user.id) });
});

driverRouter.post('/offline', async (req, res) => {
  const user = me(req);
  await requireProfile(user.id);
  await prisma.driverProfile.update({ where: { userId: user.id }, data: { isOnline: false } });
  await prisma.rideOffer.deleteMany({ where: { driverId: user.id } });
  res.json({ driverProfile: await serializeMyProfile(user.id) });
});

driverRouter.post('/location', async (req, res) => {
  const { lat, lng } = latLng.parse(req.body);
  await updateDriverLocation(me(req).id, lat, lng);
  res.json({ ok: true });
});

driverRouter.get('/current-ride', async (req, res) => {
  const ride = await prisma.ride.findFirst({
    where: { driverId: me(req).id, status: { in: DRIVER_BUSY_STATUSES } },
    include: rideInclude,
  });
  res.json({ ride: ride ? serializeRide(ride) : null });
});

driverRouter.get('/offers', async (req, res) => {
  const settings = await getSettings();
  const rides = await prisma.ride.findMany({
    where: {
      status: 'REQUESTED',
      requestedAt: { gte: new Date(Date.now() - settings.offerTimeoutSec * 1000) },
      offers: { some: { driverId: me(req).id } },
    },
    include: rideInclude,
    orderBy: { requestedAt: 'desc' },
  });
  res.json({ rides: rides.map(serializeRide) });
});

driverRouter.get('/rides', async (req, res) => {
  const p = pagination.parse(req.query);
  const where = { driverId: me(req).id };
  const [items, total] = await Promise.all([
    prisma.ride.findMany({ where, include: rideInclude, orderBy: { requestedAt: 'desc' }, ...pageArgs(p) }),
    prisma.ride.count({ where }),
  ]);
  res.json({ items: items.map(serializeRide), total, ...p });
});

driverRouter.get('/billing', async (req, res) => {
  const user = me(req);
  const profile = await requireProfile(user.id);
  const settings = await getSettings();
  const [balanceUsd, subscription, ledger] = await Promise.all([
    balanceOf(user.id),
    latestSubscription(user.id),
    prisma.ledgerEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  res.json({
    balanceUsd,
    billingPlan: profile.billingPlan,
    subscription: serializeSubscription(subscription),
    ledger: ledger.map(serializeLedgerEntry),
    commissionPercent: settings.commissionPercent,
    monthlyFeeUsd: num(profile.vehicle.monthlyFeeUsd),
    maxDebtUsd: settings.maxDebtUsd,
  });
});
