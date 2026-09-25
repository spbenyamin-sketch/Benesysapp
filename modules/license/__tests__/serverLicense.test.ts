import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import {
  canonicalMessage,
  LICENSE_APP,
  LICENSE_VERSION,
  verifyLicense,
  type LicenseFile,
} from '@/modules/license/licenseFile';
import {
  acceptServerLicense,
  evaluateServerLicense,
  serverSystemId,
} from '@/modules/license/serverLicense';
import { WARN_DAYS } from '@/modules/license/status';

ed.hashes.sha512 = sha512;

// Online mode's licence is the only thing between a shop and an unlimited free
// install, so — like licenseFile.test.ts — these come at it from the attacker's
// side: another server's licence, another vendor's key, an edited expiry, and
// the clock wound back.

const SEED = 'c0ffee00c0ffee00c0ffee00c0ffee00';
const OTHER_SEED = 'deadbeefdeadbeefdeadbeefdeadbeef';
const TODAY = '2026-09-16';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
const utf8 = (text: string) => new TextEncoder().encode(text);

/** A throwaway vendor, so the tests never need the real private key on disk. */
function makeVendor() {
  const secretKey = ed.utils.randomSecretKey();
  const publicKeyHex = toHex(ed.getPublicKey(secretKey));

  const issue = (over: Partial<LicenseFile> = {}): string => {
    const base = {
      app: LICENSE_APP,
      v: LICENSE_VERSION,
      systemId: serverSystemId(SEED),
      expiry: '2027-08-10',
      issued: '2026-08-10',
      client: 'Sri Murugan Stores',
      ...over,
    };
    return JSON.stringify({
      ...base,
      sig: toHex(ed.sign(utf8(canonicalMessage(base)), secretKey)),
    });
  };

  return { publicKeyHex, issue };
}

const vendor = makeVendor();
const opts = { today: TODAY, publicKeyHex: vendor.publicKeyHex };

/** TODAY plus `days`, as ISO — for writing expiries relative to the test's today. */
function isoIn(days: number): string {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

describe('serverSystemId', () => {
  it('is the same every time for one server, and different for another', () => {
    expect(serverSystemId(SEED)).toBe(serverSystemId(SEED));
    expect(serverSystemId(SEED)).not.toBe(serverSystemId(OTHER_SEED));
  });

  it('looks like a phone System ID behind an SRV- prefix', () => {
    expect(serverSystemId(SEED)).toMatch(/^SRV-[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
  });

  it('never shows the seed itself — it is what the identity rests on', () => {
    expect(serverSystemId(SEED)).not.toContain(SEED.slice(0, 8).toUpperCase());
  });
});

describe('evaluateServerLicense', () => {
  const row = (
    over: { license?: string | null; lastSeen?: string | null; trialStart?: string | null } = {},
  ) => ({
    seed: SEED,
    license: null,
    lastSeen: null,
    trialStart: null,
    ...over,
  });

  it('is unlicensed before anything has been installed', () => {
    const status = evaluateServerLicense(row(), opts);
    expect(status.state).toBe('unlicensed');
    expect(status.systemId).toBe(serverSystemId(SEED));
    expect(status.expiry).toBeUndefined();
  });

  it('runs a 7-day trial from its first check, then locks', () => {
    expect(evaluateServerLicense(row({ trialStart: TODAY }), opts)).toMatchObject({
      state: 'trial',
      daysLeft: 6,
      trial: true,
    });
    expect(evaluateServerLicense(row({ trialStart: isoIn(-6) }), opts).state).toBe('trial');
    expect(evaluateServerLicense(row({ trialStart: isoIn(-7) }), opts)).toMatchObject({
      state: 'expired',
      trial: true,
    });
  });

  it('refuses a trial whose clock was wound back', () => {
    expect(evaluateServerLicense(row({ trialStart: isoIn(-2), lastSeen: isoIn(1) }), opts).state).toBe(
      'rolledBack',
    );
  });

  it('lets a licence take over from the trial', () => {
    const status = evaluateServerLicense(
      row({ trialStart: isoIn(-30), license: vendor.issue({ expiry: isoIn(90) }) }),
      opts,
    );
    expect(status.state).toBe('active');
    expect(status.trial).toBeUndefined();
  });

  it('is active with a licence for this server, and reports the days left', () => {
    const status = evaluateServerLicense(row({ license: vendor.issue({ expiry: isoIn(90) }) }), opts);
    expect(status.state).toBe('active');
    expect(status.daysLeft).toBe(90);
    expect(status.client).toBe('Sri Murugan Stores');
  });

  it('warns for the last week rather than waiting for the lockout', () => {
    expect(evaluateServerLicense(row({ license: vendor.issue({ expiry: isoIn(WARN_DAYS + 1) }) }), opts).state).toBe(
      'active',
    );
    expect(evaluateServerLicense(row({ license: vendor.issue({ expiry: isoIn(WARN_DAYS) }) }), opts).state).toBe(
      'expiring',
    );
    // The expiry date itself is still a working day.
    expect(evaluateServerLicense(row({ license: vendor.issue({ expiry: TODAY }) }), opts).state).toBe('expiring');
  });

  it('expires the day after the expiry date', () => {
    const status = evaluateServerLicense(row({ license: vendor.issue({ expiry: isoIn(-1) }) }), opts);
    expect(status.state).toBe('expired');
    expect(status.daysLeft).toBe(-1);
  });

  it('locks when the computer’s clock has been wound back', () => {
    const status = evaluateServerLicense(
      row({ license: vendor.issue({ expiry: isoIn(90) }), lastSeen: isoIn(30) }),
      opts,
    );
    expect(status.state).toBe('rolledBack');
  });

  it('is content when the clock has only moved on', () => {
    expect(
      evaluateServerLicense(
        row({ license: vendor.issue({ expiry: isoIn(90) }), lastSeen: isoIn(-30) }),
        opts,
      ).state,
    ).toBe('active');
  });

  // Each of these is a way of getting a licence a shop was never sold. The
  // stored row is re-verified on every check, so none of them survives a reload.
  it('refuses another server’s licence, even installed straight into the row', () => {
    const stolen = vendor.issue({ systemId: serverSystemId(OTHER_SEED) });
    expect(evaluateServerLicense(row({ license: stolen }), opts).state).toBe('unlicensed');
  });

  it('refuses a phone’s licence — the SRV- prefix keeps the two apart', () => {
    const phones = vendor.issue({ systemId: '9F3C-11AB-7E20-04D5' });
    expect(evaluateServerLicense(row({ license: phones }), opts).state).toBe('unlicensed');
  });

  it('refuses a licence whose expiry was edited after signing', () => {
    const edited = JSON.stringify({ ...JSON.parse(vendor.issue()), expiry: '2099-01-01' });
    expect(evaluateServerLicense(row({ license: edited }), opts).state).toBe('unlicensed');
  });

  it('refuses a licence signed by somebody else’s key', () => {
    const attacker = makeVendor();
    expect(evaluateServerLicense(row({ license: attacker.issue() }), opts).state).toBe('unlicensed');
  });

  it('refuses a row of rubbish without throwing', () => {
    for (const license of ['', 'not json', '{}', '[]', '{ half a licence']) {
      expect(evaluateServerLicense(row({ license }), opts).state).toBe('unlicensed');
    }
  });
});

describe('acceptServerLicense', () => {
  it('takes a licence issued for this server', () => {
    const result = acceptServerLicense(SEED, vendor.issue({ expiry: isoIn(365) }), opts);
    expect(result.ok).toBe(true);
    expect(result.license?.client).toBe('Sri Murugan Stores');
  });

  it('reads one pasted out of a WhatsApp message, greeting and all', () => {
    const pasted = `Here you go 👇\n\n${vendor.issue({ expiry: isoIn(365) })}\n\nThanks!`;
    expect(acceptServerLicense(SEED, pasted, opts).ok).toBe(true);
  });

  it('says so, in words, when the licence belongs to a different server', () => {
    const result = acceptServerLicense(OTHER_SEED, vendor.issue(), opts);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/different server/);
  });

  it('refuses a licence that has already run out, rather than storing a lockout', () => {
    const result = acceptServerLicense(SEED, vendor.issue({ expiry: isoIn(-1) }), opts);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/expired on/);
  });

  it('accepts one expiring today — the last day is still a working day', () => {
    expect(acceptServerLicense(SEED, vendor.issue({ expiry: TODAY }), opts).ok).toBe(true);
  });

  it('refuses anything that is not a licence at all', () => {
    expect(acceptServerLicense(SEED, 'please let me in', opts).reason).toMatch(/not a licence/);
  });
});

describe('the two modes cannot lend each other a licence', () => {
  it('a server licence is refused by the phone’s check, and the other way round', () => {
    const phone = '9F3C-11AB-7E20-04D5';
    const forServer = vendor.issue();
    expect(verifyLicense(forServer, phone, vendor.publicKeyHex).valid).toBe(false);
    expect(verifyLicense(forServer, phone, vendor.publicKeyHex).reason).toMatch(/different phone/);

    const forPhone = vendor.issue({ systemId: phone });
    expect(verifyLicense(forPhone, serverSystemId(SEED), vendor.publicKeyHex, 'server').reason).toMatch(
      /different server/,
    );
  });
});
