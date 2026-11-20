import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { num } from '../../lib/money.js';
import { idParam, money } from '../../lib/validate.js';
import { serializePlace } from '../../services/serializers.js';
import { requireVehicleType, vehicleCode } from '../../services/vehicleTypes.js';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../../services/settings.js';

export const adminConfigRouter = Router();

// ---------- places ----------

const placeBody = z.object({
  nameEn: z.string().trim().min(1).max(80),
  nameAr: z.string().trim().min(1).max(80),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.1).max(50),
  active: z.boolean().optional(),
});

adminConfigRouter.get('/places', async (_req, res) => {
  const places = await prisma.place.findMany({ orderBy: { nameEn: 'asc' } });
  res.json({ places: places.map(serializePlace) });
});

adminConfigRouter.post('/places', async (req, res) => {
  const place = await prisma.place.create({ data: placeBody.parse(req.body) });
  res.status(201).json({ place: serializePlace(place) });
});

adminConfigRouter.patch('/places/:id', async (req, res) => {
  const place = await prisma.place.update({ where: { id: idParam(req.params.id) }, data: placeBody.partial().parse(req.body) });
  res.json({ place: serializePlace(place) });
});

adminConfigRouter.delete('/places/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const inUse = await prisma.rentalListing.count({ where: { placeId: id } });
  if (inUse > 0) throw conflict('PLACE_IN_USE', `${inUse} rental car(s) use this place; deactivate it instead`);
  await prisma.place.delete({ where: { id } });
  res.json({ ok: true });
});

// ---------- route fares ----------

const routeFareInclude = { fromPlace: true, toPlace: true } satisfies Prisma.RouteFareInclude;
type RouteFareFull = Prisma.RouteFareGetPayload<{ include: typeof routeFareInclude }>;
const serializeRouteFare = (r: RouteFareFull) => ({
  id: r.id,
  fromPlace: serializePlace(r.fromPlace),
  toPlace: serializePlace(r.toPlace),
  vehicleType: r.vehicleType,
  priceUsd: num(r.priceUsd),
  bidirectional: r.bidirectional,
});

const routeFareBody = z.object({
  fromPlaceId: z.coerce.number().int().positive(),
  toPlaceId: z.coerce.number().int().positive(),
  vehicleType: vehicleCode,
  priceUsd: money,
  bidirectional: z.boolean().default(true),
});

async function assertNoDuplicate(data: { fromPlaceId: number; toPlaceId: number; vehicleType: string; bidirectional: boolean }, exceptId?: number) {
  if (data.fromPlaceId === data.toPlaceId) throw badRequest('VALIDATION_ERROR', 'From and to places must differ');
  const clash = await prisma.routeFare.findFirst({
    where: {
      id: exceptId ? { not: exceptId } : undefined,
      vehicleType: data.vehicleType,
      OR: [
        { fromPlaceId: data.fromPlaceId, toPlaceId: data.toPlaceId },
        // A reverse route conflicts if either one is bidirectional.
        ...(data.bidirectional
          ? [{ fromPlaceId: data.toPlaceId, toPlaceId: data.fromPlaceId }]
          : [{ fromPlaceId: data.toPlaceId, toPlaceId: data.fromPlaceId, bidirectional: true }]),
      ],
    },
  });
  if (clash) throw conflict('DUPLICATE_ROUTE', 'A price for this route and vehicle type already exists');
}

adminConfigRouter.get('/route-fares', async (_req, res) => {
  const items = await prisma.routeFare.findMany({ include: routeFareInclude, orderBy: [{ fromPlaceId: 'asc' }, { toPlaceId: 'asc' }] });
  res.json({ items: items.map(serializeRouteFare) });
});

adminConfigRouter.post('/route-fares', async (req, res) => {
  const body = routeFareBody.parse(req.body);
  await requireVehicleType(body.vehicleType, { active: false });
  await assertNoDuplicate(body);
  const routeFare = await prisma.routeFare.create({ data: body, include: routeFareInclude });
  res.status(201).json({ routeFare: serializeRouteFare(routeFare) });
});

adminConfigRouter.patch('/route-fares/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const current = await prisma.routeFare.findUnique({ where: { id } });
  if (!current) throw notFound('Route fare');
  const body = routeFareBody.partial().parse(req.body);
  if (body.vehicleType) await requireVehicleType(body.vehicleType, { active: false });
  await assertNoDuplicate(
    {
      fromPlaceId: body.fromPlaceId ?? current.fromPlaceId,
      toPlaceId: body.toPlaceId ?? current.toPlaceId,
      vehicleType: body.vehicleType ?? current.vehicleType,
      bidirectional: body.bidirectional ?? current.bidirectional,
    },
    id,
  );
  const routeFare = await prisma.routeFare.update({ where: { id }, data: body, include: routeFareInclude });
  res.json({ routeFare: serializeRouteFare(routeFare) });
});

adminConfigRouter.delete('/route-fares/:id', async (req, res) => {
  await prisma.routeFare.delete({ where: { id: idParam(req.params.id) } });
  res.json({ ok: true });
});

// ---------- settings ----------

const pct = z.coerce.number().min(0).max(100);
const settingsBody = z
  .object({
    commissionPercent: pct,
    rentalCommissionPercent: pct,
    lbpRate: z.coerce.number().int().min(1),
    maxDebtUsd: money,
    searchRadiusKm: z.coerce.number().min(0.5).max(100),
    offerTimeoutSec: z.coerce.number().int().min(15).max(600),
    fareRoundingUsd: z.coerce.number().min(0).max(10),
    supportPhone: z.string().trim().min(3).max(30),
  })
  .partial()
  .strict();

adminConfigRouter.get('/settings', async (_req, res) => {
  res.json(await getSettings());
});

adminConfigRouter.put('/settings', async (req, res) => {
  const patch = settingsBody.parse(req.body) as Partial<typeof DEFAULT_SETTINGS>;
  res.json(await updateSettings(patch));
});
