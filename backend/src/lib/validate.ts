import { z } from 'zod';
import { badRequest } from './errors.js';

export const idParam = (value: string | string[] | undefined): number => {
  const n = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('VALIDATION_ERROR', 'Invalid id');
  return n;
};

export const latLng = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export const pageArgs = (p: { page: number; pageSize: number }) => ({ skip: (p.page - 1) * p.pageSize, take: p.pageSize });

export const money = z.coerce.number().min(0).max(1_000_000);
