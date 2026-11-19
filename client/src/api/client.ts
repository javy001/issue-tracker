import type { ApiErrorBody, ErrorCode } from '@tracker/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Typed fetch wrapper used by every React Query hook (§9.5). Errors follow §7.3.
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      body?.error.code ?? 'INTERNAL',
      body?.error.message ?? res.statusText,
      body?.error.details,
    );
  }
  return (await res.json()) as T;
}
