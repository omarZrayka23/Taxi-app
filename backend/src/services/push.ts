import { prisma } from '../db.js';

/**
 * Fire-and-forget Expo push notification. Never throws; a failed push must not break the request.
 */
export function sendPush(userId: number | null | undefined, title: string, body: string, data: Record<string, unknown> = {}) {
  if (!userId) return;
  void (async () => {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { expoPushToken: true } });
      const to = user?.expoPushToken;
      if (!to || !to.startsWith('ExponentPushToken')) return;
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to, title, body, data, sound: 'default', priority: 'high' }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.warn('push failed', (err as Error).message);
    }
  })();
}
