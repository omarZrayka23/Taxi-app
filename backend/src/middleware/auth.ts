import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { User } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { forbidden, unauthorized } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

interface TokenPayload {
  sub: number;
}

export function signToken(userId: number): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as SignOptions);
}

export function verifyToken(token: string): number {
  const payload = jwt.verify(token, config.jwtSecret) as unknown as TokenPayload;
  return Number(payload.sub);
}

/** Load the authenticated, non-blocked user for a token, or throw 401/403. */
export async function userFromToken(token: string | undefined): Promise<User> {
  if (!token) throw unauthorized();
  let userId: number;
  try {
    userId = verifyToken(token);
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized('User no longer exists');
  if (user.status === 'BLOCKED') throw forbidden('This account is blocked', 'USER_BLOCKED');
  return user;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  req.user = await userFromToken(token);
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') throw forbidden('Admin only');
  next();
}

/** The authenticated user; only call after requireAuth. */
export function me(req: Request): User {
  if (!req.user) throw unauthorized();
  return req.user;
}
