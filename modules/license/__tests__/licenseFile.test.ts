import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import {
  canonicalMessage,
  LICENSE_APP,
  LICENSE_VERSION,
  parseLicense,
  verifyLicense,
  type LicenseFile,
} from '@/modules/license/licenseFile';
import { VENDOR_PUBLIC_KEY } from '@/modules/license/publicKey';

ed.hashes.sha512 = sha512;

// A licence is the only thing standing between a client and a free copy, so
// these tests come at it from the attacker's side: alter a field, swap the
// phone, re-sign with your own key, and check every one of them is refused.

const DEVICE = '9F3C-11AB-7E20-04D5';
const OTHER_DEVICE = '1A2B-3C4D-5E6F-0718';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
const utf8 = (text: string) => new TextEncoder().encode(text);

/** A throwaway vendor, so the tests never need the real private key on disk. */
function makeVendor() {
  const secretKey = ed.utils.randomSecretKey();
  const publicKey = toHex(ed.getPublicKey(secretKey));

  const issue = (over: Partial<LicenseFile> = {}): LicenseFile => {
    const base = {
      app: LICENSE_APP,
      v: LICENSE_VERSION,
      systemId: DEVICE,
      expiry: '2027-08-10',
      issued: '2026-08-10',
      client: 'Sri Murugan Stores',
      ...over,
    };
    return { ...base, sig: toHex(ed.sign(utf8(canonicalMessage(base)), secretKey)) };
  };

  return { publicKey, issue };
}

const vendor = makeVendor();

describe('canonicalMessage', () => {
  it('normalises the System ID so case and spacing cannot change the signature', () => {
    const base = {
      app: LICENSE_APP,
      v: LICENSE_VERSION,
      systemId: '  9f3c-11ab-7e20-04d5 ',
      expiry: '2027-08-10',
      issued: '2026-08-10',
      client: '',
    };
    expect(canonicalMessage(base)).toBe(canonicalMessage({ ...base, systemId: DEVICE }));
  });

  it('covers every field — changing any one changes what was signed', () => {
    const base = {
      app: LICENSE_APP,
      v: LICENSE_VERSION,
      systemId: DEVICE,
      expiry: '2027-08-10',
      issued: '2026-08-10',
      client: 'Shop',
    };
    const original = canonicalMessage(base);
    expect(canonicalMessage({ ...base, expiry: '2027-08-11' })).not.toBe(original);
    expect(canonicalMessage({ ...base, systemId: OTHER_DEVICE })).not.toBe(original);
    expect(canonicalMessage({ ...base, issued: '2026-08-11' })).not.toBe(original);
    expect(canonicalMessage({ ...base, client: 'Other' })).not.toBe(original);
  });
});

describe('parseLicense', () => {
  it('reads a well-formed file', () => {
    const license = vendor.issue();
    expect(parseLicense(JSON.stringify(license))).toEqual(license);
  });

  it('defaults a missing shop name to empty rather than failing', () => {
    const { client, ...withoutClient } = vendor.issue();
    expect(parseLicense(JSON.stringify(withoutClient))?.client).toBe('');
  });

  it('returns null for anything that is not a licence', () => {
    expect(parseLicense('not json at all')).toBeNull();
    expect(parseLicense('[]')).toBeNull();
    expect(parseLicense('{"app":"billing-app"}')).toBeNull();
    expect(parseLicense('')).toBeNull();
  });
});

describe('verifyLicense', () => {
  it('accepts a licence issued for this phone', () => {
    const license = vendor.issue();
    const result = verifyLicense(JSON.stringify(license), DEVICE, vendor.publicKey);
    expect(result.valid).toBe(true);
    expect(result.license?.expiry).toBe('2027-08-10');
    expect(result.license?.client).toBe('Sri Murugan Stores');
  });

  it('accepts an already-parsed licence too', () => {
    expect(verifyLicense(vendor.issue(), DEVICE, vendor.publicKey).valid).toBe(true);
  });

  it('ignores case and spacing in the System ID', () => {
    const license = vendor.issue();
    expect(verifyLicense(license, '  9f3c-11ab-7e20-04d5  ', vendor.publicKey).valid).toBe(true);
  });

  it('refuses a licence issued for another phone — this is the device lock', () => {
    const license = vendor.issue({ systemId: OTHER_DEVICE });
    const result = verifyLicense(license, DEVICE, vendor.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/different phone/);
  });

  it('refuses a licence whose expiry was edited after signing', () => {
    const license = { ...vendor.issue(), expiry: '2099-01-01' };
    const result = verifyLicense(license, DEVICE, vendor.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/altered/);
  });

  it('refuses a licence whose System ID was swapped to this phone after signing', () => {
    // The obvious forgery: take a friend's licence, paste your own System ID in.
    const license = { ...vendor.issue({ systemId: OTHER_DEVICE }), systemId: DEVICE };
    expect(verifyLicense(license, DEVICE, vendor.publicKey).valid).toBe(false);
  });

  it('refuses a licence signed by someone else’s key', () => {
    const attacker = makeVendor();
    const license = attacker.issue();
    const result = verifyLicense(license, DEVICE, vendor.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/altered/);
  });

  it('refuses a licence for a different app or a newer format', () => {
    expect(verifyLicense(vendor.issue({ app: 'other-app' }), DEVICE, vendor.publicKey).reason).toMatch(
      /different app/,
    );
    expect(verifyLicense(vendor.issue({ v: 99 }), DEVICE, vendor.publicKey).reason).toMatch(
      /newer version/,
    );
  });

  it('refuses an unreadable date instead of guessing at it', () => {
    expect(verifyLicense(vendor.issue({ expiry: '2027-02-31' }), DEVICE, vendor.publicKey).reason).toMatch(
      /unreadable date/,
    );
    expect(verifyLicense(vendor.issue({ expiry: '10/08/2027' }), DEVICE, vendor.publicKey).reason).toMatch(
      /unreadable date/,
    );
  });

  it('refuses a damaged or truncated signature without throwing', () => {
    for (const sig of ['', 'zz', 'ab', 'f'.repeat(126), 'f'.repeat(128)]) {
      expect(verifyLicense({ ...vendor.issue(), sig }, DEVICE, vendor.publicKey).valid).toBe(false);
    }
  });
});

describe('the vendor key that ships in the app', () => {
  it('is a real 32-byte Ed25519 public key', () => {
    expect(VENDOR_PUBLIC_KEY).toMatch(/^[0-9a-f]{64}$/);
  });

  // Only runs on the vendor's own machine — the private key is gitignored, so a
  // fresh clone skips this rather than failing.
  const PRIVATE_PATH = join(__dirname, '..', '..', '..', 'tools', 'vendor-private-key.txt');
  const hasPrivateKey = existsSync(PRIVATE_PATH);

  (hasPrivateKey ? it : it.skip)('matches tools/vendor-private-key.txt', () => {
    const secretHex = readFileSync(PRIVATE_PATH, 'utf8').split('\n')[0].trim();
    const secretKey = Uint8Array.from(
      (secretHex.match(/.{2}/g) ?? []).map((byte) => parseInt(byte, 16)),
    );
    expect(toHex(ed.getPublicKey(secretKey))).toBe(VENDOR_PUBLIC_KEY);
  });

  (hasPrivateKey ? it : it.skip)('signs licences the shipped app accepts', () => {
    const secretHex = readFileSync(PRIVATE_PATH, 'utf8').split('\n')[0].trim();
    const secretKey = Uint8Array.from(
      (secretHex.match(/.{2}/g) ?? []).map((byte) => parseInt(byte, 16)),
    );
    const base = {
      app: LICENSE_APP,
      v: LICENSE_VERSION,
      systemId: DEVICE,
      expiry: '2027-08-10',
      issued: '2026-08-10',
      client: '',
    };
    const license = { ...base, sig: toHex(ed.sign(utf8(canonicalMessage(base)), secretKey)) };
    // No public key passed — this goes through the one compiled into the app.
    expect(verifyLicense(license, DEVICE).valid).toBe(true);
  });
});
