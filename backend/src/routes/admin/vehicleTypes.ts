import { PricingMode, VehicleIcon } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { conflict, notFound } from '../../lib/errors.js';
import { money } from '../../lib/validate.js';
import { listVehicleTypes, serializeVehicleType, vehicleCode } from '../../services/vehicleTypes.js';

export const adminVehicleTypesRouter = Router();

const body = z.object({
  code: vehicleCode,
  nameEn: z.string().trim().min(1).max(60),
  nameAr: z.string().trim().min(1).max(60),
  icon: z.nativeEnum(VehicleIcon),
  capacity: z.coerce.number().int().min(1).max(100),
  mode: z.nativeEnum(PricingMode),
  baseFare: money,
  perKm: money,
  perMin: money,
  minimumFare: money,
  monthlyFeeUsd: money,
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

const driverCount = (code: string) => prisma.driverProfile.count({ where: { vehicleType: code } });

adminVehicleTypesRouter.get('/', async (_req, res) => {
  const [types, groups] = await Promise.all([
    listVehicleTypes(),
    prisma.driverProfile.groupBy({ by: ['vehicleType'], _count: { _all: true } }),
  ]);
  const counts = new Map(groups.map((g) => [g.vehicleType, g._count._all]));
  res.json({ items: types.map((v) => serializeVehicleType(v, counts.get(v.code) ?? 0)) });
});

adminVehicleTypesRouter.post('/', async (req, res) => {
  const data = body.parse(req.body);
  if (await prisma.vehicleType.findUnique({ where: { code: data.code } })) {
    throw conflict('VEHICLE_TYPE_EXISTS', `Vehicle type ${data.code} already exists`);
  }
  const sortOrder =
    data.sortOrder ?? ((await prisma.vehicleType.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;
  const vehicleType = await prisma.vehicleType.create({ data: { ...data, sortOrder } });
  res.status(201).json({ vehicleType: serializeVehicleType(vehicleType, 0) });
});

adminVehicleTypesRouter.patch('/:code', async (req, res) => {
  const code = vehicleCode.parse(req.params.code);
  if (!(await prisma.vehicleType.findUnique({ where: { code } }))) throw notFound('Vehicle type');
  const { code: _ignored, ...data } = body.partial().parse(req.body);
  const vehicleType = await prisma.vehicleType.update({ where: { code }, data });
  res.json({ vehicleType: serializeVehicleType(vehicleType, await driverCount(code)) });
});

adminVehicleTypesRouter.delete('/:code', async (req, res) => {
  const code = vehicleCode.parse(req.params.code);
  if (!(await prisma.vehicleType.findUnique({ where: { code } }))) throw notFound('Vehicle type');
  const [drivers, rides, fares] = await Promise.all([
    driverCount(code),
    prisma.ride.count({ where: { vehicleType: code } }),
    prisma.routeFare.count({ where: { vehicleType: code } }),
  ]);
  if (drivers + rides + fares > 0) {
    throw conflict(
      'VEHICLE_TYPE_IN_USE',
      `Used by ${drivers} driver(s), ${rides} ride(s) and ${fares} route price(s); turn it off instead`,
    );
  }
  await prisma.vehicleType.delete({ where: { code } });
  res.json({ ok: true });
});
