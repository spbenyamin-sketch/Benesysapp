// Issue a licence file from the terminal — the same thing keygen.html does,
// without opening a browser.
//
//   node tools/issue-license.mjs <SystemID> <expiry> ["Shop name"]
//
//   node tools/issue-license.mjs 9F3C-11AB-7E20-04D5 1y "Sri Murugan Stores"
//   node tools/issue-license.mjs 9F3C-11AB-7E20-04D5 2027-08-10
//   node tools/issue-license.mjs SRV-9F3C-11AB-7E20-04D5 1y "Sri Murugan Stores"
//   node tools/issue-license.mjs --check tools/issued/9F3C11AB7E2004D5.lic
//
// The ID is a phone's System ID (Offline mode) or a server's Server ID, which
// wears an SRV- prefix so this folder says which is which. Same licence, same
// key, same command — only the shop's activation screen differs.
//
// Expiry is either an ISO date or a duration from today: 30d, 6m, 1y, 3y.
//
// The signing rules below must match modules/license/licenseFile.ts exactly.
// modules/license/__tests__/issue-license.test.ts runs this script and checks
// the app still accepts what it produces, so a drift fails there rather than in
// a client's hands.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

ed.hashes.sha512 = sha512;

const here = dirname(fileURLToPath(import.meta.url));
const PRIVATE_PATH = join(here, 'vendor-private-key.txt');
const OUT_DIR = join(here, 'issued');

// ── Must match modules/license/licenseFile.ts exactly ────────────────────────
const LICENSE_APP = 'billing-app';
const LICENSE_VERSION = 1;

function canonicalMessage(l) {
  return [
    l.app,
    String(l.v),
    (l.systemId || '').trim().toUpperCase(),
    l.expiry,
    l.issued,
    l.client || '',
  ].join('|');
}

function isValidDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  const back = new Date(Date.UTC(y, mo - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() + 1 === mo && back.getUTCDate() === d;
}
// ── end shared rules ─────────────────────────────────────────────────────────

const toHex = (bytes) => Buffer.from(bytes).toString('hex');
const utf8 = (text) => new TextEncoder().encode(text);
const iso = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/** Both nine characters wide, so the printed block still lines up. */
const idLabel = (id) => ((id ?? '').toUpperCase().startsWith('SRV-') ? 'Server ID' : 'System ID');

function die(message) {
  console.error(message);
  process.exit(1);
}

function loadSecretKey() {
  if (!existsSync(PRIVATE_PATH)) {
    die(
      `No signing key at ${PRIVATE_PATH}.\n` +
        'Restore it from your backup, or run `node tools/new-vendor-key.mjs` to start over\n' +
        '(which invalidates every licence already issued).',
    );
  }
  const hex = readFileSync(PRIVATE_PATH, 'utf8').split('\n')[0].trim();
  if (!/^[0-9a-f]{64}$/i.test(hex)) die(`${PRIVATE_PATH} does not start with a 64-character hex key.`);
  return Uint8Array.from(hex.match(/.{2}/g).map((byte) => parseInt(byte, 16)));
}

/** "2027-08-10" | "30d" | "6m" | "1y" → ISO date. */
function resolveExpiry(input) {
  if (isValidDate(input)) return input.trim();

  const m = /^(\d+)\s*([dmy])$/i.exec((input || '').trim());
  if (!m) {
    die(`Cannot read "${input}" as an expiry. Use 2027-08-10, or 30d / 6m / 1y.`);
  }
  const count = Number(m[1]);
  const date = new Date();
  if (m[2].toLowerCase() === 'd') date.setDate(date.getDate() + count);
  else if (m[2].toLowerCase() === 'm') date.setMonth(date.getMonth() + count);
  else date.setFullYear(date.getFullYear() + count);
  return iso(date);
}

function check(path) {
  const license = JSON.parse(readFileSync(path, 'utf8'));
  const publicKey = ed.getPublicKey(loadSecretKey());
  const signature = Uint8Array.from((license.sig || '').match(/.{2}/g) ?? [], (b) => parseInt(b, 16));
  let ok = false;
  try {
    ok = ed.verify(signature, utf8(canonicalMessage(license)), publicKey);
  } catch {
    ok = false;
  }
  console.log(ok ? 'VALID' : 'INVALID');
  console.log(`  ${idLabel(license.systemId)}  ${license.systemId}`);
  console.log(`  Expires    ${license.expiry}${license.expiry < iso(new Date()) ? '  (already past)' : ''}`);
  if (license.client) console.log(`  Issued to  ${license.client}`);
  process.exit(ok ? 0 : 1);
}

// ── Arguments ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv[0] === '--check') {
  if (!argv[1]) die('Usage: node tools/issue-license.mjs --check <file.lic>');
  check(resolve(argv[1]));
}

const outFlag = argv.indexOf('--out');
const outPath = outFlag >= 0 ? argv[outFlag + 1] : null;
const positional = outFlag >= 0 ? [...argv.slice(0, outFlag), ...argv.slice(outFlag + 2)] : argv;
const force = positional.includes('--force');
const [systemIdRaw, expiryRaw, clientRaw] = positional.filter((a) => a !== '--force');

if (!systemIdRaw || !expiryRaw) {
  die(
    'Usage: node tools/issue-license.mjs <SystemID> <expiry> ["Shop name"]\n' +
      '       the ID is a phone\'s System ID, or a server\'s SRV- Server ID\n' +
      '       expiry is 2027-08-10, or a duration: 30d / 6m / 1y / 3y\n\n' +
      '  node tools/issue-license.mjs 9F3C-11AB-7E20-04D5 1y "Sri Murugan Stores"\n' +
      '  node tools/issue-license.mjs SRV-9F3C-11AB-7E20-04D5 1y "Sri Murugan Stores"\n' +
      '  node tools/issue-license.mjs --check tools/issued/9F3C11AB7E2004D5.lic',
  );
}

const systemId = systemIdRaw.trim().toUpperCase();
// A phone's System ID, or the same thing behind SRV- for a shop's server. The
// prefix is part of what gets signed, so a server's licence can never be pasted
// into a phone and the vendor's issued/ folder says which is which.
if (!/^(SRV-)?[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(systemId)) {
  die(
    `"${systemIdRaw}" is not a System ID. A phone's looks like 9F3C-11AB-7E20-04D5,` +
      ' a server\'s like SRV-9F3C-11AB-7E20-04D5.',
  );
}

const expiry = resolveExpiry(expiryRaw);
const issued = iso(new Date());
if (expiry < issued && !force) {
  die(`That expiry (${expiry}) is already past. Pass --force if you really mean it.`);
}

// ── Sign and write ───────────────────────────────────────────────────────────
const base = {
  app: LICENSE_APP,
  v: LICENSE_VERSION,
  systemId,
  expiry,
  issued,
  client: (clientRaw ?? '').trim(),
};
const license = { ...base, sig: toHex(ed.sign(utf8(canonicalMessage(base)), loadSecretKey())) };

const target = outPath
  ? resolve(outPath)
  : join(OUT_DIR, `${systemId.replace(/-/g, '')}-${expiry}.lic`);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(license, null, 2)}\n`, 'utf8');

console.log('Licence written.');
console.log(`  file       ${target}`);
console.log(`  ${idLabel(systemId)}  ${systemId}`);
console.log(`  expires    ${expiry}`);
if (license.client) console.log(`  issued to  ${license.client}`);

// Sending the licence as a WhatsApp message beats sending a file: the client
// copies and pastes it instead of saving a download and finding it in the
// picker. Printed on one line so a terminal copy stays one line.
console.log('\nPaste this into WhatsApp — the client pastes it back into the app and taps Activate:\n');
console.log(JSON.stringify(license));
