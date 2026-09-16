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

## Easiest: double-click `start-web.bat`

It installs packages if missing, creates the `benesys_billing` database on the first run
(asks once for the PostgreSQL `postgres` password), updates the tables, and starts the
server (http://localhost:4747) and the web app (http://localhost:8081).

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
| POST | `/api/rpc/:module/:fn` `{args, undef}` | signed in — the app's service functions (see `server/src/rpc/registry.ts`) |

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

## Tests

`npm test` runs against the database in `server/.env.test`, which it **wipes first**.
Never point `.env.test` at a database with real books in it.
