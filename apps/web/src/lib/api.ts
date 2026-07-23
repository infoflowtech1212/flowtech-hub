import type { ApiError } from '@flowtech/shared';

/**
 * Thin typed fetch wrapper. The SPA only ever calls same-origin `/api/*`
 * (proxied to the BFF in dev). Credentials are included so the httpOnly
 * session cookie flows; the browser never sees a Graph token.
 */
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** Read a non-httpOnly cookie (used for the double-submit CSRF token). */
function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.split('=')[1];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const csrf = readCookie('ft_csrf');
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      // Attach the CSRF token on state-changing requests (double-submit).
      ...(method !== 'GET' && csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let body: ApiError | undefined;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiRequestError(
      res.status,
      body?.error.code ?? 'http_error',
      body?.error.message ?? res.statusText,
      body?.error.requestId,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Upload raw file bytes (e.g. SharePoint document upload). */
async function uploadFile<T>(path: string, file: File): Promise<T> {
  const csrf = readCookie('ft_csrf');
  const res = await fetch(`/api${path}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}),
    },
    body: file,
  });
  if (!res.ok) {
    let body: ApiError | undefined;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      /* ignore */
    }
    throw new ApiRequestError(
      res.status,
      body?.error.code ?? 'upload_failed',
      body?.error.message ?? res.statusText,
      body?.error.requestId,
    );
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  uploadFile,
};
