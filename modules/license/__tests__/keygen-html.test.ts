import { readFileSync } from 'fs';
import { join } from 'path';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import {
  canonicalMessage,
  LICENSE_APP,
  LICENSE_VERSION,
  verifyLicense,
  type LicenseFile,
} from '@/modules/license/licenseFile';

ed.hashes.sha512 = sha512;

// tools/keygen.html signs licences and carries its own copy of the rules — it has
// to, because it runs standalone in a browser with nothing imported. That
// duplication is the one thing that can silently break licensing: change the
// canonical message on one side and every licence issued afterwards is refused,
// with no sign of trouble until a client is locked out of their shop.
//
// So this lifts the crypto half out of the HTML and runs it against the app's own
// code. It is not testing the page — only that the two halves still agree.

const TOOLS = join(__dirname, '..', '..', '..', 'tools');
const START = '// ── Must match modules/license/licenseFile.ts exactly';
const END = '// ── Page wiring';

interface KeygenApi {
  canonicalMessage: (license: Omit<LicenseFile, 'sig'>) => string;
  signLicense: (
    secretKeyHex: string,
    fields: Omit<LicenseFile, 'app' | 'v' | 'sig'>,
  ) => Promise<LicenseFile>;
  checkLicense: (
    text: string,
    publicKeyHex: string,
  ) => Promise<{ valid: boolean; license?: LicenseFile; reason?: string }>;
}

/** Evaluate the generator's logic with none of its DOM wiring. */
function loadKeygen(): KeygenApi {
  // The page loads the library as a plain script; do the same, so this covers
  // the vendored copy in tools/ rather than the one in node_modules.
  const win: Record<string, unknown> = {};
  // eslint-disable-next-line no-new-func
  new Function('window', readFileSync(join(TOOLS, 'noble-ed25519.js'), 'utf8'))(win);

  const html = readFileSync(join(TOOLS, 'keygen.html'), 'utf8');
  const from = html.indexOf(START);
  const to = html.indexOf(END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error('keygen.html no longer has the expected script markers');
  }

  // eslint-disable-next-line no-new-func
  return new Function(
    'window',
    `${html.slice(from, to)}\nreturn { canonicalMessage, signLicense, checkLicense };`,
  )(win) as KeygenApi;
}

const keygen = loadKeygen();
const DEVICE = '9F3C-11AB-7E20-04D5';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
const utf8 = (text: string) => new TextEncoder().encode(text);

const secretKey = ed.utils.randomSecretKey();
const publicKeyHex = toHex(ed.getPublicKey(secretKey));
const secretHex = toHex(secretKey);

const FIELDS = {
  systemId: DEVICE,
  expiry: '2027-08-10',
  issued: '2026-08-10',
  client: 'Sri Murugan Stores',
};

describe('tools/keygen.html', () => {
  it('builds the same signed message as the app', () => {
    const license = { app: LICENSE_APP, v: LICENSE_VERSION, ...FIELDS };
    expect(keygen.canonicalMessage(license)).toBe(canonicalMessage(license));
  });

  it('issues licences the app accepts', async () => {
    const license = await keygen.signLicense(secretHex, FIELDS);
    const result = verifyLicense(JSON.stringify(license), DEVICE, publicKeyHex);
    expect(result.valid).toBe(true);
    expect(result.license?.expiry).toBe('2027-08-10');
    expect(result.license?.client).toBe('Sri Murugan Stores');
  });

  it('stamps the app name and format version itself', async () => {
    const license = await keygen.signLicense(secretHex, FIELDS);
    expect(license.app).toBe(LICENSE_APP);
    expect(license.v).toBe(LICENSE_VERSION);
    expect(license.sig).toMatch(/^[0-9a-f]{128}$/);
  });

  it('normalises the System ID the same way, so a lowercase one still works', async () => {
    const license = await keygen.signLicense(secretHex, { ...FIELDS, systemId: DEVICE.toLowerCase() });
    expect(verifyLicense(license, DEVICE, publicKeyHex).valid).toBe(true);
  });

  it('checks back a licence the app-side code signed', async () => {
    const base = { app: LICENSE_APP, v: LICENSE_VERSION, ...FIELDS };
    const license = { ...base, sig: toHex(ed.sign(utf8(canonicalMessage(base)), secretKey)) };
    const result = await keygen.checkLicense(JSON.stringify(license), publicKeyHex);
    expect(result.valid).toBe(true);
  });

  it('rejects an edited licence, same as the app', async () => {
    const license = await keygen.signLicense(secretHex, FIELDS);
    const tampered = JSON.stringify({ ...license, expiry: '2099-01-01' });
    expect((await keygen.checkLicense(tampered, publicKeyHex)).valid).toBe(false);
    expect(verifyLicense(tampered, DEVICE, publicKeyHex).valid).toBe(false);
  });

  it('refuses to sign with a key that is not 32 bytes', async () => {
    await expect(keygen.signLicense('abcd', FIELDS)).rejects.toThrow(/64 hex/);
  });
});
