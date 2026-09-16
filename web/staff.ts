// Online mode's people: who else may sign in to this shop. Owners only — the
// server refuses anyone else (server/src/routes/users.ts), and the screen stays
// hidden from them (components/StaffSection.web.tsx).

import type { Screen } from '@/modules/auth/screens';
import { api, ApiError } from '@/web/api';
import { getSession, handleUnauthorized } from '@/web/session';

export type ShopRole = 'owner' | 'staff';

/** A person in this shop, exactly as the server describes them. */
export interface ShopUser {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
  role: ShopRole;
  active: boolean;
  /** Which tabs they may open; null is all of them. Owners ignore it. */
  screens: Screen[] | null;
}

/** Whoever is signed in this tab. The screen renders nothing for staff. */
export function isOwner(): boolean {
  return getSession()?.user.role === 'owner';
}

export function signedInUserId(): number | null {
  return getSession()?.user.id ?? null;
}

/**
 * An owner whose own account was switched off or given a new password
 * elsewhere keeps a token the server no longer honours: back to the gate.
 */
async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      handleUnauthorized();
      throw new Error('Please sign in again.');
    }
    throw e;
  }
}

export function listStaff(): Promise<ShopUser[]> {
  return guard(() => api<ShopUser[]>('/api/users', { method: 'GET' }));
}

export function addStaff(input: {
  username: string;
  displayName: string | null;
  password: string;
  role: ShopRole;
  screens: Screen[] | null;
}): Promise<ShopUser> {
  return guard(() => api<ShopUser>('/api/users', { body: input }));
}

/**
 * Only the fields passed are touched. A new password or being switched off
 * signs that person out of every device they were using.
 */
export function updateStaff(
  id: number,
  change: {
    displayName?: string | null;
    role?: ShopRole;
    active?: boolean;
    password?: string;
    screens?: Screen[] | null;
  },
): Promise<ShopUser> {
  return guard(() => api<ShopUser>(`/api/users/${id}`, { method: 'PATCH', body: change }));
}
