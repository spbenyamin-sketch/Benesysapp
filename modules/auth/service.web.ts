// The web app's account: the same exports as service.ts, but the login is the
// shop's account on the server (Online mode) instead of one kept on the phone.
// Settings' account section and sign-out work unchanged on top of it.

import { api as request } from '@/web/api';
import { getSession, handleUnauthorized, setSession, type WebSession } from '@/web/session';

export interface Account {
  email: string;
  username: string;
}

const toAccount = (s: WebSession): Account => ({
  email: s.user.email ?? '',
  username: s.user.username,
});

// ── Validation — the server's rules, so the form can say it before sending ──
export function validateEmail(email: string): string | null {
  const v = email.trim();
  if (!v) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address.';
  return null;
}

export function validateUsername(username: string): string | null {
  const v = username.trim();
  if (v.length < 3) return 'Username needs at least 3 characters.';
  if (!/^[a-zA-Z0-9._-]+$/.test(v)) return 'Use letters, numbers, dot, dash or underscore only.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password needs at least 8 characters.';
  return null;
}

// ── Account lifecycle ────────────────────────────────────────────────────────

/** On the server anyone can sign in; there is no "first run" in the browser. */
export async function isRegistered(): Promise<boolean> {
  return true;
}

export async function getAccount(): Promise<Account | null> {
  const s = getSession();
  return s ? toAccount(s) : null;
}

/** A new shop with this person as its owner. */
export async function registerShop(input: {
  shopName: string;
  email: string;
  username: string;
  password: string;
}): Promise<Account> {
  const session = await request<WebSession>('/api/auth/register', { body: input });
  setSession(session);
  return toAccount(session);
}

export async function signUp(input: { email: string; username: string; password: string }): Promise<Account> {
  return registerShop({ ...input, shopName: input.username });
}

export async function signIn(identifier: string, password: string): Promise<Account> {
  const session = await request<WebSession>('/api/auth/login', { body: { identifier, password } });
  setSession(session);
  return toAccount(session);
}

export async function isSignedIn(): Promise<boolean> {
  return getSession() !== null;
}

/**
 * Still accepted by the server? A token revoked elsewhere signs this tab out.
 * The reply is also the current account, so a change the owner made — a new
 * role, different screens — takes effect as soon as the page is reopened.
 */
export async function checkSession(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;
  try {
    const fresh = await request<Pick<WebSession, 'user' | 'shop'>>('/api/auth/me', {
      method: 'GET',
    });
    setSession({ ...session, user: fresh.user, shop: fresh.shop });
    return true;
  } catch (e) {
    if ((e as Error).message !== 'Cannot reach the server. Check that it is running.') {
      handleUnauthorized();
      return false;
    }
    throw e;
  }
}

export async function signOut(): Promise<void> {
  try {
    await request('/api/auth/logout');
  } catch {
    // Signed out locally either way; an unreachable server can't keep you in.
  }
  setSession(null);
}

export async function changePassword(current: string, next: string): Promise<void> {
  await request('/api/auth/password', { body: { current, next } });
}

export async function updateEmail(_email: string): Promise<void> {
  throw new Error('Ask the shop owner to change the email on the server account.');
}
