import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setUnauthorizedHandler, tokenStorage } from '../api/client';
import { authApi } from '../api/endpoints';
import type { User } from '../api/types';

export class NotAdminError extends Error {
  constructor() {
    super('This account is not an administrator. Only ADMIN users can sign in to the admin panel.');
    this.name = 'NotAdminError';
  }
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (phone: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function readStoredUser(): User | null {
  if (!tokenStorage.get()) return null;
  const json = tokenStorage.getUserJson();
  if (!json) return null;
  try {
    const u = JSON.parse(json) as User;
    return u.role === 'ADMIN' ? u : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser);
  const queryClient = useQueryClient();

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  // Any 401 from the API logs the admin out (the router then redirects to /login).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      queryClient.clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  // Refresh the stored user once on startup to make sure the token is still valid.
  useEffect(() => {
    if (!tokenStorage.get()) return;
    authApi
      .me()
      .then(({ user: fresh }) => {
        if (fresh.role !== 'ADMIN' || fresh.status === 'BLOCKED') {
          logout();
          return;
        }
        tokenStorage.setUserJson(JSON.stringify(fresh));
        setUser(fresh);
      })
      .catch(() => {
        /* 401 handled globally; ignore network errors so the panel still loads */
      });
  }, [logout]);

  const login = useCallback(async (phone: string, password: string) => {
    const { token, user: u } = await authApi.login(phone, password);
    if (u.role !== 'ADMIN') throw new NotAdminError();
    tokenStorage.set(token);
    tokenStorage.setUserJson(JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, isAuthenticated: !!user, login, logout }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
