import type { BookingStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { round2 } from '../lib/money.js';
import { idParam, money, pageArgs, pagination } from '../lib/validate.js';
import { me, requireAuth } from '../middleware/auth.js';
import { addLedgerEntry } from '../services/billing.js';
import { sendPush } from '../services/push.js';
import { loadBooking, loadListing, publishBooking, transitionBooking } from '../services/rentals.js';
import { bookingInclude, listingInclude, serializeBooking, serializeListing, serializeOwnerProfile } from '../services/serializers.js';
import { getSettings } from '../services/settings.js';
import { photoUpload, publicUrl, removeUpload } from '../services/uploads.js';

export const ownerRouter = Router();
ownerRouter.use(requireAuth);

ownerRouter.post('/apply', async (req, res) => {
  const user = me(req);
  const body = z
    .object({ type: z.enum(['INDIVIDUAL', 'AGENCY']), businessName: z.string().trim().max(120).optional() })
    .refine((b) => b.type !== 'AGENCY' || !!b.businessName, { message: 'businessName is required for agencies', path: ['businessName'] })
    .parse(req.body);
  const existing = await prisma.ownerProfile.findUnique({ where: { userId: user.id } });
  if (existing && existing.status !== 'REJECTED') {
    throw conflict('ALREADY_APPLIED', `Your owner application is ${existing.status.toLowerCase()}`);
  }
  const data = { type: body.type, businessName: body.businessName || null };
  const ownerProfile = await prisma.ownerProfile.upsert({
    where: { userId: user.id },
    create: { ...data, userId: user.id },
    update: { ...data, status: 'PENDING', rejectionReason: null },
  });
  res.status(existing ? 200 : 201).json({ ownerProfile: serializeOwnerProfile(ownerProfile) });
});

async function requireApprovedOwner(userId: number) {
  const profile = await prisma.ownerProfile.findUnique({ where: { userId } });
  if (!profile || profile.status !== 'APPROVED') throw forbidden('Your owner account is not approved yet', 'OWNER_NOT_APPROVED');
  return profile;
}

async function ownListing(userId: number, listingId: number) {
  const listing = await loadListing(listingId);
  if (listing.ownerId !== userId) throw notFound('Listing');
  return listing;
}

const listingFields = z.object({
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: z.coerce.number().int().min(1980).max(new Date().getFullYear() + 1),
  seats: z.coerce.number().int().min(1).max(60),
  transmission: z.enum(['AUTOMATIC', 'MANUAL']),
  fuelType: z.enum(['GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC']),
  color: z.string().trim().min(1).max(40),
  placeId: z.coerce.number().int().positive(),
  description: z.string().trim().max(2000).nullable().optional(),
  selfDrive: z.boolean(),
  pricePerDayUsd: money.nullable().optional(),
  withDriver: z.boolean(),
  withDriverPricePerDayUsd: money.nullable().optional(),
  depositUsd: money.default(0),
  minDays: z.coerce.number().int().min(1).max(90).default(1),
});

type ListingFields = z.infer<typeof listingFields>;

function assertModes(l: Pick<ListingFields, 'selfDrive' | 'withDriver' | 'pricePerDayUsd' | 'withDriverPricePerDayUsd'>) {
  if (!l.selfDrive && !l.withDriver) throw badRequest('VALIDATION_ERROR', 'Offer self-drive, with driver, or both');
  if (l.selfDrive && !l.pricePerDayUsd) throw badRequest('VALIDATION_ERROR', 'pricePerDayUsd is required for self-drive');
  if (l.withDriver && !l.withDriverPricePerDayUsd) {
    throw badRequest('VALIDATION_ERROR', 'withDriverPricePerDayUsd is required when offering a driver');
  }
}

async function assertPlace(placeId: number) {
  const place = await prisma.place.findUnique({ where: { id: placeId } });
  if (!place) throw badRequest('VALIDATION_ERROR', 'Unknown placeId');
}

ownerRouter.get('/listings', async (req, res) => {
  const listings = await prisma.rentalListing.findMany({
    where: { ownerId: me(req).id },
    include: listingInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ listings: listings.map(serializeListing) });
});

ownerRouter.post('/listings', async (req, res) => {
  const user = me(req);
  const owner = await requireApprovedOwner(user.id);
  const body = listingFields.parse(req.body);
  assertModes(body);
  await assertPlace(body.placeId);
  const listing = await prisma.rentalListing.create({
    data: {
      ...body,
      pricePerDayUsd: body.selfDrive ? body.pricePerDayUsd : null,
      withDriverPricePerDayUsd: body.withDriver ? body.withDriverPricePerDayUsd : null,
      ownerId: user.id,
      // Platform cars (admin) are trusted and go live immediately.
      status: owner.type === 'PLATFORM' ? 'APPROVED' : 'PENDING',
    },
    include: listingInclude,
  });
  res.status(201).json({ listing: serializeListing(listing) });
});

ownerRouter.patch('/listings/:id', async (req, res) => {
  const user = me(req);
  const owner = await requireApprovedOwner(user.id);
  const current = await ownListing(user.id, idParam(req.params.id));
  const body = listingFields.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
  const merged = {
    selfDrive: body.selfDrive ?? current.selfDrive,
    withDriver: body.withDriver ?? current.withDriver,
    pricePerDayUsd: body.pricePerDayUsd !== undefined ? body.pricePerDayUsd : current.pricePerDayUsd && Number(current.pricePerDayUsd),
    withDriverPricePerDayUsd:
      body.withDriverPricePerDayUsd !== undefined
        ? body.withDriverPricePerDayUsd
        : current.withDriverPricePerDayUsd && Number(current.withDriverPricePerDayUsd),
  };
  assertModes(merged);
  if (body.placeId) await assertPlace(body.placeId);

  // Changing what the car is (not just price/availability) sends it back to review.
  const identityChanged = (['make', 'model', 'year', 'description'] as const).some(
    (k) => body[k] !== undefined && body[k] !== current[k],
  );
  const listing = await prisma.rentalListing.update({
    where: { id: current.id },
    data: {
      ...body,
      pricePerDayUsd: merged.selfDrive ? merged.pricePerDayUsd : null,
      withDriverPricePerDayUsd: merged.withDriver ? merged.withDriverPricePerDayUsd : null,
      ...(identityChanged && owner.type !== 'PLATFORM' && current.status === 'APPROVED' ? { status: 'PENDING' as const } : {}),
      ...(current.status === 'REJECTED' ? { status: 'PENDING' as const, rejectionReason: null } : {}),
    },
    include: listingInclude,
  });
  res.json({ listing: serializeListing(listing) });
});

ownerRouter.post('/listings/:id/photos', photoUpload.array('photos', 6), async (req, res) => {
  const user = me(req);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw badRequest('VALIDATION_ERROR', 'Attach 1-6 images in the "photos" field');
  const listing = await ownListing(user.id, idParam(req.params.id));
  if (listing.photos.length + files.length > 12) {
    files.forEach((f) => removeUpload(publicUrl(f)));
    throw badRequest('TOO_MANY_PHOTOS', 'A car can have at most 12 photos');
  }
  await prisma.listingPhoto.createMany({ data: files.map((f) => ({ listingId: listing.id, url: publicUrl(f) })) });
  res.status(201).json({ listing: serializeListing(await loadListing(listing.id)) });
});

ownerRouter.delete('/listings/:id/photos/:photoId', async (req, res) => {
  const user = me(req);
  const listing = await ownListing(user.id, idParam(req.params.id));
  const photo = listing.photos.find((p) => p.id === idParam(req.params.photoId));
  if (!photo) throw notFound('Photo');
  await prisma.listingPhoto.delete({ where: { id: photo.id } });
  removeUpload(photo.url);
  res.json({ listing: serializeListing(await loadListing(listing.id)) });
});

// ---------- bookings on my cars ----------

const bookingStatus = z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'ACTIVE', 'COMPLETED', 'CANCELLED']);

ownerRouter.get('/bookings', async (req, res) => {
  const q = pagination.extend({ status: bookingStatus.optional() }).parse(req.query);
  const where = { listing: { ownerId: me(req).id }, ...(q.status ? { status: q.status as BookingStatus } : {}) };
  const [items, total] = await Promise.all([
    prisma.rentalBooking.findMany({ where, include: bookingInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.rentalBooking.count({ where }),
  ]);
  res.json({ items: items.map(serializeBooking), total, page: q.page, pageSize: q.pageSize });
});

const ownsBooking = (userId: number) => ({ listing: { ownerId: userId } });

ownerRouter.post('/bookings/:id/confirm', async (req, res) => {
  const user = me(req);
  const booking = await transitionBooking(idParam(req.params.id), ['PENDING'], { status: 'CONFIRMED' }, ownsBooking(user.id));
  sendPush(booking.renterId, 'Booking confirmed', `Your ${booking.listing.make} ${booking.listing.model} booking is confirmed.`, {
    bookingId: booking.id,
  });
  res.json({ booking: serializeBooking(booking) });
});

ownerRouter.post('/bookings/:id/reject', async (req, res) => {
  const user = me(req);
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
  const booking = await transitionBooking(
    idParam(req.params.id),
    ['PENDING', 'CONFIRMED'],
    { status: 'REJECTED', rejectionReason: reason ?? null },
    ownsBooking(user.id),
  );
  sendPush(booking.renterId, 'Booking declined', reason ?? 'The owner could not accept your booking.', { bookingId: booking.id });
  res.json({ booking: serializeBooking(booking) });
});

ownerRouter.post('/bookings/:id/start', async (req, res) => {
  const user = me(req);
  const booking = await transitionBooking(idParam(req.params.id), ['CONFIRMED'], { status: 'ACTIVE' }, ownsBooking(user.id));
  res.json({ booking: serializeBooking(booking) });
});

ownerRouter.post('/bookings/:id/complete', async (req, res) => {
  const user = me(req);
  const id = idParam(req.params.id);
  const settings = await getSettings();
  const owner = await prisma.ownerProfile.findUnique({ where: { userId: user.id } });
  await prisma.$transaction(async (tx) => {
    const b = await tx.rentalBooking.findFirst({ where: { id, ...ownsBooking(user.id) } });
    if (!b) throw notFound('Booking');
    if (b.status !== 'ACTIVE') throw conflict('INVALID_BOOKING_STATE', 'Only an active rental can be completed');
    const commission = owner?.type === 'PLATFORM' ? 0 : round2((Number(b.totalUsd) * settings.rentalCommissionPercent) / 100);
    await tx.rentalBooking.update({ where: { id }, data: { status: 'COMPLETED', commissionUsd: commission } });
    if (commission > 0) {
      await addLedgerEntry(tx, {
        userId: user.id,
        type: 'RENTAL_COMMISSION',
        amountUsd: commission,
        description: `Commission ${settings.rentalCommissionPercent}% on rental #${id}`,
        bookingId: id,
      });
    }
  });
  const booking = await loadBooking(id);
  publishBooking(booking);
  res.json({ booking: serializeBooking(booking) });
});
