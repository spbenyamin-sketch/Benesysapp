// The web app's sign-in, kept in the browser. Online mode only — the phone's
// Offline mode never loads this file.

import type { Screen } from '@/modules/auth/screens';

export interface WebUser {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
  role: 'owner' | 'staff';
  /** Tabs the owner gave this person; null is all of them. */
  screens: Screen[] | null;
}

export interface WebSession {
  token: string;
  user: WebUser;
  shop: { id: number; name: string };
}

const KEY = 'benesys.session';

function load(): WebSession | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as WebSession) : null;
  } catch {
    return null;
  }
}

let current: WebSession | null = load();
const listeners = new Set<(s: WebSession | null) => void>();

export function getSession(): WebSession | null {
  return current;
}

export function setSession(next: WebSession | null): void {
  current = next;
  try {
    if (next) globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
    else globalThis.localStorage?.removeItem(KEY);
  } catch {
    // Private windows can refuse storage; the session still lasts this tab.
  }
  listeners.forEach((fn) => fn(next));
}

export function onSessionChange(fn: (s: WebSession | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The API lives on port 4747 of whichever machine served this page, so the
 * same build works on the shop PC (localhost) and from another device on the
 * shop's network. EXPO_PUBLIC_API_URL overrides it.
 */
export function apiUrl(path: string): string {
  const base =
    process.env.EXPO_PUBLIC_API_URL ??
    `${globalThis.location?.protocol ?? 'http:'}//${globalThis.location?.hostname ?? 'localhost'}:4747`;
  return `${base.replace(/\/$/, '')}${path}`;
}

export function authHeader(): Record<string, string> {
  return current ? { Authorization: `Bearer ${current.token}` } : {};
}

/** The server no longer accepts the token: back to the sign-in screen. */
export function handleUnauthorized(): void {
  setSession(null);
}
