// Local-only account: there is no server, so the credentials live on the device
// in SecureStore (Android Keystore), NOT in the SQLite database.
//
// That placement is deliberate: `restoreBackup()` wipes and reloads every table,
// so a DB-stored password would be destroyed (or silently replaced by someone
// else's) the moment a backup is restored. Keeping it in SecureStore means a
// restore can never lock the owner out of their own app.

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { getLockCapability, promptUnlock } from './lock';

const K_EMAIL = 'auth.email';
const K_USERNAME = 'auth.username';
const K_SALT = 'auth.salt';
const K_HASH = 'auth.hash';
const K_SESSION = 'auth.session';

/** Rounds of SHA-256. Cheap on a phone (~100ms) but makes a stolen-hash
 *  brute force meaningfully slower than a single digest. */
const ROUNDS = 1000;

export interface Account {
  email: string;
  username: string;
}

async function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

async function derive(password: string, salt: string): Promise<string> {
  let h = `${salt}:${password}`;
  for (let i = 0; i < ROUNDS; i++) h = await sha256(h);
  return h;
}

function randomSalt(): string {
  const bytes = Crypto.getRandomBytes(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Validation (shared with the sign-up form so messages stay consistent) ─────
export function validateEmail(email: string): string | null {
  const v = email.trim();
  if (!v) return 'Email is required.';
  // Deliberately loose: we cannot verify an address offline, we only guard typos.
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
  if (password.length < 4) return 'Password needs at least 4 characters.';
  return null;
}

// ── Account lifecycle ────────────────────────────────────────────────────────

/** Has anyone signed up on this device yet? Drives first-run vs login. */
export async function isRegistered(): Promise<boolean> {
  return (await SecureStore.getItemAsync(K_HASH)) !== null;
}

export async function getAccount(): Promise<Account | null> {
  const [email, username] = await Promise.all([
    SecureStore.getItemAsync(K_EMAIL),
    SecureStore.getItemAsync(K_USERNAME),
  ]);
  if (!email || !username) return null;
  return { email, username };
}

export async function signUp(input: {
  email: string;
  username: string;
  password: string;
}): Promise<Account> {
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();
  const problem =
    validateEmail(email) ?? validateUsername(username) ?? validatePassword(input.password);
  if (problem) throw new Error(problem);

  const salt = randomSalt();
  const hash = await derive(input.password, salt);
  await Promise.all([
    SecureStore.setItemAsync(K_EMAIL, email),
    SecureStore.setItemAsync(K_USERNAME, username),
    SecureStore.setItemAsync(K_SALT, salt),
    SecureStore.setItemAsync(K_HASH, hash),
  ]);
  await SecureStore.setItemAsync(K_SESSION, '1');
  return { email, username };
}

/** Accepts either the username or the email as the identifier. */
export async function signIn(identifier: string, password: string): Promise<Account> {
  const [email, username, salt, hash] = await Promise.all([
    SecureStore.getItemAsync(K_EMAIL),
    SecureStore.getItemAsync(K_USERNAME),
    SecureStore.getItemAsync(K_SALT),
    SecureStore.getItemAsync(K_HASH),
  ]);
  if (!email || !username || !salt || !hash) throw new Error('No account on this device yet.');

  const id = identifier.trim().toLowerCase();
  if (id !== username.toLowerCase() && id !== email) {
    throw new Error('Wrong username or password.');
  }
  const attempt = await derive(password, salt);
  if (attempt !== hash) throw new Error('Wrong username or password.');

  await SecureStore.setItemAsync(K_SESSION, '1');
  return { email, username };
}

export async function isSignedIn(): Promise<boolean> {
  return (await SecureStore.getItemAsync(K_SESSION)) === '1';
}

export async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(K_SESSION);
}

export async function changePassword(current: string, next: string): Promise<void> {
  const [salt, hash] = await Promise.all([
    SecureStore.getItemAsync(K_SALT),
    SecureStore.getItemAsync(K_HASH),
  ]);
  if (!salt || !hash) throw new Error('No account on this device yet.');
  if ((await derive(current, salt)) !== hash) throw new Error('Current password is wrong.');
  const problem = validatePassword(next);
  if (problem) throw new Error(problem);

  const nextSalt = randomSalt();
  await Promise.all([
    SecureStore.setItemAsync(K_SALT, nextSalt),
    SecureStore.setItemAsync(K_HASH, await derive(next, nextSalt)),
  ]);
}

/**
 * Forgotten password. There is no server to email a link, and the hash cannot be
 * reversed, so the only proof available offline is the phone's own screen lock —
 * the same fingerprint/PIN the app lock already trusts. Whoever can unlock this
 * phone can already open its gallery and its WhatsApp; letting them set a new
 * billing password is not a new key, it is the one they already hold.
 *
 * Nothing is reset if the prompt is cancelled or nothing is enrolled: the caller
 * is told what to do instead, which is restoring a backup onto a fresh install.
 */
export async function resetPasswordWithDeviceLock(next: string): Promise<void> {
  const problem = validatePassword(next);
  if (problem) throw new Error(problem);
  if (!(await SecureStore.getItemAsync(K_HASH))) {
    throw new Error('No account on this device yet.');
  }

  const { enrolled } = await getLockCapability();
  if (!enrolled) {
    throw new Error(
      'This phone has no fingerprint, PIN or pattern set, so there is no way to prove the phone is yours. Set a screen lock in the phone’s own settings and try again.',
    );
  }
  if (!(await promptUnlock())) throw new Error('Phone lock check failed — password not changed.');

  const salt = randomSalt();
  await Promise.all([
    SecureStore.setItemAsync(K_SALT, salt),
    SecureStore.setItemAsync(K_HASH, await derive(next, salt)),
  ]);
}

export async function updateEmail(email: string): Promise<void> {
  const problem = validateEmail(email);
  if (problem) throw new Error(problem);
  await SecureStore.setItemAsync(K_EMAIL, email.trim().toLowerCase());
}
