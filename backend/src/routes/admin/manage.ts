import type { ApprovalStatus, BookingStatus, Prisma, RideStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { conflict, notFound } from '../../lib/errors.js';
import { num, round2 } from '../../lib/money.js';
import { idParam, pageArgs, pagination } from '../../lib/validate.js';
import { me } from '../../middleware/auth.js';
import { balanceOf, balancesOf, latestSubscription } from '../../services/billing.js';
import { sendPush } from '../../services/push.js';
import { emitToUser } from '../../services/realtime.js';
import { ACTIVE_RIDE_STATUSES, cancelRide } from '../../services/rides.js';
import {
  bookingInclude,
  listingInclude,
  rideInclude,
  serializeBooking,
  serializeDocument,
  serializeDriverProfile,
  serializeListing,
  serializeOwnerProfile,
  serializeRide,
  serializeSubscription,
  serializeUser,
  userInclude,
  userSummary,
} from '../../services/serializers.js';

export const adminManageRouter = Router();

const reasonBody = z.object({ reason: z.string().trim().max(300).optional() });
const approval = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']);
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

async function pushAccountUpdate(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: userInclude });
  if (user) emitToUser(userId, 'account:update', { user: serializeUser(user) });
}

// ---------- dashboard ----------

adminManageRouter.get('/stats', async (_req, res) => {
  const today = startOfToday();
  const [users, driversTotal, driversPending, driversOnline, ownersPending, listingsPending, ridesToday, completedToday, revenue, bookingsPending, bookingsActive, debt] =
    await Promise.all([
      prisma.user.count(),
      prisma.driverProfile.count(),
      prisma.driverProfile.count({ where: { status: 'PENDING' } }),
      prisma.driverProfile.count({ where: { isOnline: true, status: 'APPROVED' } }),
      prisma.ownerProfile.count({ where: { status: 'PENDING' } }),
      prisma.rentalListing.count({ where: { status: 'PENDING' } }),
      prisma.ride.count({ where: { requestedAt: { gte: today } } }),
      prisma.ride.count({ where: { status: 'COMPLETED', completedAt: { gte: today } } }),
      prisma.ride.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: today } }, _sum: { fareUsd: true } }),
      prisma.rentalBooking.count({ where: { status: 'PENDING' } }),
      prisma.rentalBooking.count({ where: { status: 'ACTIVE' } }),
      prisma.ledgerEntry.groupBy({ by: ['userId'], _sum: { amountUsd: true } }),
    ]);
  res.json({
    users,
    drivers: { total: driversTotal, pending: driversPending, online: driversOnline },
    ownersPending,
    listingsPending,
    rides: { today: ridesToday, completedToday, revenueTodayUsd: round2(num(revenue._sum.fareUsd)) },
    bookings: { pending: bookingsPending, active: bookingsActive },
    outstandingDebtUsd: round2(debt.reduce((sum, r) => sum + Math.max(0, num(r._sum.amountUsd)), 0)),
  });
});

// ---------- users ----------

adminManageRouter.get('/users', async (req, res) => {
  const q = pagination.extend({ search: z.string().trim().optional() }).parse(req.query);
  const where: Prisma.UserWhereInput = q.search
    ? { OR: [{ name: { contains: q.search } }, { phone: { contains: q.search } }] }
    : {};
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, include: userInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.user.count({ where }),
  ]);
  res.json({ items: items.map(serializeUser), total, page: q.page, pageSize: q.pageSize });
});

adminManageRouter.patch('/users/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const { status, gender } = z
    .object({ status: z.enum(['ACTIVE', 'BLOCKED']).optional(), gender: z.enum(['MALE', 'FEMALE']).optional() })
    .refine((b) => b.status || b.gender, { message: 'Nothing to update' })
    .parse(req.body);
  if (status && id === me(req).id) throw conflict('CANNOT_BLOCK_SELF', 'You cannot block your own account');
  const user = await prisma.user.update({ where: { id }, data: { status, gender }, include: userInclude });
  if (status === 'BLOCKED') await prisma.driverProfile.updateMany({ where: { userId: id }, data: { isOnline: false } });
  res.json({ user: serializeUser(user) });
});

// ---------- drivers ----------

const driverInclude = { user: true, vehicle: true } satisfies Prisma.DriverProfileInclude;
type DriverWithUser = Prisma.DriverProfileGetPayload<{ include: typeof driverInclude }>;
const serializeDriverRow = (d: DriverWithUser) => ({
  ...serializeDriverProfile(d, d.user.ratingAvg, d.user.ratingCount),
  user: { ...userSummary(d.user), gender: d.user.gender },
});

adminManageRouter.get('/drivers', async (req, res) => {
  const q = pagination.extend({ status: approval.optional(), search: z.string().trim().optional() }).parse(req.query);
  const where: Prisma.DriverProfileWhereInput = {
    ...(q.status ? { status: q.status as ApprovalStatus } : {}),
    ...(q.search
      ? {
          OR: [
            { plateNumber: { contains: q.search } },
            { user: { name: { contains: q.search } } },
            { user: { phone: { contains: q.search } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.driverProfile.findMany({ where, include: driverInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.driverProfile.count({ where }),
  ]);
  const balances = await balancesOf(rows.map((r) => r.userId));
  res.json({
    items: rows.map((d) => ({ ...serializeDriverRow(d), balanceUsd: balances.get(d.userId) ?? 0 })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  });
});

async function loadDriver(id: number) {
  const driver = await prisma.driverProfile.findUnique({ where: { id }, include: driverInclude });
  if (!driver) throw notFound('Driver');
  return driver;
}

adminManageRouter.get('/drivers/:id', async (req, res) => {
  const driver = await loadDriver(idParam(req.params.id));
  const [documents, balanceUsd, subscription] = await Promise.all([
    prisma.document.findMany({ where: { userId: driver.userId }, orderBy: { createdAt: 'desc' } }),
    balanceOf(driver.userId),
    latestSubscription(driver.userId),
  ]);
  res.json({
    driver: serializeDriverRow(driver),
    documents: documents.map(serializeDocument),
    balanceUsd,
    subscription: serializeSubscription(subscription),
  });
});

const driverActions: Record<string, { from: ApprovalStatus[]; to: ApprovalStatus; title: string }> = {
  approve: { from: ['PENDING', 'REJECTED'], to: 'APPROVED', title: 'Driver account approved' },
  reject: { from: ['PENDING'], to: 'REJECTED', title: 'Driver application rejected' },
  suspend: { from: ['APPROVED'], to: 'SUSPENDED', title: 'Driver account suspended' },
  reactivate: { from: ['SUSPENDED'], to: 'APPROVED', title: 'Driver account reactivated' },
};

adminManageRouter.post('/drivers/:id/:action', async (req, res) => {
  const action = driverActions[String(req.params.action)];
  if (!action) throw notFound('Action');
  const id = idParam(req.params.id);
  const { reason } = reasonBody.parse(req.body ?? {});
  const { count } = await prisma.driverProfile.updateMany({
    where: { id, status: { in: action.from } },
    data: {
      status: action.to,
      rejectionReason: action.to === 'APPROVED' ? null : (reason ?? null),
      ...(action.to !== 'APPROVED' ? { isOnline: false } : {}),
    },
  });
  if (count === 0) {
    await loadDriver(id);
    throw conflict('INVALID_STATUS', `Cannot ${req.params.action} a driver in this status`);
  }
  const driver = await loadDriver(id);
  await pushAccountUpdate(driver.userId);
  sendPush(driver.userId, action.title, reason ?? '');
  res.json({ driver: serializeDriverRow(driver) });
});

// ---------- owners ----------

function approveOrReject(action: unknown): boolean {
  if (action !== 'approve' && action !== 'reject') throw notFound('Action');
  return action === 'approve';
}

const ownerInclude = { user: true } satisfies Prisma.OwnerProfileInclude;
type OwnerWithUser = Prisma.OwnerProfileGetPayload<{ include: typeof ownerInclude }>;
const serializeOwnerRow = (o: OwnerWithUser) => ({ ...serializeOwnerProfile(o), user: userSummary(o.user) });

adminManageRouter.get('/owners', async (req, res) => {
  const q = pagination.extend({ status: approval.optional() }).parse(req.query);
  const where: Prisma.OwnerProfileWhereInput = { type: { not: 'PLATFORM' }, ...(q.status ? { status: q.status as ApprovalStatus } : {}) };
  const [items, total] = await Promise.all([
    prisma.ownerProfile.findMany({ where, include: ownerInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.ownerProfile.count({ where }),
  ]);
  res.json({ items: items.map(serializeOwnerRow), total, page: q.page, pageSize: q.pageSize });
});

async function loadOwner(id: number) {
  const owner = await prisma.ownerProfile.findUnique({ where: { id }, include: ownerInclude });
  if (!owner) throw notFound('Owner');
  return owner;
}

adminManageRouter.get('/owners/:id', async (req, res) => {
  const owner = await loadOwner(idParam(req.params.id));
  const documents = await prisma.document.findMany({ where: { userId: owner.userId }, orderBy: { createdAt: 'desc' } });
  res.json({ owner: serializeOwnerRow(owner), documents: documents.map(serializeDocument) });
});

adminManageRouter.post('/owners/:id/:action', async (req, res) => {
  const id = idParam(req.params.id);
  const approve = approveOrReject(req.params.action);
  const { reason } = reasonBody.parse(req.body ?? {});
  const { count } = await prisma.ownerProfile.updateMany({
    where: { id, status: { in: approve ? ['PENDING', 'REJECTED'] : ['PENDING', 'APPROVED'] }, type: { not: 'PLATFORM' } },
    data: { status: approve ? 'APPROVED' : 'REJECTED', rejectionReason: approve ? null : (reason ?? null) },
  });
  if (count === 0) {
    await loadOwner(id);
    throw conflict('INVALID_STATUS', `Cannot ${req.params.action} this owner`);
  }
  const owner = await loadOwner(id);
  await pushAccountUpdate(owner.userId);
  sendPush(owner.userId, approve ? 'Owner account approved' : 'Owner application rejected', reason ?? '');
  res.json({ owner: serializeOwnerRow(owner) });
});

// ---------- listings ----------

adminManageRouter.get('/listings', async (req, res) => {
  const q = pagination.extend({ status: approval.optional() }).parse(req.query);
  const where: Prisma.RentalListingWhereInput = q.status ? { status: q.status as ApprovalStatus } : {};
  const [items, total] = await Promise.all([
    prisma.rentalListing.findMany({ where, include: listingInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.rentalListing.count({ where }),
  ]);
  res.json({ items: items.map(serializeListing), total, page: q.page, pageSize: q.pageSize });
});

adminManageRouter.post('/listings/:id/:action', async (req, res) => {
  const id = idParam(req.params.id);
  const approve = approveOrReject(req.params.action);
  const { reason } = reasonBody.parse(req.body ?? {});
  const listing = await prisma.rentalListing.update({
    where: { id },
    data: { status: approve ? 'APPROVED' : 'REJECTED', rejectionReason: approve ? null : (reason ?? null) },
    include: listingInclude,
  });
  sendPush(listing.ownerId, approve ? 'Your car is live' : 'Your car listing was rejected', reason ?? `${listing.make} ${listing.model}`);
  res.json({ listing: serializeListing(listing) });
});

// ---------- rides & bookings ----------

const rideStatus = z.enum(['REQUESTED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED']);

adminManageRouter.get('/rides', async (req, res) => {
  const q = pagination.extend({ status: rideStatus.optional() }).parse(req.query);
  const where: Prisma.RideWhereInput = q.status ? { status: q.status as RideStatus } : {};
  const [items, total] = await Promise.all([
    prisma.ride.findMany({ where, include: rideInclude, orderBy: { requestedAt: 'desc' }, ...pageArgs(q) }),
    prisma.ride.count({ where }),
  ]);
  res.json({ items: items.map(serializeRide), total, page: q.page, pageSize: q.pageSize });
});

adminManageRouter.post('/rides/:id/cancel', async (req, res) => {
  const { reason } = reasonBody.parse(req.body ?? {});
  const ride = await cancelRide(idParam(req.params.id), 'ADMIN', ACTIVE_RIDE_STATUSES, reason);
  res.json({ ride: serializeRide(ride) });
});

const bookingStatus = z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'ACTIVE', 'COMPLETED', 'CANCELLED']);

adminManageRouter.get('/bookings', async (req, res) => {
  const q = pagination.extend({ status: bookingStatus.optional() }).parse(req.query);
  const where: Prisma.RentalBookingWhereInput = q.status ? { status: q.status as BookingStatus } : {};
  const [items, total] = await Promise.all([
    prisma.rentalBooking.findMany({ where, include: bookingInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.rentalBooking.count({ where }),
  ]);
  res.json({ items: items.map(serializeBooking), total, page: q.page, pageSize: q.pageSize });
});
