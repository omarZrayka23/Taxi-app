import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { forbidden, notFound } from '../lib/errors.js';
import { formatDateOnly, parseDateOnly, todayUtc } from '../lib/dates.js';
import { idParam, pageArgs, pagination } from '../lib/validate.js';
import { me, requireAuth } from '../middleware/auth.js';
import { sendPush } from '../services/push.js';
import {
  BLOCKING_BOOKING_STATUSES,
  createBooking,
  loadBooking,
  loadListing,
  quoteRental,
  transitionBooking,
  unavailableListingIds,
} from '../services/rentals.js';
import { bookingInclude, listingInclude, serializeBooking, serializeListing } from '../services/serializers.js';

const rentalMode = z.enum(['SELF_DRIVE', 'WITH_DRIVER']);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const rentalsRouter = Router();
rentalsRouter.use(requireAuth);

rentalsRouter.get('/', async (req, res) => {
  const q = pagination
    .extend({
      placeId: z.coerce.number().int().optional(),
      startDate: dateStr.optional(),
      endDate: dateStr.optional(),
      mode: rentalMode.optional(),
      seats: z.coerce.number().int().min(1).optional(),
      transmission: z.enum(['AUTOMATIC', 'MANUAL']).optional(),
    })
    .parse(req.query);

  const where: Prisma.RentalListingWhereInput = { status: 'APPROVED', isActive: true };
  if (q.placeId) where.placeId = q.placeId;
  if (q.seats) where.seats = { gte: q.seats };
  if (q.transmission) where.transmission = q.transmission;
  if (q.mode === 'SELF_DRIVE') where.selfDrive = true;
  if (q.mode === 'WITH_DRIVER') where.withDriver = true;
  if (q.startDate && q.endDate) {
    const busy = await unavailableListingIds(parseDateOnly(q.startDate), parseDateOnly(q.endDate));
    if (busy.length) where.id = { notIn: busy };
  }

  const [items, total] = await Promise.all([
    prisma.rentalListing.findMany({ where, include: listingInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.rentalListing.count({ where }),
  ]);
  res.json({ items: items.map(serializeListing), total, page: q.page, pageSize: q.pageSize });
});

rentalsRouter.get('/:id', async (req, res) => {
  const user = me(req);
  const listing = await loadListing(idParam(req.params.id));
  const visible = listing.status === 'APPROVED' && listing.isActive;
  if (!visible && listing.ownerId !== user.id && user.role !== 'ADMIN') throw notFound('Listing');
  const bookings = await prisma.rentalBooking.findMany({
    where: { listingId: listing.id, status: { in: BLOCKING_BOOKING_STATUSES }, endDate: { gt: todayUtc() } },
    select: { startDate: true, endDate: true },
    orderBy: { startDate: 'asc' },
  });
  res.json({
    listing: serializeListing(listing),
    unavailable: bookings.map((b) => ({ startDate: formatDateOnly(b.startDate), endDate: formatDateOnly(b.endDate) })),
  });
});

const bookingBody = z.object({ startDate: dateStr, endDate: dateStr, mode: rentalMode });

rentalsRouter.post('/:id/quote', async (req, res) => {
  const body = bookingBody.parse(req.body);
  const listing = await loadListing(idParam(req.params.id));
  const q = await quoteRental(listing, body.startDate, body.endDate, body.mode);
  res.json({ days: q.days, pricePerDayUsd: q.pricePerDayUsd, totalUsd: q.totalUsd, totalLbp: q.totalLbp, depositUsd: q.depositUsd });
});

rentalsRouter.post('/:id/book', async (req, res) => {
  const body = bookingBody.extend({ note: z.string().trim().max(300).optional() }).parse(req.body);
  const booking = await createBooking({ ...body, listingId: idParam(req.params.id), renterId: me(req).id });
  res.status(201).json({ booking: serializeBooking(booking) });
});

// ---------- renter bookings ----------

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

bookingsRouter.get('/', async (req, res) => {
  const p = pagination.parse(req.query);
  const where = { renterId: me(req).id };
  const [items, total] = await Promise.all([
    prisma.rentalBooking.findMany({ where, include: bookingInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(p) }),
    prisma.rentalBooking.count({ where }),
  ]);
  res.json({ items: items.map(serializeBooking), total, ...p });
});

bookingsRouter.get('/:id', async (req, res) => {
  const user = me(req);
  const booking = await loadBooking(idParam(req.params.id));
  if (booking.renterId !== user.id && booking.listing.ownerId !== user.id && user.role !== 'ADMIN') throw forbidden();
  res.json({ booking: serializeBooking(booking) });
});

bookingsRouter.post('/:id/cancel', async (req, res) => {
  const user = me(req);
  const id = idParam(req.params.id);
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
  const booking = await transitionBooking(
    id,
    ['PENDING', 'CONFIRMED'],
    { status: 'CANCELLED', rejectionReason: reason ?? null },
    { renterId: user.id },
  );
  sendPush(booking.listing.ownerId, 'Booking cancelled', `${booking.renter.name} cancelled booking #${id}`, { bookingId: id });
  res.json({ booking: serializeBooking(booking) });
});
