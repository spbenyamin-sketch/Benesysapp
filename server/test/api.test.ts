import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createParty } from '@/modules/parties/service';
import { createApp } from '../src/app';
import { control, pool } from '../src/db/client';
import { ApiError } from '../src/http/errors';
import { inShop, requireAuth } from '../src/http/middleware';

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

describe('shops and sign-in', () => {
  let ownerA = '';

  it('registers a shop with its owner and signs them in', async () => {
    const r = await register('Kannan Stores', 'Kannan');
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
    assert.equal((await register('Other', 'kannan')).status, 409);
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
    await register('Guess Shop', 'guessme');
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
    owner = (await register('Murugan Traders', 'murugan')).data.token;
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
    const other = await register('Someone Else', 'someoneelse');
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
    const a = (await register('Shop A', 'shopa')).data.token;
    const b = (await register('Shop B', 'shopb')).data.token;

    const created = await rpc(a, 'parties', 'createParty', { name: 'Ravi', type: 'customer' });
    assert.equal(created.status, 200);
    assert.equal(created.data.result.id, 1);

    const listA = await rpc(a, 'parties', 'listParties');
    assert.deepEqual(listA.data.result.map((p: { name: string }) => p.name), ['Ravi']);
    const listB = await rpc(b, 'parties', 'listParties');
    assert.deepEqual(listB.data.result, []);
  });

  it('undoes everything a failed request wrote', async () => {
    const t = (await register('Rollback Shop', 'rollback')).data.token;
    const res = await call('POST', '/api/test/write-then-fail', { token: t });
    assert.equal(res.status, 400);
    assert.equal(res.data.error, 'failed on purpose');
    assert.deepEqual((await rpc(t, 'parties', 'listParties')).data.result, []);
  });

  it('runs only what the registry lists', async () => {
    const t = (await register('Allowlist Shop', 'allowlist')).data.token;
    assert.equal((await rpc(t, 'parties', 'constructor')).status, 404);
    assert.equal((await rpc(t, 'auth', 'signOut')).status, 404);
    assert.equal((await rpc(t, 'invoices', 'stockSign', 'sale')).status, 404);
  });

  it('answers a missing row as undefined, and shows the service’s own error text', async () => {
    const t = (await register('Errors Shop', 'errors')).data.token;
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
    t = (await register('Bill Shop', 'billshop')).data.token;
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
