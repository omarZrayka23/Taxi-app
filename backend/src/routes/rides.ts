import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, conflict, forbidden } from '../lib/errors.js';
import { idParam, latLng, pageArgs, pagination } from '../lib/validate.js';
import { me, requireAuth } from '../middleware/auth.js';
import { assertDriverCanWork } from '../services/billing.js';
import { estimateFares } from '../services/pricingData.js';
import { sendPush } from '../services/push.js';
import {
  ACTIVE_RIDE_STATUSES,
  DRIVER_BUSY_STATUSES,
  cancelRide,
  closeOffers,
  completeRide,
  dispatchRide,
  hasWomenDrivers,
  isDriverNearby,
  loadRide,
  rideMatchesDriverGender,
  transitionRide,
} from '../services/rides.js';
import { rideInclude, serializeRide } from '../services/serializers.js';

export const ridesRouter = Router();
ridesRouter.use(requireAuth);

const vehicleType = z.enum(['TAXI', 'TUKTUK']);
const point = latLng.extend({ address: z.string().trim().min(1).max(255) });

ridesRouter.post('/estimate', async (req, res) => {
  const body = z.object({ pickup: latLng, dropoff: latLng }).parse(req.body);
  const [{ estimates }, women] = await Promise.all([estimateFares(body.pickup, body.dropoff), hasWomenDrivers()]);
  const withAvailability = await Promise.all(
    estimates.map(async (e) => ({
      ...e,
      womanDriverNearby: women ? await isDriverNearby(body.pickup, e.vehicleType, 'FEMALE') : false,
    })),
  );
  res.json({ estimates: withAvailability, hasWomenDrivers: women });
});

ridesRouter.post('/', async (req, res) => {
  const user = me(req);
  const body = z
    .object({
      vehicleType,
      pickup: point,
      dropoff: point,
      note: z.string().trim().max(300).optional(),
      driverGender: z.enum(['MALE', 'FEMALE']).optional(),
    })
    .parse(req.body);

  const active = await prisma.ride.findFirst({
    where: { passengerId: user.id, status: { in: ACTIVE_RIDE_STATUSES } },
    select: { id: true },
  });
  if (active) throw conflict('ACTIVE_RIDE_EXISTS', 'You already have an active ride');

  const { estimates, lbpRate } = await estimateFares(body.pickup, body.dropoff);
  const est = estimates.find((e) => e.vehicleType === body.vehicleType)!;
  const ride = await prisma.ride.create({
    data: {
      passengerId: user.id,
      vehicleType: body.vehicleType,
      driverGender: body.driverGender ?? null,
      pricingMode: est.pricingMode,
      pickupLat: body.pickup.lat,
      pickupLng: body.pickup.lng,
      pickupAddress: body.pickup.address,
      dropoffLat: body.dropoff.lat,
      dropoffLng: body.dropoff.lng,
      dropoffAddress: body.dropoff.address,
      distanceKm: est.distanceKm,
      durationMin: est.durationMin,
      fareUsd: est.fareUsd,
      lbpRate,
      note: body.note || null,
    },
    include: rideInclude,
  });
  await dispatchRide(ride);
  res.status(201).json({ ride: serializeRide(ride) });
});

ridesRouter.get('/current', async (req, res) => {
  const ride = await prisma.ride.findFirst({
    where: { passengerId: me(req).id, status: { in: ACTIVE_RIDE_STATUSES } },
    include: rideInclude,
    orderBy: { requestedAt: 'desc' },
  });
  res.json({ ride: ride ? serializeRide(ride) : null });
});

ridesRouter.get('/', async (req, res) => {
  const p = pagination.parse(req.query);
  const where = { passengerId: me(req).id };
  const [items, total] = await Promise.all([
    prisma.ride.findMany({ where, include: rideInclude, orderBy: { requestedAt: 'desc' }, ...pageArgs(p) }),
    prisma.ride.count({ where }),
  ]);
  res.json({ items: items.map(serializeRide), total, ...p });
});

ridesRouter.get('/:id', async (req, res) => {
  const user = me(req);
  const ride = await loadRide(idParam(req.params.id));
  const offered =
    ride.status === 'REQUESTED' &&
    (await prisma.rideOffer.findUnique({ where: { rideId_driverId: { rideId: ride.id, driverId: user.id } } }));
  if (user.role !== 'ADMIN' && ride.passengerId !== user.id && ride.driverId !== user.id && !offered) {
    throw forbidden();
  }
  res.json({ ride: serializeRide(ride) });
});

ridesRouter.post('/:id/cancel', async (req, res) => {
  const user = me(req);
  const id = idParam(req.params.id);
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
  const current = await loadRide(id);
  let ride;
  if (current.passengerId === user.id) {
    ride = await cancelRide(id, 'PASSENGER', ['REQUESTED', 'ACCEPTED', 'ARRIVED'], reason, { passengerId: user.id });
  } else if (current.driverId === user.id) {
    ride = await cancelRide(id, 'DRIVER', ['ACCEPTED', 'ARRIVED'], reason, { driverId: user.id });
  } else {
    throw forbidden();
  }
  res.json({ ride: serializeRide(ride) });
});

// ---------- driver actions ----------

ridesRouter.post('/:id/accept', async (req, res) => {
  const user = me(req);
  const id = idParam(req.params.id);
  const profile = await prisma.driverProfile.findUnique({ where: { userId: user.id } });
  await assertDriverCanWork(profile);
  if (!profile!.isOnline) throw conflict('GO_ONLINE_FIRST', 'Go online to accept rides');
  const busy = await prisma.ride.findFirst({ where: { driverId: user.id, status: { in: DRIVER_BUSY_STATUSES } } });
  if (busy) throw conflict('DRIVER_BUSY', 'Finish your current ride first');

  const ride = await transitionRide(
    id,
    {
      status: { in: ['REQUESTED'] },
      vehicleType: profile!.vehicleType,
      passengerId: { not: user.id },
      ...rideMatchesDriverGender(user.gender),
    },
    { status: 'ACCEPTED', driverId: user.id, acceptedAt: new Date() },
    'RIDE_NOT_AVAILABLE',
  );
  await closeOffers(id, user.id);
  sendPush(ride.passengerId, 'Driver on the way', `${user.name} accepted your ride.`, { rideId: id });
  res.json({ ride: serializeRide(ride) });
});

ridesRouter.post('/:id/arrived', async (req, res) => {
  const user = me(req);
  const id = idParam(req.params.id);
  const ride = await transitionRide(id, { driverId: user.id, status: { in: ['ACCEPTED'] } }, { status: 'ARRIVED', arrivedAt: new Date() });
  sendPush(ride.passengerId, 'Your driver has arrived', 'Please meet your driver at the pickup point.', { rideId: id });
  res.json({ ride: serializeRide(ride) });
});

ridesRouter.post('/:id/start', async (req, res) => {
  const user = me(req);
  const id = idParam(req.params.id);
  const ride = await transitionRide(id, { driverId: user.id, status: { in: ['ARRIVED'] } }, { status: 'IN_PROGRESS', startedAt: new Date() });
  res.json({ ride: serializeRide(ride) });
});

ridesRouter.post('/:id/complete', async (req, res) => {
  const ride = await completeRide(idParam(req.params.id), me(req).id);
  res.json({ ride: serializeRide(ride) });
});

ridesRouter.post('/:id/rate', async (req, res) => {
  const user = me(req);
  const id = idParam(req.params.id);
  const { stars } = z.object({ stars: z.coerce.number().int().min(1).max(5) }).parse(req.body);
  const ride = await loadRide(id);
  if (ride.status !== 'COMPLETED') throw badRequest('INVALID_RIDE_STATE', 'Only completed rides can be rated');

  if (ride.passengerId === user.id) {
    const { count } = await prisma.ride.updateMany({ where: { id, ratingByPassenger: null }, data: { ratingByPassenger: stars } });
    if (count === 0) throw conflict('ALREADY_RATED', 'You already rated this ride');
    if (ride.driverId) {
      // Driver rating is the running average of ratings received from passengers.
      const agg = await prisma.ride.aggregate({
        where: { driverId: ride.driverId, ratingByPassenger: { not: null } },
        _avg: { ratingByPassenger: true },
        _count: { ratingByPassenger: true },
      });
      await prisma.user.update({
        where: { id: ride.driverId },
        data: {
          ratingAvg: Math.round((agg._avg.ratingByPassenger ?? 0) * 100) / 100,
          ratingCount: agg._count.ratingByPassenger,
        },
      });
    }
  } else if (ride.driverId === user.id) {
    const { count } = await prisma.ride.updateMany({ where: { id, ratingByDriver: null }, data: { ratingByDriver: stars } });
    if (count === 0) throw conflict('ALREADY_RATED', 'You already rated this ride');
  } else {
    throw forbidden();
  }
  res.json({ ride: serializeRide(await loadRide(id)) });
});
