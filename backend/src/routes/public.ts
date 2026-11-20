import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { me, requireAuth } from '../middleware/auth.js';
import { documentUpload, publicUrl } from '../services/uploads.js';
import { ratesOf, listVehicleTypes } from '../services/vehicleTypes.js';
import { num } from '../lib/money.js';
import { serializeDocument, serializePlace } from '../services/serializers.js';
import { getSettings } from '../services/settings.js';
import { badRequest } from '../lib/errors.js';

export const publicRouter = Router();

publicRouter.get('/health', (_req, res) => {
  res.json({ ok: true });
});

publicRouter.get('/config', async (_req, res) => {
  const [s, types] = await Promise.all([getSettings(), listVehicleTypes({ activeOnly: true })]);
  const feeOf = (code: string) => num(types.find((t) => t.code === code)?.monthlyFeeUsd ?? 0);
  res.json({
    lbpRate: s.lbpRate,
    commissionPercent: s.commissionPercent,
    rentalCommissionPercent: s.rentalCommissionPercent,
    monthlyFeeTaxiUsd: feeOf('TAXI'),
    monthlyFeeTuktukUsd: feeOf('TUKTUK'),
    supportPhone: s.supportPhone,
    vehicleTypes: types.map((v) => ({
      type: v.code,
      code: v.code,
      nameEn: v.nameEn,
      nameAr: v.nameAr,
      icon: v.icon,
      capacity: v.capacity,
      monthlyFeeUsd: num(v.monthlyFeeUsd),
      ...ratesOf(v),
    })),
  });
});

publicRouter.get('/places', async (_req, res) => {
  const places = await prisma.place.findMany({ where: { active: true }, orderBy: { nameEn: 'asc' } });
  res.json({ places: places.map(serializePlace) });
});

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const documentType = z.enum(['ID_CARD', 'DRIVER_LICENSE', 'CAR_REGISTRATION', 'INSURANCE', 'VEHICLE_PHOTO', 'BUSINESS_LICENSE']);

documentsRouter.post('/', documentUpload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('VALIDATION_ERROR', 'file is required');
  const { type } = z.object({ type: documentType }).parse(req.body);
  const document = await prisma.document.create({ data: { userId: me(req).id, type, url: publicUrl(req.file) } });
  res.status(201).json({ document: serializeDocument(document) });
});

documentsRouter.get('/', async (req, res) => {
  const documents = await prisma.document.findMany({ where: { userId: me(req).id }, orderBy: { createdAt: 'desc' } });
  res.json({ documents: documents.map(serializeDocument) });
});
