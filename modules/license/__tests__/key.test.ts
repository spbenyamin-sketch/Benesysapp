import { createHash } from 'crypto';
import {
  dateFromDayNumber,
  dayNumber,
  daysBetween,
  formatKey,
  generateKey,
  normalizeKey,
  todayISO,
  verifyKey,
} from '@/modules/license/key';

// The app hashes with expo-crypto and tools/keygen.html with WebCrypto; both are
// plain SHA-256, so Node's stands in here. A key minted by any of the three has
// to verify in the other two — that is what these tests are really pinning.
const sha256 = async (input: string) =>
  createHash('sha256').update(input, 'utf8').digest('hex');

const DEVICE = '9F3C-11AB-7E20-04D5';
const OTHER_DEVICE = '1A2B-3C4D-5E6F-0718';

describe('dayNumber / dateFromDayNumber', () => {
  it('round-trips every date it accepts', async () => {
    for (const iso of ['2020-01-01', '2026-08-10', '2027-02-28', '2028-02-29', '2099-12-31']) {
      expect(dateFromDayNumber(dayNumber(iso))).toBe(iso);
    }
  });

  it('starts counting at the epoch', () => {
    expect(dayNumber('2020-01-01')).toBe(0);
    expect(dayNumber('2020-01-02')).toBe(1);
  });

  it('rejects a date that does not exist', () => {
    // Date.UTC would silently roll these into the next month.
    expect(dayNumber('2026-02-31')).toBeNaN();
    expect(dayNumber('2027-02-29')).toBeNaN();
    expect(dayNumber('2026-13-01')).toBeNaN();
  });

  it('rejects anything that is not an ISO day', () => {
    expect(dayNumber('10/08/2026')).toBeNaN();
    expect(dayNumber('')).toBeNaN();
  });
});

describe('daysBetween', () => {
  it('counts forward and backward', () => {
    expect(daysBetween('2026-08-10', '2026-08-17')).toBe(7);
    expect(daysBetween('2026-08-10', '2026-08-10')).toBe(0);
    expect(daysBetween('2026-08-10', '2026-08-09')).toBe(-1);
  });
});

describe('todayISO', () => {
  it('formats in the phone timezone, not UTC', () => {
    // 00:30 local on the 10th is still the 9th in UTC — an expiry check must not
    // lose a day to that.
    expect(todayISO(new Date(2026, 7, 10, 0, 30))).toBe('2026-08-10');
  });
});

describe('normalizeKey / formatKey', () => {
  it('accepts a key however it was typed', () => {
    const raw = 'A1B2C3D4E5F60718293A';
    expect(normalizeKey('a1b2-c3d4-e5f6-0718-293a')).toBe(raw);
    expect(normalizeKey('A1B2 C3D4 E5F6 0718 293A')).toBe(raw);
    expect(normalizeKey(raw)).toBe(raw);
  });

  it('rejects the wrong length or non-hex characters', () => {
    expect(normalizeKey('A1B2-C3D4')).toBeNull();
    expect(normalizeKey('ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ')).toBeNull();
    expect(normalizeKey('')).toBeNull();
  });

  it('groups in fours for reading aloud', () => {
    expect(formatKey('A1B2C3D4E5F60718293A')).toBe('A1B2-C3D4-E5F6-0718-293A');
  });
});

describe('generateKey', () => {
  it('produces a 20-character key in five groups', async () => {
    const key = await generateKey(DEVICE, '2027-08-10', sha256);
    expect(key).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/);
    expect(normalizeKey(key)).toHaveLength(20);
  });

  it('is deterministic — the same inputs always mint the same key', async () => {
    const a = await generateKey(DEVICE, '2027-08-10', sha256);
    const b = await generateKey(DEVICE, '2027-08-10', sha256);
    expect(a).toBe(b);
  });

  it('gives two devices different keys for the same date', async () => {
    const a = await generateKey(DEVICE, '2027-08-10', sha256);
    const b = await generateKey(OTHER_DEVICE, '2027-08-10', sha256);
    expect(a).not.toBe(b);
  });

  it('gives one device different keys for different dates', async () => {
    const a = await generateKey(DEVICE, '2027-08-10', sha256);
    const b = await generateKey(DEVICE, '2027-08-11', sha256);
    expect(a).not.toBe(b);
  });

  it('ignores the case and spacing of the System ID', async () => {
    const a = await generateKey(DEVICE, '2027-08-10', sha256);
    const b = await generateKey(`  ${DEVICE.toLowerCase()}  `, '2027-08-10', sha256);
    expect(a).toBe(b);
  });

  it('refuses an impossible date', async () => {
    await expect(generateKey(DEVICE, '2026-02-31', sha256)).rejects.toThrow(/real date/);
    await expect(generateKey(DEVICE, '2019-12-31', sha256)).rejects.toThrow(/range/);
  });

  it('refuses an empty System ID', async () => {
    await expect(generateKey('', '2027-08-10', sha256)).rejects.toThrow(/System ID/);
  });
});

describe('verifyKey', () => {
  it('reads the expiry back out of a key it minted', async () => {
    for (const expiry of ['2026-08-11', '2027-01-01', '2030-12-31', '2099-01-15']) {
      const key = await generateKey(DEVICE, expiry, sha256);
      expect(await verifyKey(DEVICE, key, sha256)).toEqual({ valid: true, expiry });
    }
  });

  it('accepts the key however the client types it', async () => {
    const key = await generateKey(DEVICE, '2027-08-10', sha256);
    const messy = key.toLowerCase().replace(/-/g, ' ');
    expect((await verifyKey(DEVICE, messy, sha256)).valid).toBe(true);
  });

  it('rejects a key minted for another device — this is the device lock', async () => {
    const key = await generateKey(OTHER_DEVICE, '2027-08-10', sha256);
    const result = await verifyKey(DEVICE, key, sha256);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/this device/);
  });

  it('rejects a key with a single character altered', async () => {
    const raw = normalizeKey(await generateKey(DEVICE, '2027-08-10', sha256))!;
    for (const pos of [0, 5, 10, 19]) {
      const flipped =
        raw.slice(0, pos) + (raw[pos] === 'A' ? 'B' : 'A') + raw.slice(pos + 1);
      expect((await verifyKey(DEVICE, flipped, sha256)).valid).toBe(false);
    }
  });

  it('rejects a key of the wrong length', async () => {
    const result = await verifyKey(DEVICE, 'A1B2-C3D4', sha256);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/20 characters/);
  });

  it('does not accept a made-up key', async () => {
    // 200 random keys, none of them minted — a 64-bit signature should turn
    // every one of them away.
    for (let i = 0; i < 200; i++) {
      const guess = Array.from({ length: 20 }, (_, n) => '0123456789ABCDEF'[(i * 7 + n * 13) % 16]).join('');
      expect((await verifyKey(DEVICE, guess, sha256)).valid).toBe(false);
    }
  });
});
