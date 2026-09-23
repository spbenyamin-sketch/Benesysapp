# Online mode server (PostgreSQL)

The mobile app's **Offline mode** needs none of this — it keeps using SQLite on the phone.
This server is for **Online mode**: the web app (PWA) and, later, the phone signed in to a shop.

## How it is built

- `server/` is its own Node project (Hono + drizzle + `pg`). It has its own `package.json`,
  so the app's root `package-lock.json` (and the EAS build) is untouched.
- **One Postgres schema per shop** (`shop_1`, `shop_2`, …) holding the same tables as the
  phone's SQLite file. Shops, users and sessions live in `public`.
- The app's service code (`modules/*/service.ts`) runs on the server **unchanged**:
  `server/tsconfig.json` points `@/db/client` and `@/db/schema` at the Postgres versions,
  and each request runs in one transaction with `search_path` set to the signed-in shop.
- When a column is added to `db/schema.ts`, add it to `server/src/db/shop-schema.ts` too,
  then `npm run db:generate` and `npm run db:migrate` (every shop is upgraded).

## Running it: double-click `start-web.bat`

One click, and safe to repeat — a run where nothing has changed takes seconds:

1. installs the app and server packages, and pm2, if they are missing;
2. creates the `benesys_billing` database on the very first run (asks once for the
   PostgreSQL `postgres` password, then writes a random app password into `server/.env`);
3. migrates the tables;
4. rebuilds the web app **only if something in it changed** (`scripts/needs-web-build.js`
   compares the sources against `dist/index.html` — an export takes minutes and the answer
   is usually "nothing");
5. starts it under **pm2** from `ecosystem.config.js`, then `pm2 save` and
   `pm2-startup install`, so it restarts on a crash and comes back when Windows boots;
6. waits for `/api/health`, opens the browser, and prints the address for other devices.

**One process, one address: http://localhost:4747.** The server also serves the exported
web app (`WEB_DIR`, default `../dist`, in `server/src/app.ts`), falling back to
`index.html` so a typed-in `/invoice/12` reaches the app's own router. `app.json` sets
`web.output: "single"` for exactly that. Nothing is cross-origin any more; CORS stays for
the development server below.

```powershell
pm2 status                    # is it running?
pm2 logs benesys-billing      # what is it doing?
pm2 restart benesys-billing   # after pulling new code (rerun start-web.bat to rebuild)
pm2 stop benesys-billing
```

While developing, run the two halves separately instead — `npm run dev` in `server/` and
`npx expo start --web` at the root (http://localhost:8081, calling the API on 4747).

## How the web app reaches the data

On web, `metro.config.js` swaps every `modules/<name>/service` import for
`web/services/<name>.ts`, which sends each async function to `POST /api/rpc/<name>/<fn>`.
The server runs the real function. Both sides are generated — after adding or renaming a
service function run `node scripts/online-services.js` (a jest test fails until you do).

## Manual setup (localhost)

```powershell
cd server
npm install

# 1. Create the database and its (non-superuser) role — asks for the postgres password.
psql -h localhost -U postgres -v pw='pick-a-password' -f setup.sql

# 2. Point the server at it.
copy .env.example .env      # then put the same password into DATABASE_URL

# 3. Create the tables, then run.
npm run db:migrate
npm run dev                 # http://localhost:4747
```

## API so far

| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/register` `{shopName, username, email, password}` | anyone — creates a shop + its owner |
| POST | `/api/auth/login` `{identifier, password}` | username or email |
| POST | `/api/auth/logout` | signed in |
| GET | `/api/auth/me` | signed in |
| POST | `/api/auth/password` `{current, next}` | signed in — signs out other devices |
| GET / POST | `/api/users` | owner |
| PATCH | `/api/users/:id` `{displayName?, role?, active?, password?, screens?}` | owner |
| GET | `/api/license` | signed in — this server's id and licence state |
| POST | `/api/license` `{license}` | owner — installs a signed `.lic` (see LICENSE-SETUP.md) |
| POST | `/api/rpc/:module/:fn` `{args, undef}` | signed in **and licensed** — the app's service functions (see `server/src/rpc/registry.ts`) |

Every signed-in call sends `Authorization: Bearer <token>`.

## Who sees which screens

The shop's people are managed in the web app under **Settings → People** (owners
only). Each staff member carries the list of tabs they may open — the names in
`modules/auth/screens.ts`, shared by both halves. `null` is nobody having
restricted them yet, which means all of them; an owner always opens everything.

The tab bar only offers what they were given and `components/ScreenGuard.web.tsx`
turns a typed-in address away, but hiding a screen is not by itself a lock. What
the shop actually protects — its takings — the server refuses as well: the
`reports` module (sales, profit, GST, expenses, bank accounts) needs the Reports
or Dashboard screen, see `MODULE_SCREENS` in `server/src/routes/rpc.ts`. Items,
parties, invoices and payments stay open to everyone, because a bill cannot be
put together without them.

Adding a screen means adding it to `SCREENS`, giving it a tab in
`app/(tabs)/_layout.tsx`, and a path prefix in `PATH_SCREEN` so the guard knows
what belongs to it.

## A forgotten password

A staff member who forgets theirs asks the owner, who sets a new one in
**Settings → People**. An owner has nobody above them, and there is no mail
server here to send a link through — so the answer is the computer holding the
books:

```
reset-password.bat        (next to start-web.bat — double-click it)
```

It lists the accounts on this server, asks which one and what the new password
should be, sets it, and deletes that person's sessions so a browser still signed
in as them has to sign in again. Nothing else in the database is touched.

It then restarts the server through pm2, and that part is not tidiness. Five
wrong guesses lock a name out for fifteen minutes (`MAX_FAILURES` in
`server/src/auth/service.ts`), and that count lives in the server process's
memory, where no database tool can reach it. Somebody who has forgotten their
password has usually collected the lock on the way here, so without the restart
the new password would be refused too, with a message about waiting — which
reads exactly like the reset not having worked.

Sitting at that computer is already enough to read every bill in Postgres, so
this gives away nothing new; without it, a shop that mistyped its own password on
day one would lose its books. The same reasoning as `start-web.bat` holding the
database password in a file beside it. `server/src/tools/reset-password.ts` is
the tool itself — it hashes with the server's own `hashPassword`, so a password
set here is a password the API will accept.

On the phone there is no server at all: the app's own sign-in screen offers
**Forgot your password?**, which asks the phone for its fingerprint/PIN and then
takes a new one (`resetPasswordWithDeviceLock` in `modules/auth/service.ts`). A
phone with no screen lock set has no way to prove itself, and the way back there
is a fresh install restored from the Drive backup.

## Tests

`npm test` runs against the database in `server/.env.test`, which it **wipes first**.
Never point `.env.test` at a database with real books in it.

Its database has to exist. Once, as the postgres superuser:

```powershell
psql -h localhost -U postgres -c "CREATE DATABASE benesys_test OWNER benesys_billing ENCODING 'UTF8'"
```

Then `server/.env.test` is the same `DATABASE_URL` as `.env` with `benesys_test`
on the end, and a `PORT` nothing else is using — the tests bind it. The licence
suite activates its test server through the real flow, so
`tools/vendor-private-key.txt` must be present; there is deliberately no way to
switch the licence check off for tests.
