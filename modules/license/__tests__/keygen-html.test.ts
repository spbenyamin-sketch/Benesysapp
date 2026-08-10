import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { generateKey, verifyKey } from '@/modules/license/key';

// tools/keygen.html is the vendor's generator and carries its own copy of the
// secret and the key layout — it has to, because it runs standalone in a browser
// with nothing imported. That duplication is the one thing that can silently
// break licensing: change the algorithm on one side and every key minted after
// that is rejected on the other, with no error until a client is locked out.
//
// So this test lifts the crypto half of that file out of the HTML and runs it
// against the app's own implementation. It is not testing the page — only that
// the two halves still agree.

const HTML_PATH = join(__dirname, '..', '..', '..', 'tools', 'keygen.html');
const START = '// ── Must match modules/license/secret.ts exactly';
const END = '// ── Page wiring';

interface KeygenExports {
  generateKey: (systemId: string, expiry: string) => Promise<string>;
  verifyKey: (
    systemId: string,
    key: string,
  ) => Promise<{ valid: boolean; expiry?: string; reason?: string }>;
  SECRET: string;
}

/** Evaluate the generator's logic with none of its DOM wiring. */
function loadKeygen(): KeygenExports {
  const html = readFileSync(HTML_PATH, 'utf8');
  const from = html.indexOf(START);
  const to = html.indexOf(END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error('keygen.html no longer has the expected script markers');
  }
  const source = html.slice(from, to);
  // eslint-disable-next-line no-new-func
  return new Function(`${source}\nreturn { generateKey, verifyKey, SECRET };`)() as KeygenExports;
}

const sha256 = async (input: string) => createHash('sha256').update(input, 'utf8').digest('hex');

const DEVICE = '9F3C-11AB-7E20-04D5';
const keygen = loadKeygen();

describe('tools/keygen.html', () => {
  it('carries the same secret as the app', async () => {
    const { LICENSE_SECRET } = await import('@/modules/license/secret');
    expect(keygen.SECRET).toBe(LICENSE_SECRET);
  });

  it('mints keys the app accepts', async () => {
    for (const expiry of ['2026-09-01', '2027-08-10', '2031-03-15']) {
      const key = await keygen.generateKey(DEVICE, expiry);
      expect(await verifyKey(DEVICE, key, sha256)).toEqual({ valid: true, expiry });
    }
  });

  it('mints the exact same key the app would', async () => {
    const expiry = '2027-08-10';
    expect(await keygen.generateKey(DEVICE, expiry)).toBe(
      await generateKey(DEVICE, expiry, sha256),
    );
  });

  it('accepts a key the app generated, so the vendor can check one back', async () => {
    const key = await generateKey(DEVICE, '2028-01-31', sha256);
    expect(await keygen.verifyKey(DEVICE, key)).toEqual({ valid: true, expiry: '2028-01-31' });
  });

  it('turns away a key from a different device, same as the app', async () => {
    const key = await keygen.generateKey('1A2B-3C4D-5E6F-0718', '2027-08-10');
    expect((await keygen.verifyKey(DEVICE, key)).valid).toBe(false);
    expect((await verifyKey(DEVICE, key, sha256)).valid).toBe(false);
  });
});
