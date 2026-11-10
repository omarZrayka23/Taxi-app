import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { focusManager, onlineManager } from '@tanstack/react-query';
import * as Location from 'expo-location';
import i18n from '@/i18n';
import { authApi, driverApi, ridesApi } from '@/api/endpoints';
import { queryClient, qk } from '@/api/queries';
import type { Language } from '@/api/types';
import { onSignOut, useAuth } from '@/store/auth';
import { useRideStore } from '@/store/rides';
import { connectSocket, disconnectSocket, emitDriverLocation } from '@/realtime/socket';
import { registerPushToken } from '@/lib/push';
import { ensureLocationPermission } from '@/lib/location';

// React Query: refetch on app foreground.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (s) => {
    if (Platform.OS !== 'web') handleFocus(s === 'active');
  });
  return () => sub.remove();
});
onlineManager.setOnline(true);

onSignOut(() => {
  disconnectSocket();
  queryClient.clear();
  useRideStore.getState().reset();
});

/** Side effects tied to the signed-in session: socket, push token, ride restore, driver tracking. */
export function SessionEffects() {
  const token = useAuth((s) => s.token);
  const status = useAuth((s) => s.status);
  const userId = useAuth((s) => s.user?.id);
  const isOnline = useAuth((s) => !!s.user?.driverProfile?.isOnline);
  const pushRegisteredFor = useRef<number | null>(null);

  // Socket connection
  useEffect(() => {
    if (status === 'signedIn' && token) connectSocket(token);
    else if (status === 'signedOut') disconnectSocket();
  }, [status, token]);

  // Per-user one-time work: push token, language sync, restore active ride
  useEffect(() => {
    if (status !== 'signedIn' || !userId || pushRegisteredFor.current === userId) return;
    pushRegisteredFor.current = userId;
    void registerPushToken();

    const user = useAuth.getState().user;
    const lang = i18n.language as Language;
    if (user && (lang === 'ar' || lang === 'en') && user.language !== lang) {
      authApi
        .updateMe({ language: lang })
        .then(({ user: u }) => useAuth.getState().setUser(u))
        .catch(() => undefined);
    }

    ridesApi
      .current()
      .then(({ ride }) => {
        queryClient.setQueryData(qk.currentRide, ride);
        if (ride) useRideStore.getState().setPassengerRide(ride);
      })
      .catch(() => undefined);
  }, [status, userId]);

  return isOnline && status === 'signedIn' ? <DriverLocationTracker /> : null;
}

const SEND_EVERY_MS = 5000;

/** While the driver is online, watch the foreground location and send it every ~5 s. */
function DriverLocationTracker() {
  const last = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      if (!(await ensureLocationPermission()) || cancelled) return;
      try {
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: SEND_EVERY_MS, distanceInterval: 5 },
          (pos) => {
            last.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          },
        );
        if (cancelled) sub.remove();
      } catch {
        // location services unavailable
      }
    })();

    let restTick = 0;
    const timer = setInterval(() => {
      const p = last.current;
      if (!p) return;
      if (!emitDriverLocation(p.lat, p.lng)) {
        // socket down: fall back to REST every ~15 s
        restTick = (restTick + 1) % 3;
        if (restTick === 0) driverApi.location(p).catch(() => undefined);
      }
    }, SEND_EVERY_MS);

    return () => {
      cancelled = true;
      sub?.remove();
      clearInterval(timer);
    };
  }, []);

  return null;
}
