import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { verifyLicense } from '@/modules/license/licenseFile';
import { acceptServerLicense, serverSystemId } from '@/modules/license/serverLicense';

// tools/issue-license.mjs is the terminal version of keygen.html, and like it
// carries its own copy of the signing rules — a standalone script cannot import
// the app's TypeScript. So this actually runs the script and feeds what comes out
// to the app's verifier: if the two ever drift, it fails here rather than in a
// client's hands.
//
// It signs with the real vendor key, which is gitignored, so a fresh clone skips
// the whole file instead of failing.

const REPO = join(__dirname, '..', '..', '..');
const SCRIPT = join(REPO, 'tools', 'issue-license.mjs');
const hasKey = existsSync(join(REPO, 'tools', 'vendor-private-key.txt'));

const DEVICE = '9F3C-11AB-7E20-04D5';
// Online mode's half: a real seed, so the Server ID is derived exactly the way a
// shop's server derives the one it puts on screen.
const SEED = 'c0ffee00c0ffee00c0ffee00c0ffee00';

function issue(args: string[]): { path: string; text: string } {
  const dir = mkdtempSync(join(tmpdir(), 'lic-'));
  const path = join(dir, 'out.lic');
  execFileSync(process.execPath, [SCRIPT, ...args, '--out', path], { encoding: 'utf8' });
  return { path, text: readFileSync(path, 'utf8') };
}

function issueFails(args: string[]): string {
  try {
    issue(args);
  } catch (e) {
    // execFileSync throws on a non-zero exit; the script's message is on stderr.
    return String((e as { stderr?: string }).stderr ?? e);
  }
  throw new Error('expected the script to refuse those arguments');
}

const maybe = hasKey ? describe : describe.skip;

maybe('tools/issue-license.mjs', () => {
  it('issues a licence the app accepts', () => {
    const { text } = issue([DEVICE, '2027-08-10', 'Sri Murugan Stores']);
    const result = verifyLicense(text, DEVICE);
    expect(result.valid).toBe(true);
    expect(result.license?.expiry).toBe('2027-08-10');
    expect(result.license?.client).toBe('Sri Murugan Stores');
  });

  it('accepts a duration instead of a date', () => {
    const { text } = issue([DEVICE, '30d']);
    const result = verifyLicense(text, DEVICE);
    expect(result.valid).toBe(true);
    const days =
      (Date.parse(result.license!.expiry) - Date.parse(result.license!.issued)) / 86400000;
    expect(days).toBe(30);
  });

  it('binds the licence to the System ID given, and no other', () => {
    const { text } = issue([DEVICE, '1y']);
    expect(verifyLicense(text, DEVICE).valid).toBe(true);
    expect(verifyLicense(text, '1A2B-3C4D-5E6F-0718').valid).toBe(false);
  });

  it('normalises a lowercase System ID', () => {
    const { text } = issue([DEVICE.toLowerCase(), '1y']);
    expect(verifyLicense(text, DEVICE).valid).toBe(true);
  });

  it('leaves the shop name empty when none is given', () => {
    const { text } = issue([DEVICE, '1y']);
    expect(verifyLicense(text, DEVICE).license?.client).toBe('');
  });

  it('refuses a System ID of the wrong shape', () => {
    expect(issueFails(['not-an-id', '1y'])).toMatch(/is not a System ID/);
    expect(issueFails(['SRV-not-an-id', '1y'])).toMatch(/is not a System ID/);
  });

  // The same script, the same key, the same file — only the ID says which kind
  // of install is being licensed. If that ever stopped being true, a shop's
  // server would be unactivatable and this is where it would show.
  it('issues a licence a shop’s SERVER accepts', () => {
    const { text } = issue([serverSystemId(SEED), '1y', 'Sri Murugan Stores']);
    const result = acceptServerLicense(SEED, text);
    expect(result.reason).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.license?.client).toBe('Sri Murugan Stores');
  });

  it('binds a server licence to that server, and not to a phone', () => {
    const { text } = issue([serverSystemId(SEED), '1y']);
    expect(acceptServerLicense('a-different-seed', text).ok).toBe(false);
    expect(verifyLicense(text, DEVICE).valid).toBe(false);
  });

  it('refuses an unreadable expiry', () => {
    expect(issueFails([DEVICE, 'next tuesday'])).toMatch(/Cannot read/);
    expect(issueFails([DEVICE, '2027-02-31'])).toMatch(/Cannot read/);
  });

  it('refuses a date already in the past unless forced', () => {
    expect(issueFails([DEVICE, '2020-01-01'])).toMatch(/already past/);
    expect(verifyLicense(issue([DEVICE, '2020-01-01', '--force']).text, DEVICE).valid).toBe(true);
  });

  it('checks a licence back', () => {
    const { path } = issue([DEVICE, '1y']);
    const output = execFileSync(process.execPath, [SCRIPT, '--check', path], { encoding: 'utf8' });
    expect(output).toMatch(/^VALID/);
  });

  it('reports an altered licence as invalid', () => {
    const { path, text } = issue([DEVICE, '1y']);
    const tampered = JSON.stringify({ ...JSON.parse(text), expiry: '2099-01-01' });
    require('fs').writeFileSync(path, tampered);
    let output = '';
    try {
      execFileSync(process.execPath, [SCRIPT, '--check', path], { encoding: 'utf8' });
    } catch (e) {
      output = String((e as { stdout?: string }).stdout ?? '');
    }
    expect(output).toMatch(/^INVALID/);
  });
});
