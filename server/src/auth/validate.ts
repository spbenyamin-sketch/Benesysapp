import { isScreen, type Screen } from '@/modules/auth/screens';
import { badRequest } from '../http/errors';

// The same rules the app's sign-up form uses (modules/auth/service.ts), except
// the password: that one guarded a phone in the owner's pocket, this one guards
// a server anyone on the network can try.

export const MIN_PASSWORD = 8;

function str(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return typeof v === 'string' ? v : '';
}

export function readUsername(body: Record<string, unknown>, key = 'username'): string {
  const v = str(body, key).trim().toLowerCase();
  if (v.length < 3) throw badRequest('Username needs at least 3 characters.');
  if (v.length > 40) throw badRequest('Username can be at most 40 characters.');
  if (!/^[a-z0-9._-]+$/.test(v)) {
    throw badRequest('Use letters, numbers, dot, dash or underscore only.');
  }
  return v;
}

export function readEmail(body: Record<string, unknown>, required: boolean): string | null {
  const v = str(body, 'email').trim().toLowerCase();
  if (!v) {
    if (required) throw badRequest('Email is required.');
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw badRequest('Enter a valid email address.');
  return v;
}

export function readPassword(body: Record<string, unknown>, key = 'password'): string {
  const v = str(body, key);
  if (v.length < MIN_PASSWORD) {
    throw badRequest(`Password needs at least ${MIN_PASSWORD} characters.`);
  }
  // scrypt would take it, but nobody types this much and it bounds the work.
  if (v.length > 200) throw badRequest('Password is too long.');
  return v;
}

/**
 * Which tabs a staff member may open. Absent leaves it alone; `null` clears the
 * restriction (all of them). Duplicates are dropped so the column stays tidy.
 */
export function readScreens(value: unknown): Screen[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value)) throw badRequest('screens must be a list.');
  const bad = value.find((s) => !isScreen(s));
  if (bad !== undefined) throw badRequest(`${String(bad)} is not a screen.`);
  return [...new Set(value as Screen[])];
}

export function readName(body: Record<string, unknown>, key: string, label: string): string {
  const v = str(body, key).trim();
  if (!v) throw badRequest(`${label} is required.`);
  if (v.length > 120) throw badRequest(`${label} is too long.`);
  return v;
}

export function readOptionalName(body: Record<string, unknown>, key: string): string | null {
  const v = str(body, key).trim();
  return v ? v.slice(0, 120) : null;
}
