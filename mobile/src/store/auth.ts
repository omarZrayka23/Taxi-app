import { create } from 'zustand';
import { ApiError, setAuthToken, setUnauthorizedHandler } from '@/api/client';
import { authApi } from '@/api/endpoints';
import type { DriverProfile, OwnerProfile, User } from '@/api/types';
import { KEYS, storage } from '@/lib/storage';

export type AppMode = 'passenger' | 'driver' | 'owner';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  token: string | null;
  user: User | null;
  /** Mode the user selected (may be unavailable — see effectiveMode). */
  mode: AppMode;
  /** Set when the stored session could not be validated because the server was unreachable. */
  bootError: boolean;
  bootstrap: () => Promise<void>;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
  setDriverProfile: (p: DriverProfile) => void;
  setOwnerProfile: (p: OwnerProfile) => void;
  refreshUser: () => Promise<User | null>;
  setMode: (mode: AppMode) => Promise<void>;
}

const signOutListeners = new Set<() => void>();
export function onSignOut(fn: () => void) {
  signOutListeners.add(fn);
  return () => signOutListeners.delete(fn);
}

export const useAuth = create<AuthState>()((set, get) => ({
  status: 'loading',
  token: null,
  user: null,
  mode: 'passenger',
  bootError: false,

  bootstrap: async () => {
    set({ status: 'loading', bootError: false });
    const [token, mode] = await Promise.all([storage.get(KEYS.token), storage.get(KEYS.mode)]);
    const m: AppMode = mode === 'driver' || mode === 'owner' ? mode : 'passenger';
    if (!token) {
      set({ status: 'signedOut', token: null, user: null, mode: m });
      return;
    }
    setAuthToken(token);
    try {
      const { user } = await authApi.me();
      set({ status: 'signedIn', token, user, mode: m });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        await get().signOut();
      } else {
        // server unreachable: keep the token and let the UI offer a retry
        set({ status: 'loading', token, mode: m, bootError: true });
      }
    }
  },

  signIn: async (token, user) => {
    setAuthToken(token);
    await storage.set(KEYS.token, token);
    set({ status: 'signedIn', token, user, bootError: false });
  },

  signOut: async () => {
    // Stop push notifications for this account on this device. Fire-and-forget: the request captures the
    // token synchronously, so it still authenticates after we clear it below, and an offline logout is not blocked.
    if (get().token) authApi.updateMe({ expoPushToken: null }).catch(() => undefined);
    setAuthToken(null);
    await storage.remove(KEYS.token);
    await storage.set(KEYS.mode, 'passenger');
    set({ status: 'signedOut', token: null, user: null, mode: 'passenger', bootError: false });
    signOutListeners.forEach((fn) => fn());
  },

  setUser: (user) => set({ user }),
  setDriverProfile: (p) => {
    const u = get().user;
    if (u) set({ user: { ...u, driverProfile: p } });
  },
  setOwnerProfile: (p) => {
    const u = get().user;
    if (u) set({ user: { ...u, ownerProfile: p } });
  },

  refreshUser: async () => {
    try {
      const { user } = await authApi.me();
      set({ user });
      return user;
    } catch {
      return get().user;
    }
  },

  setMode: async (mode) => {
    await storage.set(KEYS.mode, mode);
    set({ mode });
  },
}));

setUnauthorizedHandler(() => {
  void useAuth.getState().signOut();
});

export function canUseDriverMode(user: User | null) {
  const s = user?.driverProfile?.status;
  return s === 'APPROVED' || s === 'SUSPENDED';
}
export function canUseOwnerMode(user: User | null) {
  return user?.ownerProfile?.status === 'APPROVED';
}

export function effectiveMode(user: User | null, mode: AppMode): AppMode {
  if (mode === 'driver' && canUseDriverMode(user)) return 'driver';
  if (mode === 'owner' && canUseOwnerMode(user)) return 'owner';
  return 'passenger';
}
