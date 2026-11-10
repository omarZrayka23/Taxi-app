import type { DriverProfile, LedgerType, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db.js';
import { AppError, forbidden } from '../lib/errors.js';
import { num, round2 } from '../lib/money.js';
import { getSettings } from './settings.js';

type Db = PrismaClient | Prisma.TransactionClient;

export async function balanceOf(userId: number, db: Db = prisma): Promise<number> {
  const agg = await db.ledgerEntry.aggregate({ where: { userId }, _sum: { amountUsd: true } });
  return round2(num(agg._sum.amountUsd));
}

export async function balancesOf(userIds: number[]): Promise<Map<number, number>> {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds } },
    _sum: { amountUsd: true },
  });
  return new Map(rows.map((r) => [r.userId, round2(num(r._sum.amountUsd))]));
}

export function addLedgerEntry(
  db: Db,
  data: {
    userId: number;
    type: LedgerType;
    amountUsd: number;
    description: string;
    method?: string;
    rideId?: number;
    bookingId?: number;
    createdById?: number;
  },
) {
  return db.ledgerEntry.create({ data: { ...data, amountUsd: round2(data.amountUsd) } });
}

export async function latestSubscription(userId: number, db: Db = prisma) {
  return db.subscription.findFirst({ where: { userId }, orderBy: { periodEnd: 'desc' } });
}

export async function hasActiveSubscription(userId: number): Promise<boolean> {
  const sub = await latestSubscription(userId);
  return !!sub && sub.periodEnd > new Date();
}

/** Throws the right 4xx if this driver may not take rides right now. */
export async function assertDriverCanWork(profile: DriverProfile | null) {
  if (!profile || profile.status !== 'APPROVED') {
    throw forbidden('Your driver account is not approved', 'NOT_APPROVED');
  }
  const settings = await getSettings();
  if (profile.billingPlan === 'MONTHLY' && !(await hasActiveSubscription(profile.userId))) {
    throw new AppError(402, 'SUBSCRIPTION_REQUIRED', 'Your monthly subscription is not active. Please pay to continue.');
  }
  const balance = await balanceOf(profile.userId);
  if (balance > settings.maxDebtUsd) {
    throw new AppError(
      402,
      'DEBT_LIMIT_EXCEEDED',
      `You owe $${balance.toFixed(2)}, above the $${settings.maxDebtUsd} limit. Please pay to continue.`,
    );
  }
}

/** Extend a subscription by N months starting from now or the current period end, charging the fee. */
export async function activateSubscription(userId: number, months: number, monthlyFeeUsd: number, adminId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await latestSubscription(userId, tx);
    const now = new Date();
    const periodStart = current && current.periodEnd > now ? current.periodEnd : now;
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + months);
    const subscription = await tx.subscription.create({ data: { userId, periodStart, periodEnd } });
    if (monthlyFeeUsd > 0) {
      await addLedgerEntry(tx, {
        userId,
        type: 'SUBSCRIPTION_FEE',
        amountUsd: monthlyFeeUsd * months,
        description: `Monthly subscription × ${months} (until ${periodEnd.toISOString().slice(0, 10)})`,
        createdById: adminId,
      });
    }
    return subscription;
  });
}
