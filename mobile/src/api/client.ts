import { API_BASE } from '@/config';
import type { PickedFile } from './types';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Code used when the request never reached the server. */
export const NETWORK_ERROR = 'NETWORK_ERROR';

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken() {
  return authToken;
}
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query?: Query) {
  let url = `${API_BASE}${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }
  return url;
}

const TIMEOUT_MS = 20000;

async function request<T>(
  method: string,
  path: string,
  opts: { body?: unknown; query?: Query; form?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form as unknown as BodyInit; // fetch sets multipart boundary itself
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.form ? TIMEOUT_MS * 3 : TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method, headers, body, signal: controller.signal });
  } catch (e) {
    throw new ApiError(0, NETWORK_ERROR, e instanceof Error ? e.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    const apiErr = new ApiError(
      res.status,
      err?.code ?? (res.status === 401 ? 'UNAUTHORIZED' : `HTTP_${res.status}`),
      err?.message ?? res.statusText ?? 'Request failed',
      err?.details,
    );
    if (res.status === 401 && authToken && unauthorizedHandler) unauthorizedHandler();
    throw apiErr;
  }
  return data as T;
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, { form }),
};

/** Append a local file to FormData the way React Native's fetch expects. */
export function appendFile(form: FormData, field: string, file: PickedFile) {
  form.append(field, { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
}
