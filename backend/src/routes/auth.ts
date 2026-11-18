import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { AppError, badRequest, conflict, forbidden } from '../lib/errors.js';
import { normalizeLebanesePhone } from '../lib/phone.js';
import { me, requireAuth, signToken } from '../middleware/auth.js';
import { serializeUser, userInclude } from '../services/serializers.js';

export const authRouter = Router();

const phoneSchema = z.string().transform((v, ctx) => {
  const p = normalizeLebanesePhone(v);
  if (!p) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid Lebanese phone number' });
    return z.NEVER;
  }
  return p;
});

const language = z.enum(['ar', 'en']);

async function loadUser(id: number) {
  return prisma.user.findUniqueOrThrow({ where: { id }, include: userInclude });
}

/** Admins always own an approved PLATFORM owner profile so they can list platform cars. */
async function ensureAdminOwnerProfile(userId: number) {
  await prisma.ownerProfile.upsert({
    where: { userId },
    create: { userId, type: 'PLATFORM', businessName: 'Minieh Rides', status: 'APPROVED' },
    update: {},
  });
}

authRouter.post('/register', async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(2).max(120),
      phone: phoneSchema,
      password: z.string().min(6).max(100),
      gender: z.enum(['MALE', 'FEMALE']),
      language: language.optional(),
    })
    .parse(req.body);
  const exists = await prisma.user.findUnique({ where: { phone: body.phone } });
  if (exists) throw conflict('PHONE_TAKEN', 'This phone number is already registered');
  const user = await prisma.user.create({
    data: {
      name: body.name,
      phone: body.phone,
      passwordHash: await bcrypt.hash(body.password, 10),
      gender: body.gender,
      language: body.language ?? 'ar',
    },
    include: userInclude,
  });
  res.status(201).json({ token: signToken(user.id), user: serializeUser(user) });
});

authRouter.post('/login', async (req, res) => {
  const body = z.object({ phone: z.string(), password: z.string() }).parse(req.body);
  const phone = normalizeLebanesePhone(body.phone);
  const user = phone ? await prisma.user.findUnique({ where: { phone } }) : null;
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong phone number or password');
  }
  if (user.status === 'BLOCKED') throw forbidden('This account is blocked', 'USER_BLOCKED');
  if (user.role === 'ADMIN') await ensureAdminOwnerProfile(user.id);
  res.json({ token: signToken(user.id), user: serializeUser(await loadUser(user.id)) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: serializeUser(await loadUser(me(req).id)) });
});

const OTP_TTL_MS = 10 * 60_000;

authRouter.post('/otp/request', requireAuth, async (req, res) => {
  const user = me(req);
  const code = String(crypto.randomInt(100000, 1000000));
  await prisma.user.update({
    where: { id: user.id },
    data: { otpHash: await bcrypt.hash(code, 8), otpExpiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  // TODO(production): send via an SMS / WhatsApp provider. Until then the code is logged.
  console.log(`[OTP] ${user.phone}: ${code}`);
  res.json(config.isProd ? { sent: true } : { sent: true, devCode: code });
});

authRouter.post('/otp/verify', requireAuth, async (req, res) => {
  const { code } = z.object({ code: z.string().trim().length(6) }).parse(req.body);
  const user = me(req);
  const valid =
    user.otpHash && user.otpExpiresAt && user.otpExpiresAt > new Date() && (await bcrypt.compare(code, user.otpHash));
  if (!valid) throw badRequest('INVALID_CODE', 'The code is wrong or expired');
  await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true, otpHash: null, otpExpiresAt: null } });
  res.json({ user: serializeUser(await loadUser(user.id)) });
});

export const meRouter = Router();

meRouter.patch('/', requireAuth, async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      email: z.string().email().max(190).nullable().optional(),
      language: language.optional(),
      expoPushToken: z.string().max(200).nullable().optional(),
    })
    .parse(req.body);
  const user = await prisma.user.update({ where: { id: me(req).id }, data: body, include: userInclude });
  res.json({ user: serializeUser(user) });
});
