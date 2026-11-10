import type { BookingStatus, RentalListing, RentalMode } from '@prisma/client';
import { prisma } from '../db.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { daysBetween, parseDateOnly, todayUtc } from '../lib/dates.js';
import { num, round2, toLbp } from '../lib/money.js';
import { emitToUser } from './realtime.js';
import { sendPush } from './push.js';
import { bookingInclude, listingInclude, serializeBooking, type BookingFull } from './serializers.js';
import { getSettings } from './settings.js';

/** Bookings in these states hold the car. */
export const BLOCKING_BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'ACTIVE'];

export async function loadListing(id: number) {
  const listing = await prisma.rentalListing.findUnique({ where: { id }, include: listingInclude });
  if (!listing) throw notFound('Listing');
  return listing;
}

export async function loadBooking(id: number): Promise<BookingFull> {
  const booking = await prisma.rentalBooking.findUnique({ where: { id }, include: bookingInclude });
  if (!booking) throw notFound('Booking');
  return booking;
}

export function publishBooking(b: BookingFull) {
  const payload = { booking: serializeBooking(b) };
  emitToUser(b.renterId, 'booking:update', payload);
  emitToUser(b.listing.ownerId, 'booking:update', payload);
}

export function dailyPrice(listing: RentalListing, mode: RentalMode): number {
  if (mode === 'SELF_DRIVE') {
    if (!listing.selfDrive || listing.pricePerDayUsd === null) throw badRequest('MODE_NOT_OFFERED', 'Self-drive is not offered for this car');
    return num(listing.pricePerDayUsd);
  }
  if (!listing.withDriver || listing.withDriverPricePerDayUsd === null) {
    throw badRequest('MODE_NOT_OFFERED', 'This car is not offered with a driver');
  }
  return num(listing.withDriverPricePerDayUsd);
}

export async function quoteRental(listing: RentalListing, startDate: string, endDate: string, mode: RentalMode) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (start < todayUtc()) throw badRequest('INVALID_DATES', 'Start date is in the past');
  const days = daysBetween(start, end);
  if (days < 1) throw badRequest('INVALID_DATES', 'Return date must be after the start date');
  if (days > 90) throw badRequest('INVALID_DATES', 'Bookings are limited to 90 days');
  if (days < listing.minDays) throw badRequest('MIN_DAYS', `Minimum rental is ${listing.minDays} days`);
  const pricePerDayUsd = dailyPrice(listing, mode);
  const totalUsd = round2(pricePerDayUsd * days);
  const { lbpRate } = await getSettings();
  return { start, end, days, pricePerDayUsd, totalUsd, totalLbp: toLbp(totalUsd, lbpRate), depositUsd: num(listing.depositUsd), lbpRate };
}

/** IDs of listings that have a blocking booking overlapping [start, end). */
export async function unavailableListingIds(start: Date, end: Date): Promise<number[]> {
  const rows = await prisma.rentalBooking.findMany({
    where: { status: { in: BLOCKING_BOOKING_STATUSES }, startDate: { lt: end }, endDate: { gt: start } },
    select: { listingId: true },
    distinct: ['listingId'],
  });
  return rows.map((r) => r.listingId);
}

export async function createBooking(args: {
  listingId: number;
  renterId: number;
  startDate: string;
  endDate: string;
  mode: RentalMode;
  note?: string;
}) {
  const listing = await loadListing(args.listingId);
  if (listing.status !== 'APPROVED' || !listing.isActive) throw notFound('Listing');
  if (listing.ownerId === args.renterId) throw badRequest('OWN_LISTING', 'You cannot book your own car');
  const q = await quoteRental(listing, args.startDate, args.endDate, args.mode);

  if (args.mode === 'SELF_DRIVE') {
    const license = await prisma.document.findFirst({ where: { userId: args.renterId, type: 'DRIVER_LICENSE' } });
    if (!license) throw badRequest('LICENSE_REQUIRED', 'Upload your driving license to rent a car without a driver');
  }

  const id = await prisma.$transaction(async (tx) => {
    // Lock the listing row so two renters cannot book the same dates concurrently.
    await tx.$queryRaw`SELECT id FROM RentalListing WHERE id = ${listing.id} FOR UPDATE`;
    const clash = await tx.rentalBooking.findFirst({
      where: {
        listingId: listing.id,
        status: { in: BLOCKING_BOOKING_STATUSES },
        startDate: { lt: q.end },
        endDate: { gt: q.start },
      },
    });
    if (clash) throw conflict('NOT_AVAILABLE', 'The car is not available for these dates');
    const booking = await tx.rentalBooking.create({
      data: {
        listingId: listing.id,
        renterId: args.renterId,
        startDate: q.start,
        endDate: q.end,
        days: q.days,
        mode: args.mode,
        pricePerDayUsd: q.pricePerDayUsd,
        totalUsd: q.totalUsd,
        depositUsd: q.depositUsd,
        lbpRate: q.lbpRate,
        note: args.note || null,
      },
    });
    return booking.id;
  });

  const booking = await loadBooking(id);
  publishBooking(booking);
  sendPush(listing.ownerId, 'New booking request', `${booking.renter.name} wants your ${listing.make} ${listing.model}`, {
    bookingId: id,
  });
  return booking;
}

/** Atomic status change guarded by the current status. */
export async function transitionBooking(
  id: number,
  from: BookingStatus[],
  data: { status: BookingStatus; rejectionReason?: string | null; commissionUsd?: number },
  extraWhere: Record<string, unknown> = {},
) {
  const { count } = await prisma.rentalBooking.updateMany({ where: { id, status: { in: from }, ...extraWhere }, data });
  if (count === 0) {
    await loadBooking(id); // 404 if missing
    throw new AppError(409, 'INVALID_BOOKING_STATE', 'This booking can no longer be updated this way');
  }
  const booking = await loadBooking(id);
  publishBooking(booking);
  return booking;
}
