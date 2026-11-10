import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { userFromToken } from '../middleware/auth.js';

type LocationHandler = (userId: number, lat: number, lng: number) => Promise<void>;

let io: Server | null = null;
let onDriverLocation: LocationHandler | null = null;

export const userRoom = (userId: number) => `user:${userId}`;

export function initRealtime(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: config.corsOrigins.includes('*') ? true : config.corsOrigins },
  });

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string | undefined) ?? undefined;
      const user = await userFromToken(token);
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as number;
    socket.join(userRoom(userId));

    socket.on('driver:location', async (payload: { lat?: unknown; lng?: unknown }) => {
      const lat = Number(payload?.lat);
      const lng = Number(payload?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
      try {
        await onDriverLocation?.(userId, lat, lng);
      } catch (err) {
        console.error('driver:location failed', err);
      }
    });
  });

  return io;
}

export function setDriverLocationHandler(handler: LocationHandler) {
  onDriverLocation = handler;
}

export function emitToUser(userId: number | null | undefined, event: string, payload: unknown) {
  if (!io || !userId) return;
  io.to(userRoom(userId)).emit(event, payload);
}

export function emitToUsers(userIds: number[], event: string, payload: unknown) {
  if (!io || userIds.length === 0) return;
  io.to(userIds.map(userRoom)).emit(event, payload);
}
