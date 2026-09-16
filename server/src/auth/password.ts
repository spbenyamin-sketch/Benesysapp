import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt from Node itself — no native add-on to build on Windows or a server.
// Stored as `scrypt$N$r$p$salt$hash` so the cost can be raised later without
// invalidating passwords already set: verify reads the parameters back.

const N = 1 << 16;
const r = 8;
const p = 1;
const KEYLEN = 32;

function derive(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem must clear 128 * N * r bytes, or Node refuses the parameters.
    scrypt(password, salt, KEYLEN, { ...opts, maxmem: 256 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r, p });
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, rr, pp, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(password, Buffer.from(salt, 'base64url'), {
    N: Number(n),
    r: Number(rr),
    p: Number(pp),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * A real hash of nothing in particular. Sign-in checks against it when the
 * username doesn't exist, so a wrong username takes as long as a wrong password
 * and the response time doesn't reveal which usernames are real.
 */
export const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'));
