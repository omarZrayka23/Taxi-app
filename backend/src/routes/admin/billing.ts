import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { num } from '../../lib/money.js';
import { idParam, pageArgs, pagination } from '../../lib/validate.js';
import { me } from '../../middleware/auth.js';
import { activateSubscription, addLedgerEntry, balanceOf, balancesOf, latestSubscription } from '../../services/billing.js';
import { sendPush } from '../../services/push.js';
import { serializeLedgerEntry, serializeSubscription, userSummary } from '../../services/serializers.js';

export const adminBillingRouter = Router();

const accountInclude = { driverProfile: { include: { vehicle: true } }, ownerProfile: true } satisfies Prisma.UserInclude;

adminBillingRouter.get('/accounts', async (req, res) => {
  const q = pagination.extend({ search: z.string().trim().optional() }).parse(req.query);
  const where: Prisma.UserWhereInput = {
    AND: [
      { OR: [{ driverProfile: { isNot: null } }, { ownerProfile: { type: { not: 'PLATFORM' } } }, { ledger: { some: {} } }] },
      q.search ? { OR: [{ name: { contains: q.search } }, { phone: { contains: q.search } }] } : {},
    ],
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, include: accountInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.user.count({ where }),
  ]);
  const ids = users.map((u) => u.id);
  const [balances, subs] = await Promise.all([
    balancesOf(ids),
    prisma.subscription.findMany({ where: { userId: { in: ids } }, orderBy: { periodEnd: 'desc' } }),
  ]);
  res.json({
    items: users.map((u) => ({
      user: userSummary(u),
      kinds: [
        ...(u.driverProfile ? ['DRIVER' as const] : []),
        ...(u.ownerProfile && u.ownerProfile.type !== 'PLATFORM' ? ['OWNER' as const] : []),
      ],
      billingPlan: u.driverProfile?.billingPlan ?? null,
      balanceUsd: balances.get(u.id) ?? 0,
      subscription: serializeSubscription(subs.find((s) => s.userId === u.id) ?? null),
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  });
});

async function loadAccountUser(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: accountInclude });
  if (!user) throw notFound('User');
  return user;
}

adminBillingRouter.get('/accounts/:userId', async (req, res) => {
  const user = await loadAccountUser(idParam(req.params.userId));
  const [balanceUsd, subscription, entries] = await Promise.all([
    balanceOf(user.id),
    latestSubscription(user.id),
    prisma.ledgerEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 500 }),
  ]);
  res.json({
    user: userSummary(user),
    monthlyFeeUsd: user.driverProfile ? num(user.driverProfile.vehicle.monthlyFeeUsd) : null,
    balanceUsd,
    subscription: serializeSubscription(subscription),
    entries: entries.map(serializeLedgerEntry),
  });
});

adminBillingRouter.post('/accounts/:userId/payments', async (req, res) => {
  const user = await loadAccountUser(idParam(req.params.userId));
  const body = z
    .object({
      amountUsd: z.coerce.number().positive().max(1_000_000),
      method: z.enum(['CASH', 'WHISH', 'OMT', 'OTHER']),
      note: z.string().trim().max(200).optional(),
    })
    .parse(req.body);
  const entry = await addLedgerEntry(prisma, {
    userId: user.id,
    type: 'PAYMENT',
    amountUsd: -body.amountUsd,
    method: body.method,
    description: `Payment received (${body.method})${body.note ? ` — ${body.note}` : ''}`,
    createdById: me(req).id,
  });
  sendPush(user.id, 'Payment received', `$${body.amountUsd.toFixed(2)} was added to your account.`);
  res.status(201).json({ entry: serializeLedgerEntry(entry), balanceUsd: await balanceOf(user.id) });
});

adminBillingRouter.post('/accounts/:userId/subscription', async (req, res) => {
  const user = await loadAccountUser(idParam(req.params.userId));
  if (!user.driverProfile) throw badRequest('NOT_A_DRIVER', 'Subscriptions apply to drivers only');
  const { months } = z.object({ months: z.coerce.number().int().min(1).max(12) }).parse(req.body);
  const subscription = await activateSubscription(user.id, months, num(user.driverProfile.vehicle.monthlyFeeUsd), me(req).id);
  sendPush(user.id, 'Subscription active', `Your subscription runs until ${subscription.periodEnd.toISOString().slice(0, 10)}.`);
  res.status(201).json({ subscription: serializeSubscription(subscription), balanceUsd: await balanceOf(user.id) });
});

adminBillingRouter.post('/accounts/:userId/adjustments', async (req, res) => {
  const user = await loadAccountUser(idParam(req.params.userId));
  const body = z
    .object({
      amountUsd: z.coerce.number().refine((n) => n !== 0, 'amountUsd cannot be 0'),
      note: z.string().trim().min(1).max(200),
    })
    .parse(req.body);
  const entry = await addLedgerEntry(prisma, {
    userId: user.id,
    type: 'ADJUSTMENT',
    amountUsd: body.amountUsd,
    description: `Adjustment — ${body.note}`,
    createdById: me(req).id,
  });
  res.status(201).json({ entry: serializeLedgerEntry(entry), balanceUsd: await balanceOf(user.id) });
});
