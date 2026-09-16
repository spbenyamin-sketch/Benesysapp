// One JSON request to the Online mode server, carrying the signed-in shop's
// token. Shared by the account service (modules/auth/service.web.ts) and the
// people screen (web/staff.ts); web/rpc.ts speaks the separate /api/rpc shape.

import { apiUrl, authHeader } from '@/web/session';

/** A reply the server refused. `status` lets a caller tell 401 from the rest. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: init.method ?? 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error('Cannot reach the server. Check that it is running.');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Server error (${res.status}).`);
  return data;
}
