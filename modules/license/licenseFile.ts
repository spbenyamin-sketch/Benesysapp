// The licence itself: a small signed JSON file the vendor sends over WhatsApp.
//
// WHY A SIGNATURE AND NOT A TYPED KEY
// A short key the client can type has to be checked against a secret the app
// carries — and a secret that can CHECK a key can also MINT one, so decompiling
// the APK hands over the keygen. Ed25519 splits that in two: the vendor's
// machine holds the private half and this app only ever sees the public half
// (modules/license/publicKey.ts). Pulling the public key out of the bundle buys
// an attacker nothing; forging a licence means breaking Ed25519.
//
// The price is length — a signature is 64 bytes, far past what anyone will type
// off a phone screen — so the licence travels as a `.lic` file the client taps
// to import, the same picker the Drive restore already uses.

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { isValidDate } from './dates';
import { VENDOR_PUBLIC_KEY } from './publicKey';

// noble-ed25519 has no hash of its own; on React Native there is no WebCrypto to
// fall back to, so wire the sync SHA-512 in once, here, before anything verifies.
ed.hashes.sha512 = sha512;

export const LICENSE_APP = 'billing-app';
export const LICENSE_VERSION = 1;
/** Suggested filename for a client's licence — `BENE-9F3C11AB.lic` and so on. */
export const LICENSE_EXTENSION = '.lic';

export interface LicenseFile {
  app: string;
  v: number;
  /** The System ID this licence is bound to. */
  systemId: string;
  /** ISO 'YYYY-MM-DD' — the last day the app opens. */
  expiry: string;
  /** ISO 'YYYY-MM-DD' the vendor issued it. Shown, and signed, never enforced. */
  issued: string;
  /** Shop name, for the vendor's own records. Part of the signature. */
  client: string;
  /** Ed25519 signature over canonicalMessage(), hex. */
  sig: string;
}

export interface LicenseCheck {
  valid: boolean;
  license?: LicenseFile;
  reason?: string;
}

/**
 * EXACTLY what gets signed. Field order and separators are part of the format —
 * tools/keygen.html builds the same string, and any difference on either side
 * turns every licence into a rejection.
 */
export function canonicalMessage(license: Omit<LicenseFile, 'sig'>): string {
  return [
    license.app,
    String(license.v),
    license.systemId.trim().toUpperCase(),
    license.expiry,
    license.issued,
    license.client ?? '',
  ].join('|');
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function utf8(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 4);
  let n = 0;
  for (const char of text) {
    let code = char.codePointAt(0)!;
    if (code < 0x80) {
      out[n++] = code;
    } else if (code < 0x800) {
      out[n++] = 0xc0 | (code >> 6);
      out[n++] = 0x80 | (code & 0x3f);
    } else if (code < 0x10000) {
      out[n++] = 0xe0 | (code >> 12);
      out[n++] = 0x80 | ((code >> 6) & 0x3f);
      out[n++] = 0x80 | (code & 0x3f);
    } else {
      out[n++] = 0xf0 | (code >> 18);
      out[n++] = 0x80 | ((code >> 12) & 0x3f);
      out[n++] = 0x80 | ((code >> 6) & 0x3f);
      out[n++] = 0x80 | (code & 0x3f);
    }
  }
  return out.slice(0, n);
}

/**
 * Pull the licence out of whatever the client actually pasted.
 *
 * Sending the licence as a WhatsApp message is easier for a shop than saving a
 * file and hunting for it in the picker, and a message arrives with a greeting
 * wrapped around it as often as not. Anything outside the outermost braces is
 * dropped rather than failing the parse.
 */
function isolateJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return text.trim();
  return text.slice(start, end + 1);
}

/** Parse the text of a .lic file. Shape only — the signature is checked later. */
export function parseLicense(text: string): LicenseFile | null {
  let data: unknown;
  try {
    data = JSON.parse(isolateJson(text));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const l = data as Record<string, unknown>;
  if (
    typeof l.app !== 'string' ||
    typeof l.v !== 'number' ||
    typeof l.systemId !== 'string' ||
    typeof l.expiry !== 'string' ||
    typeof l.issued !== 'string' ||
    typeof l.sig !== 'string'
  ) {
    return null;
  }
  return {
    app: l.app,
    v: l.v,
    systemId: l.systemId,
    expiry: l.expiry,
    issued: l.issued,
    client: typeof l.client === 'string' ? l.client : '',
    sig: l.sig,
  };
}

/**
 * Check a licence against this device.
 *
 * Order matters for the message the client sees: shape, then "is this even our
 * app", then the device binding, then the signature. A licence issued for
 * another phone should say so rather than "corrupt file".
 */
export function verifyLicense(
  input: string | LicenseFile,
  systemId: string,
  /** Overridable so the tests can sign with a throwaway key instead of the real one. */
  publicKeyHex: string = VENDOR_PUBLIC_KEY,
  /**
   * What the System ID names, for the one message that has to say it out loud.
   * A phone in Offline mode; in Online mode the shop's server.
   */
  subject: 'phone' | 'server' = 'phone',
): LicenseCheck {
  const license = typeof input === 'string' ? parseLicense(input) : input;
  if (!license) return { valid: false, reason: 'That file is not a licence file.' };

  if (license.app !== LICENSE_APP) {
    return { valid: false, reason: 'That licence belongs to a different app.' };
  }
  if (license.v !== LICENSE_VERSION) {
    return { valid: false, reason: 'That licence was made for a newer version of the app.' };
  }
  if (!isValidDate(license.expiry) || !isValidDate(license.issued)) {
    return { valid: false, reason: 'That licence has an unreadable date in it.' };
  }
  if (license.systemId.trim().toUpperCase() !== systemId.trim().toUpperCase()) {
    return { valid: false, reason: `That licence was issued for a different ${subject}.` };
  }

  const signature = hexToBytes(license.sig);
  const publicKey = hexToBytes(publicKeyHex);
  if (!signature || signature.length !== 64 || !publicKey) {
    return { valid: false, reason: 'That licence is damaged.' };
  }

  let ok = false;
  try {
    ok = ed.verify(signature, utf8(canonicalMessage(license)), publicKey);
  } catch {
    // A malformed point throws rather than returning false.
    ok = false;
  }
  if (!ok) return { valid: false, reason: 'That licence has been altered.' };

  return { valid: true, license };
}
