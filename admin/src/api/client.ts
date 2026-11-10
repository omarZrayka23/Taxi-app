import { API_BASE } from '../config';
import type { ApiErrorBody } from './types';

const TOKEN_KEY = 'minieh_admin_token';
const USER_KEY = 'minieh_admin_user';

export const tokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  getUserJson(): string | null {
    try {
      return localStorage.getItem(USER_KEY);
    } catch {
      return null;
    }
  },
  setUserJson(json: string) {
    localStorage.setItem(USER_KEY, json);
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** Error thrown for any non-2xx response (or network failure). */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message || err.code;
  if (err instanceof Error) return err.message;
  return 'Unexpected error';
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  /** JSON body (objects) or FormData for multipart. */
  body?: unknown;
  /** When true, a 401 does not trigger a global logout (used by the login call). */
  skipAuthRedirect?: boolean;
}

let unauthorizedHandler: (() => void) | null = null;

/** Registered by the auth provider: invoked on any 401 from an authenticated call. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenStorage.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body; // browser sets multipart boundary
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method: opts.method ?? 'GET', headers, body });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection or VITE_API_URL.');
  }

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!res.ok) {
    const errBody = (data as ApiErrorBody | undefined)?.error;
    const err = new ApiError(
      res.status,
      errBody?.code ?? `HTTP_${res.status}`,
      errBody?.message ?? (res.statusText || `Request failed (${res.status})`),
      errBody?.details,
    );
    if (res.status === 401 && !opts.skipAuthRedirect) {
      tokenStorage.clear();
      unauthorizedHandler?.();
    }
    throw err;
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => apiRequest<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body: body ?? {} }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => apiRequest<T>(path, { method: 'POST', body: form }),
};
