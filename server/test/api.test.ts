import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { after, before, describe, it } from 'node:test';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createParty } from '@/modules/parties/service';
import { allowedOrigin, createApp } from '../src/app';
import { MAX_IP_FAILURES, registerShop } from '../src/auth/service';
import { control, pool } from '../src/db/client';
import { ApiError } from '../src/http/errors';
import { inShop, requireAuth } from '../src/http/middleware';
import { isOwnerOnly, OWNER_ONLY, STAFF_SETTINGS } from '../src/routes/rpc';
import { registry } from '../src/rpc/registry';

// Runs the API in-process against the database in .env.test, which is wiped
// first. Never point .env.test at a database with real books in it.

const app = createApp();

// A route that writes to the shop and then fails, to prove the write is undone.
app.post('/api/test/write-then-fail', requireAuth, inShop, async () => {
  await createParty({ name: 'Should never be saved' });
  throw new ApiError(400, 'failed on purpose');
});

async function call(method: string, url: string, opts: { token?: string; json?: unknown } = {}) {
  const res = await app.request(url, {
    method,
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

/** Call one of the app's service functions the way the web app does. */
const rpc = (token: string, module: string, fn: string, ...args: unknown[]) => {
  const undef = args.flatMap((a, i) => (a === undefined ? [i] : []));
  return call('POST', `/api/rpc/${module}/${fn}`, { token, json: { args, undef } });
};

const register = (shopName: string, username: string) =>
  call('POST', '/api/auth/register', {
    json: { shopName, username, email: `${username}@example.com`, password: 'owner-pass-1' },
  });

/**
 * A further shop on the same server. The API takes only the first sign-up (one
 * shop per install), so the suites that need shops of their own — and the one
 * proving two shops cannot see each other — make them in-process, the only way
 * there is. Answers in the same shape as `register`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same as `call`'s parsed JSON
async function registerAnother(shopName: string, username: string): Promise<{ status: number; data: any }> {
  try {
    const data = await registerShop(
      {
        shopName,
        username: username.toLowerCase(),
        email: `${username.toLowerCase()}@example.com`,
        password: 'owner-pass-1',
        displayName: null,
      },
      { anotherShop: true },
    );
    return { status: 201, data };
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, data: { error: e.message } };
    throw e;
  }
}

before(async () => {
  const shopSchemas = await pool.query<{ nspname: string }>(
    `select nspname from pg_namespace where nspname like 'shop\\_%'`,
  );
  for (const { nspname } of shopSchemas.rows) await pool.query(`drop schema "${nspname}" cascade`);
  await pool.query('drop schema if exists drizzle cascade');
  await pool.query('drop schema public cascade');
  await pool.query('create schema public');
  await migrate(control, { migrationsFolder: path.join(__dirname, '../drizzle/control') });
});

after(() => pool.end());

// ── Licensing ────────────────────────────────────────────────────────────────
//
// Online mode is licensed per INSTALLATION, so this suite has to come first:
// every one below it needs an activated server, and it is the last `it` here
// that activates this one.
//
// The licence is signed with the vendor's real key, through the vendor's real
// script, because the server verifies against the public key compiled into the
// app and there is deliberately no way to turn that off — a switch for the tests
// would be a switch on a shop's computer too. So these tests need
// tools/vendor-private-key.txt, which is what the vendor's own machine has.

const ISSUE = path.join(__dirname, '..', '..', 'tools', 'issue-license.mjs');

/** Sign a licence for `systemId` exactly as `node tools/issue-license.mjs` does. */
function issueLicense(systemId: string, expiry: string, force = false): string {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'lic-')), 'server.lic');
  execFileSync(
    process.execPath,
    [ISSUE, systemId, expiry, 'Test Shop', ...(force ? ['--force'] : []), '--out', out],
    { encoding: 'utf8' },
  );
  return readFileSync(out, 'utf8');
}

describe('licensing this installation', () => {
  let owner = '';
  let serverId = '';
  let licenseText = '';

  before(async () => {
    if (!existsSync(path.join(__dirname, '..', '..', 'tools', 'vendor-private-key.txt'))) {
      throw new Error(
        'The server tests activate the test server with a real licence, so they need\n' +
          'tools/vendor-private-key.txt. Restore it from your backup (see LICENSE-SETUP.md).',
      );
    }
    // The one sign-up this server will ever take through the API.
    assert.deepEqual((await call('GET', '/api/auth/setup')).data, { canRegister: true });
    owner = (await register('Licence Holder', 'licenceholder')).data.token;
  });

  it('runs a fresh install as a 7-day free trial', async () => {
    const res = await call('GET', '/api/license', { token: owner });
    assert.equal(res.status, 200);
    assert.equal(res.data.state, 'trial');
    assert.equal(res.data.daysLeft, 6);
    assert.equal((await rpc(owner, 'parties', 'listParties')).status, 200);
  });

  it('refuses the shop’s own calls once the trial has run out', async () => {
    await pool.query(`update server_license set trial_start = '2020-01-01'`);
    const parties = await rpc(owner, 'parties', 'listParties');
    assert.equal(parties.status, 403);
    assert.match(parties.data.error, /free trial ended/);
    // The people screen too.
    assert.equal((await call('GET', '/api/users', { token: owner })).status, 403);
  });

  it('shows a lapsed trial the Server ID to send the vendor', async () => {
    const res = await call('GET', '/api/license', { token: owner });
    assert.equal(res.status, 200);
    assert.equal(res.data.state, 'expired');
    assert.equal(res.data.trial, true);
    assert.match(res.data.systemId, /^SRV-[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    serverId = res.data.systemId;

    // Not to the whole network, though: it is what a licence is bound to.
    assert.equal((await call('GET', '/api/license')).status, 401);
  });

  it('refuses a licence meant for another server, or one that has already run out', async () => {
    const stolen = await call('POST', '/api/license', {
      token: owner,
      json: { license: issueLicense('SRV-1A2B-3C4D-5E6F-0718', '1y') },
    });
    assert.equal(stolen.status, 400);
    assert.match(stolen.data.error, /different server/);

    const stale = await call('POST', '/api/license', {
      token: owner,
      json: { license: issueLicense(serverId, '2020-01-01', true) },
    });
    assert.equal(stale.status, 400);
    assert.match(stale.data.error, /expired on 2020-01-01/);

    assert.equal((await call('POST', '/api/license', { token: owner, json: {} })).status, 400);
    assert.equal((await rpc(owner, 'parties', 'listParties')).status, 403);
  });

  it('opens the shop once the owner installs a licence signed for this server', async () => {
    licenseText = issueLicense(serverId, '1y');
    const res = await call('POST', '/api/license', { token: owner, json: { license: licenseText } });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.state, 'active');
    assert.equal(res.data.client, 'Test Shop');

    assert.equal((await rpc(owner, 'parties', 'listParties')).status, 200);
    assert.equal((await call('GET', '/api/users', { token: owner })).status, 200);
  });

  it('lets staff see the licence but never install one', async () => {
    const add = await call('POST', '/api/users', {
      token: owner,
      json: { username: 'licencestaff', password: 'staff-pass-1' },
    });
    assert.equal(add.status, 201);
    const staff = (
      await call('POST', '/api/auth/login', {
        json: { identifier: 'licencestaff', password: 'staff-pass-1' },
      })
    ).data.token;

    assert.equal((await call('GET', '/api/license', { token: staff })).status, 200);
    const tried = await call('POST', '/api/license', { token: staff, json: { license: licenseText } });
    assert.equal(tried.status, 403);
  });

  it('locks the shop when the computer’s clock is wound back, and a reinstall does not clear it', async () => {
    await pool.query(`update server_license set last_seen = '2099-01-01'`);

    const blocked = await rpc(owner, 'parties', 'listParties');
    assert.equal(blocked.status, 403);
    assert.match(blocked.data.error, /date on the shop's computer/);

    // Installing a genuine licence must not forgive the rolled-back clock, or
    // winding the date back would be a way to revive one that has really run out.
    const again = await call('POST', '/api/license', { token: owner, json: { license: licenseText } });
    assert.equal(again.data.state, 'rolledBack');
    assert.equal((await rpc(owner, 'parties', 'listParties')).status, 403);

    await pool.query(`update server_license set last_seen = null`);
    assert.equal((await rpc(owner, 'parties', 'listParties')).status, 200);
  });
});

describe('shops and sign-in', () => {
  let ownerA = '';

  it('takes no second shop sign-up once the server has its shop', async () => {
    assert.deepEqual((await call('GET', '/api/auth/setup')).data, { canRegister: false });
    const res = await register('Freeloader Stores', 'freeloader');
    assert.equal(res.status, 403);
    assert.match(res.data.error, /already has its shop/);
    const tried = await call('POST', '/api/auth/login', {
      json: { identifier: 'freeloader', password: 'owner-pass-1' },
    });
    assert.equal(tried.status, 401);
  });

  it('registers a shop with its owner and signs them in', async () => {
    const r = await registerAnother('Kannan Stores', 'Kannan');
    assert.equal(r.status, 201);
    assert.equal(r.data.user.username, 'kannan');
    assert.equal(r.data.user.role, 'owner');
    assert.equal(r.data.user.passwordHash, undefined);
    ownerA = r.data.token;

    const me = await call('GET', '/api/auth/me', { token: ownerA });
    assert.equal(me.status, 200);
    assert.equal(me.data.shop.name, 'Kannan Stores');
  });

  it('refuses a taken username, a weak password and a missing shop name', async () => {
    assert.equal((await registerAnother('Other', 'kannan')).status, 409);
    const weak = await call('POST', '/api/auth/register', {
      json: { shopName: 'X', username: 'weakling', email: 'w@example.com', password: 'short' },
    });
    assert.equal(weak.status, 400);
    const noShop = await call('POST', '/api/auth/register', {
      json: { username: 'noshop', email: 'n@example.com', password: 'long-enough-1' },
    });
    assert.equal(noShop.status, 400);
  });

  it('signs in by username or email, and not with a wrong password', async () => {
    const byName = await call('POST', '/api/auth/login', {
      json: { identifier: 'KANNAN', password: 'owner-pass-1' },
    });
    assert.equal(byName.status, 200);
    const byEmail = await call('POST', '/api/auth/login', {
      json: { identifier: 'kannan@example.com', password: 'owner-pass-1' },
    });
    assert.equal(byEmail.status, 200);
    const wrong = await call('POST', '/api/auth/login', {
      json: { identifier: 'kannan', password: 'nope-nope-nope' },
    });
    assert.equal(wrong.status, 401);
    const nobody = await call('POST', '/api/auth/login', {
      json: { identifier: 'ghost', password: 'nope-nope-nope' },
    });
    assert.equal(nobody.status, 401);
    assert.equal(nobody.data.error, wrong.data.error);
  });

  it('locks an identifier out after repeated wrong passwords', async () => {
    await registerAnother('Guess Shop', 'guessme');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (await call('POST', '/api/auth/login', { json: { identifier: 'guessme', password: 'wrong-wrong' } }))
          .status,
      );
    }
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
    // Even the right password waits out the lock.
    const right = await call('POST', '/api/auth/login', {
      json: { identifier: 'guessme', password: 'owner-pass-1' },
    });
    assert.equal(right.status, 429);
  });

  it('rejects requests without a valid token', async () => {
    assert.equal((await call('GET', '/api/auth/me')).status, 401);
    assert.equal((await rpc('made-up', 'parties', 'listParties')).status, 401);
  });

  it('signs a token out', async () => {
    const s = await call('POST', '/api/auth/login', {
      json: { identifier: 'kannan', password: 'owner-pass-1' },
    });
    assert.equal((await call('POST', '/api/auth/logout', { token: s.data.token })).status, 204);
    assert.equal((await call('GET', '/api/auth/me', { token: s.data.token })).status, 401);
    assert.equal((await call('GET', '/api/auth/me', { token: ownerA })).status, 200);
  });
});

describe('the shop’s people', () => {
  let owner = '';
  let staffId = 0;

  before(async () => {
    owner = (await registerAnother('Murugan Traders', 'murugan')).data.token;
  });

  it('lets the owner add staff, who can bill but not manage people', async () => {
    const add = await call('POST', '/api/users', {
      token: owner,
      json: { username: 'counter1', password: 'counter-pass', displayName: 'Selvi' },
    });
    assert.equal(add.status, 201);
    assert.equal(add.data.role, 'staff');
    staffId = add.data.id;

    const staff = await call('POST', '/api/auth/login', {
      json: { identifier: 'counter1', password: 'counter-pass' },
    });
    assert.equal(staff.status, 200);
    assert.equal(staff.data.shop.name, 'Murugan Traders');

    assert.equal((await rpc(staff.data.token, 'parties', 'listParties')).status, 200);
    assert.equal((await call('GET', '/api/users', { token: staff.data.token })).status, 403);
    const sneaky = await call('POST', '/api/users', {
      token: staff.data.token,
      json: { username: 'sneaky', password: 'sneaky-pass', role: 'owner' },
    });
    assert.equal(sneaky.status, 403);

    const list = await call('GET', '/api/users', { token: owner });
    assert.deepEqual(
      list.data.map((u: { username: string }) => u.username),
      ['murugan', 'counter1'],
    );
  });

  it('switching staff off signs them out and keeps them out', async () => {
    const staff = await call('POST', '/api/auth/login', {
      json: { identifier: 'counter1', password: 'counter-pass' },
    });
    const off = await call('PATCH', `/api/users/${staffId}`, { token: owner, json: { active: false } });
    assert.equal(off.status, 200);
    assert.equal(off.data.active, false);

    assert.equal((await call('GET', '/api/auth/me', { token: staff.data.token })).status, 401);
    const again = await call('POST', '/api/auth/login', {
      json: { identifier: 'counter1', password: 'counter-pass' },
    });
    assert.equal(again.status, 403);
  });

  it('never leaves a shop without an owner', async () => {
    const me = await call('GET', '/api/auth/me', { token: owner });
    const self = await call('PATCH', `/api/users/${me.data.user.id}`, {
      token: owner,
      json: { role: 'staff' },
    });
    assert.equal(self.status, 400);
  });

  it('cannot touch another shop’s users', async () => {
    const other = await registerAnother('Someone Else', 'someoneelse');
    const res = await call('PATCH', `/api/users/${other.data.user.id}`, {
      token: owner,
      json: { active: false },
    });
    assert.equal(res.status, 404);
    const stillIn = await call('GET', '/api/auth/me', { token: other.data.token });
    assert.equal(stillIn.status, 200);
  });

  it('a password change signs out every other device', async () => {
    const phone = await call('POST', '/api/auth/login', {
      json: { identifier: 'murugan', password: 'owner-pass-1' },
    });
    const change = await call('POST', '/api/auth/password', {
      token: owner,
      json: { current: 'owner-pass-1', next: 'owner-pass-2' },
    });
    assert.equal(change.status, 204);
    assert.equal((await call('GET', '/api/auth/me', { token: phone.data.token })).status, 401);
    assert.equal((await call('GET', '/api/auth/me', { token: owner })).status, 200);
    const oldPw = await call('POST', '/api/auth/login', {
      json: { identifier: 'murugan', password: 'owner-pass-1' },
    });
    assert.equal(oldPw.status, 401);
  });
});

describe('shop books', () => {
  it('keeps each shop’s parties to itself', async () => {
    const a = (await registerAnother('Shop A', 'shopa')).data.token;
    const b = (await registerAnother('Shop B', 'shopb')).data.token;

    const created = await rpc(a, 'parties', 'createParty', { name: 'Ravi', type: 'customer' });
    assert.equal(created.status, 200);
    assert.equal(created.data.result.id, 1);

    const listA = await rpc(a, 'parties', 'listParties');
    assert.deepEqual(listA.data.result.map((p: { name: string }) => p.name), ['Ravi']);
    const listB = await rpc(b, 'parties', 'listParties');
    assert.deepEqual(listB.data.result, []);
  });

  it('undoes everything a failed request wrote', async () => {
    const t = (await registerAnother('Rollback Shop', 'rollback')).data.token;
    const res = await call('POST', '/api/test/write-then-fail', { token: t });
    assert.equal(res.status, 400);
    assert.equal(res.data.error, 'failed on purpose');
    assert.deepEqual((await rpc(t, 'parties', 'listParties')).data.result, []);
  });

  it('runs only what the registry lists', async () => {
    const t = (await registerAnother('Allowlist Shop', 'allowlist')).data.token;
    assert.equal((await rpc(t, 'parties', 'constructor')).status, 404);
    assert.equal((await rpc(t, 'auth', 'signOut')).status, 404);
    assert.equal((await rpc(t, 'invoices', 'stockSign', 'sale')).status, 404);
  });

  it('answers a missing row as undefined, and shows the service’s own error text', async () => {
    const t = (await registerAnother('Errors Shop', 'errors')).data.token;
    const missing = await rpc(t, 'parties', 'getParty', 12345);
    assert.equal(missing.status, 200);
    assert.equal('result' in missing.data, false);

    const convert = await rpc(t, 'invoices', 'convertToInvoice', 999);
    assert.equal(convert.status, 400);
    assert.equal(convert.data.error, 'That document no longer exists.');
  });
});

describe('bills on Postgres, through the app’s own invoice service', () => {
  let t = '';
  let partyId = 0;

  const newItem = async (name: string) =>
    (
      await rpc(t, 'items', 'createItem', {
        name,
        hsnCode: '1001',
        salePrice: 10000,
        purchasePrice: 6000,
        taxRate: 1800,
        openingStock: 10000,
        currentStock: 10000,
      })
    ).data.result;
  const stockOf = async (id: number) => (await rpc(t, 'items', 'getItem', id)).data.result.currentStock;

  before(async () => {
    t = (await registerAnother('Bill Shop', 'billshop')).data.token;
    partyId = (await rpc(t, 'parties', 'createParty', { name: 'Ravi', type: 'customer' })).data.result.id;
  });

  it('creates, edits and deletes a paid sale with stock moving exactly once each way', async () => {
    const item = await newItem('Rice');
    const created = await rpc(t, 'invoices', 'createInvoiceWithItems', { type: 'sale', partyId, date: '2026-09-15' }, [
      { itemId: item.id, qty: 2000, rate: 10000, taxRate: 1800 },
    ]);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const inv = created.data.result;
    assert.equal(inv.grandTotal, 23600);
    assert.equal(await stockOf(item.id), 8000);

    await rpc(t, 'items', 'updateItem', item.id, { purchasePrice: 9999 });
    const edited = await rpc(t, 'invoices', 'updateInvoiceWithItems', inv.id, { partyId, date: '2026-09-16' }, [
      { itemId: item.id, qty: 3000, rate: 10000, taxRate: 1800 },
    ]);
    assert.equal(edited.status, 200, JSON.stringify(edited.data));
    assert.equal(edited.data.result.invoiceNo, inv.invoiceNo);
    assert.equal(edited.data.result.grandTotal, 35400);
    assert.equal(await stockOf(item.id), 7000);
    const lines = (await rpc(t, 'invoices', 'listInvoiceItems', inv.id)).data.result;
    assert.equal(lines.length, 1);
    assert.equal(lines[0].costPrice, 6000);

    const paid = await rpc(t, 'payments', 'recordPayment', {
      partyId,
      invoiceId: inv.id,
      amount: 35400,
      mode: 'cash',
      direction: 'in',
      date: '2026-09-16',
    });
    assert.equal(paid.status, 200, JSON.stringify(paid.data));
    assert.equal((await rpc(t, 'invoices', 'getInvoice', inv.id)).data.result.paymentStatus, 'paid');

    assert.equal((await rpc(t, 'invoices', 'deleteInvoiceWithItems', inv.id)).status, 200);
    assert.equal('result' in (await rpc(t, 'invoices', 'getInvoice', inv.id)).data, false);
    assert.deepEqual((await rpc(t, 'payments', 'listPaymentsByInvoice', inv.id)).data.result, []);
    assert.equal(await stockOf(item.id), 10000);
  });

  it('a bill that fails halfway leaves nothing behind', async () => {
    const item = await newItem('Salt');
    const before = (await rpc(t, 'invoices', 'listInvoices')).data.result.length;
    const res = await rpc(t, 'invoices', 'createInvoiceWithItems', { type: 'sale', partyId, date: '2026-09-15' }, [
      { itemId: item.id, qty: 1000, rate: 10000, taxRate: 1800 },
      { itemId: 999999, qty: 1000, rate: 10000, taxRate: 1800 },
    ]);
    assert.equal(res.status, 500);
    assert.equal((await rpc(t, 'invoices', 'listInvoices')).data.result.length, before);
    assert.equal(await stockOf(item.id), 10000);
  });

  it('two counters billing at the same instant get different numbers', async () => {
    const item = await newItem('Sugar');
    const bill = () =>
      rpc(t, 'invoices', 'createInvoiceWithItems', { type: 'sale', partyId, date: '2026-09-15' }, [
        { itemId: item.id, qty: 1000, rate: 10000, taxRate: 0 },
      ]);
    const results = await Promise.all([bill(), bill(), bill(), bill(), bill()]);
    const numbers = results.map((r) => r.data.result.invoiceNo);
    assert.equal(new Set(numbers).size, 5, numbers.join(', '));
    assert.equal(await stockOf(item.id), 5000);
  });

  it('a quick bill keeps its default payment mode when the web leaves it out', async () => {
    const item = (await rpc(t, 'items', 'getItem', (await newItem('Tea')).id)).data.result;
    const res = await rpc(t, 'pos', 'createQuickBill', [{ item, qty: 1 }], undefined, undefined);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const detail = res.data.result;
    const pays = (await rpc(t, 'payments', 'listPaymentsByInvoice', detail.invoice.id)).data.result;
    assert.equal(pays[0].mode, 'cash');
    assert.equal((await rpc(t, 'invoices', 'getInvoice', detail.invoice.id)).data.result.paymentStatus, 'paid');
  });
});

describe('the server’s daily backup', () => {
  let owner = '';
  let staff = '';

  before(async () => {
    process.env.BACKUP_DIR = mkdtempSync(path.join(tmpdir(), 'benesys-backup-'));
    owner = (await registerAnother('Backup Shop', 'backupowner')).data.token;
    await call('POST', '/api/users', { token: owner, json: { username: 'backupstaff', password: 'staff-pass-1' } });
    staff = (await call('POST', '/api/auth/login', { json: { identifier: 'backupstaff', password: 'staff-pass-1' } }))
      .data.token;
  });

  it('shows the owner that nothing has been backed up yet, then takes one on request', async () => {
    const before = await call('GET', '/api/backup', { token: owner });
    assert.equal(before.status, 200);
    assert.equal(before.data.latest, null);
    assert.equal(before.data.dir, process.env.BACKUP_DIR);

    const taken = await call('POST', '/api/backup', { token: owner });
    assert.equal(taken.status, 200, JSON.stringify(taken.data));
    assert.match(taken.data.latest.file, /^benesys_billing-\d{4}-\d{2}-\d{2}_\d{4}\.dump$/);
    assert.ok(taken.data.latest.size > 1000);
    assert.equal(taken.data.error, null);
  });

  it('is the owner’s alone, and nobody’s without signing in', async () => {
    assert.equal((await call('GET', '/api/backup', { token: staff })).status, 403);
    assert.equal((await call('POST', '/api/backup', { token: staff })).status, 403);
    assert.equal((await call('GET', '/api/backup')).status, 401);
  });
});

// ── Hardening ────────────────────────────────────────────────────────────────

describe('what staff may do', () => {
  let owner = '';
  let staff = '';
  let partyId = 0;

  before(async () => {
    owner = (await registerAnother('Perm Shop', 'permowner')).data.token;
    await call('POST', '/api/users', { token: owner, json: { username: 'permstaff', password: 'staff-pass-1' } });
    staff = (await call('POST', '/api/auth/login', { json: { identifier: 'permstaff', password: 'staff-pass-1' } }))
      .data.token;
    assert.ok(staff);
  });

  it('still bills: parties, items, invoices, payments', async () => {
    const party = await rpc(staff, 'parties', 'createParty', { name: 'Ravi', type: 'customer' });
    assert.equal(party.status, 200, JSON.stringify(party.data));
    partyId = party.data.result.id;
    assert.equal((await rpc(staff, 'parties', 'updateParty', partyId, { phone: '9000000000' })).status, 200);

    const item = await rpc(staff, 'items', 'createItem', {
      name: 'Dal',
      salePrice: 10000,
      purchasePrice: 6000,
      taxRate: 0,
      openingStock: 10000,
      currentStock: 10000,
    });
    assert.equal(item.status, 200, JSON.stringify(item.data));
    const inv = await rpc(staff, 'invoices', 'createInvoiceWithItems', { type: 'sale', partyId, date: '2026-09-15' }, [
      { itemId: item.data.result.id, qty: 1000, rate: 10000, taxRate: 0 },
    ]);
    assert.equal(inv.status, 200, JSON.stringify(inv.data));
    const paid = await rpc(staff, 'payments', 'recordPayment', {
      partyId,
      invoiceId: inv.data.result.id,
      amount: 10000,
      mode: 'cash',
      direction: 'in',
      date: '2026-09-15',
    });
    assert.equal(paid.status, 200, JSON.stringify(paid.data));
    assert.equal((await rpc(staff, 'settings', 'getBusinessProfile')).status, 200);
    assert.equal((await rpc(staff, 'settings', 'setVoiceOn', true)).status, 200);
  });

  it('cannot delete records or change the shop settings, while the owner can', async () => {
    const refused: [string, string, ...unknown[]][] = [
      ['parties', 'deleteParty', partyId],
      ['invoices', 'deleteInvoice', 1],
      ['invoices', 'deleteInvoiceWithItems', 1],
      ['payments', 'deletePayment', 1],
      ['items', 'deleteItem', 1],
      ['expenses', 'deleteExpense', 1],
      ['bankAccounts', 'deleteBankAccount', 1],
      ['settings', 'setSetting', 'business.name', 'Hijacked'],
      ['settings', 'deleteSetting', 'business.name'],
      ['settings', 'setPrintFormat', 'a4'],
      ['settings', 'setDefaultTaxMode', 'inclusive'],
    ];
    for (const [module, fn, ...args] of refused) {
      const res = await rpc(staff, module, fn, ...args);
      assert.equal(res.status, 403, `${module}.${fn} was allowed for staff`);
      assert.match(res.data.error, /Only the shop owner/);
    }
    // Nothing was deleted on the way.
    assert.ok((await rpc(owner, 'parties', 'getParty', partyId)).data.result);

    const spare = (await rpc(owner, 'parties', 'createParty', { name: 'Spare', type: 'customer' })).data.result;
    assert.equal((await rpc(owner, 'parties', 'deleteParty', spare.id)).status, 200);
  });

  it('lists every delete, remove, restore and settings write as owner-only', async () => {
    for (const [module, fns] of Object.entries(registry)) {
      for (const fn of Object.keys(fns)) {
        const destructive = /^(delete|remove|restore|wipe|purge)/i.test(fn);
        const settingsWrite =
          module === 'settings' && /^set/.test(fn) && !(STAFF_SETTINGS as readonly string[]).includes(fn);
        if (destructive || settingsWrite) {
          assert.ok(isOwnerOnly(module, fn), `${module}.${fn} is open to staff; add it to OWNER_ONLY in routes/rpc.ts`);
        }
      }
    }
    // And nothing in the table is a typo that guards nothing.
    for (const [module, fns] of Object.entries(OWNER_ONLY)) {
      for (const fn of fns) assert.ok(registry[module]?.[fn], `OWNER_ONLY names unknown ${module}.${fn}`);
    }
  });
});

describe('cross-origin calls', () => {
  const preflight = (origin: string, host = 'localhost:4747') =>
    app.request('/api/auth/login', {
      method: 'OPTIONS',
      headers: { Origin: origin, Host: host, 'Access-Control-Request-Method': 'POST' },
    });

  const withCorsEnv = async (value: string, run: () => Promise<void>) => {
    const saved = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = value;
    try {
      await run();
    } finally {
      if (saved === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = saved;
    }
  };

  it('lets the Expo dev server on :8081 call the API', async () => {
    const res = await preflight('http://localhost:8081');
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:8081');
  });

  it('refuses any other web page, even when .env still says CORS_ORIGINS=*', async () => {
    await withCorsEnv('*', async () => {
      for (const o of ['http://evil.example', 'http://localhost:3000', 'https://localhost:8081']) {
        const res = await preflight(o);
        assert.equal(res.headers.get('access-control-allow-origin'), null, o);
      }
    });
  });

  it('allows :8081 on the host the request came in on, and listed extras', async () => {
    assert.equal(allowedOrigin('http://192.168.1.5:8081', '192.168.1.5:4747'), true);
    assert.equal(allowedOrigin('http://192.168.1.9:8081', '192.168.1.5:4747'), false);
    assert.equal(allowedOrigin('http://127.0.0.1:8081', undefined), true);
    assert.equal(allowedOrigin('not a url', 'localhost:4747'), false);
    await withCorsEnv('http://till.local:5000, *', async () => {
      assert.equal(allowedOrigin('http://till.local:5000', 'localhost:4747'), true);
      assert.equal(allowedOrigin('http://evil.example', 'localhost:4747'), false);
    });
  });

  it('answers a same-origin page (the shop LAN address), which needs no CORS', async () => {
    const res = await app.request('/api/health', { headers: { Origin: 'http://192.168.1.5:4747' } });
    assert.equal(res.status, 200);
  });
});

describe('sign-in limit per computer', () => {
  const loginFrom = (ip: string, identifier: string, password: string) =>
    app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      },
      { incoming: { socket: { remoteAddress: ip } } },
    );

  before(async () => {
    await registerAnother('IP Shop', 'iplimit');
  });

  it('locks a computer out after many wrong guesses across different names', async () => {
    // A different name each time, so the per-name lock never trips.
    for (let i = 0; i < MAX_IP_FAILURES; i++) {
      assert.equal((await loginFrom('10.0.0.66', `nobody${i}`, 'wrong-wrong')).status, 401);
    }
    const locked = await loginFrom('10.0.0.66', 'iplimit', 'owner-pass-1');
    assert.equal(locked.status, 429);
    assert.match(((await locked.json()) as { error: string }).error, /this computer/);

    // Another computer in the shop is not held up.
    assert.equal((await loginFrom('10.0.0.67', 'iplimit', 'owner-pass-1')).status, 200);
  });
});

describe('the trial cannot be restarted', () => {
  it('deleting the licence row does not hand out a fresh 7 days', async () => {
    const owner = (await call('POST', '/api/auth/login', { json: { identifier: 'kannan', password: 'owner-pass-1' } }))
      .data.token;
    const saved = (await pool.query('select * from server_license')).rows[0];
    const oldest = (await pool.query('select id, created_at from shops order by created_at limit 1')).rows[0];
    try {
      await pool.query(`update shops set created_at = now() - interval '30 days' where id = $1`, [oldest.id]);
      await pool.query('delete from server_license');

      const res = await call('GET', '/api/license', { token: owner });
      assert.equal(res.status, 200);
      assert.equal(res.data.state, 'expired');
      assert.equal(res.data.trial, true);
      assert.equal((await rpc(owner, 'parties', 'listParties')).status, 403);
    } finally {
      await pool.query('delete from server_license');
      await pool.query(
        'insert into server_license (id, seed, license, last_seen, trial_start, installed_at) values ($1,$2,$3,$4,$5,$6)',
        [saved.id, saved.seed, saved.license, saved.last_seen, saved.trial_start, saved.installed_at],
      );
      await pool.query('update shops set created_at = $2 where id = $1', [oldest.id, oldest.created_at]);
    }
    assert.equal((await rpc(owner, 'parties', 'listParties')).status, 200);
  });
});
