# Licensing — device lock + expiry

The app is sold as a direct install (no Play Store), so each copy is tied to one
phone and stops working on a date you choose. Same idea as the VFP product's
`HWLock`, with one important difference: the APK carries only a **public** key,
so a decompiled bundle cannot be used to issue licences.

Nothing here needs a server or an internet connection — on your side or the
client's.

**Online mode is licensed the same way**, except that what is tied down is the
shop's server rather than one phone. Same file, same key, same command — see
[Online mode](#online-mode--licensing-the-shops-server) at the end.

## First-time setup (once, ever)

```
node tools/new-vendor-key.mjs
```

That writes:

- `tools/vendor-private-key.txt` — **your signing key. Back it up offline.**
  It is gitignored. Lose it and you cannot renew a single client; leak it and
  anyone can issue licences.
- `modules/license/publicKey.ts` — the public half, committed, shipped in the APK.

This has already been run for this repo. Only run it again if the private key was
lost or leaked — it invalidates every licence ever issued.

## The everyday flow

1. Client installs the APK and opens it. Instead of the login screen they get
   **Activate Billing App**, showing a **System ID** like `9F3C-11AB-7E20-04D5`.
2. They tap **Send System ID** and it arrives on your phone over WhatsApp.
3. You open `tools/keygen.html` (double-click — it runs offline in the browser).
   Paste your private key once (it can be remembered in that browser), then the
   System ID, a shop name, and an expiry date. **Generate licence file** →
   **Download .lic**.
4. Send the `.lic` file back. The client saves it, taps **Import licence file**,
   picks it from Downloads, and the app opens.

Renewal is the same four steps. The client can do it early from
**Settings → Licence → Import licence** — no need to wait for the lockout.

### Or from the terminal

Same result without opening a browser:

```
node tools/issue-license.mjs 9F3C-11AB-7E20-04D5 1y "Sri Murugan Stores"
node tools/issue-license.mjs 9F3C-11AB-7E20-04D5 2027-08-10
node tools/issue-license.mjs --check tools/issued/9F3C11AB7E2004D5-2027-08-10.lic
```

Expiry is an ISO date or a duration from today (`30d`, `6m`, `1y`, `3y`). The
file lands in `tools/issued/` (gitignored) unless `--out` says otherwise, so that
folder doubles as your record of who has what.

## What the client sees

| Situation | What happens |
|---|---|
| Never activated | Activation screen; app cannot be used |
| Activated, more than 7 days left | Normal; expiry shown in Settings |
| 7 days or fewer left | Normal, plus an orange warning in Settings |
| Expiry date passed | **Licence expired** screen; data untouched, a renewal file restores it |
| Phone date wound back | **Phone's date was changed** screen |

## How it works

**System ID** — SHA-256 of Android's `ANDROID_ID` plus the package name, shortened
to 16 hex characters. `ANDROID_ID` survives app updates and reinstalls, and
changes only on a factory reset. That is deliberate: a client who reinstalls the
app (or restores a Drive backup onto the same phone) keeps their licence, but the
APK copied to a second phone will not activate.

**Licence file** — JSON, signed with Ed25519:

```json
{
  "app": "billing-app",
  "v": 1,
  "systemId": "9F3C-11AB-7E20-04D5",
  "expiry": "2027-08-10",
  "issued": "2026-08-10",
  "client": "Sri Murugan Stores",
  "sig": "…128 hex characters…"
}
```

The signature covers `app|v|systemId|expiry|issued|client`, so editing any field —
the expiry, or pasting your own System ID over someone else's licence — breaks it.

**Why a file and not a short typed key.** A key short enough to type has to be
checked against a shared secret inside the app, and a secret that can *check* a
key can also *mint* one: decompiling the APK would hand over the generator.
Ed25519 splits that in two. Verifying needs only the public key; issuing needs
the private key, which never leaves your machine. The cost is 64 bytes of
signature — far too long to type, hence the file.

**Storage** — SecureStore (Android Keystore), never SQLite. Restoring a backup
wipes and reloads every table, so a licence kept in the database would be
replaced by whatever was in the backup file.

**Rollback** — the date of every launch is recorded. If the phone's date is ever
earlier than that, the app locks. This is what stops "just set the clock back".

## Files

| File | Role |
|---|---|
| `tools/vendor-private-key.txt` | **Your signing key. Gitignored. Back it up.** |
| `tools/keygen.html` | **Vendor only.** Issues and checks licence files, in a browser. |
| `tools/issue-license.mjs` | **Vendor only.** The same, from the terminal. |
| `tools/noble-ed25519.js` | The signing library, vendored as a plain script (`tools/vendor-noble.mjs` regenerates it) so the page works from `file://` |
| `tools/new-vendor-key.mjs` | Mints a new keypair |
| `modules/license/publicKey.ts` | Public key, ships in the APK |
| `modules/license/licenseFile.ts` | Licence format — canonical message, parse, verify |
| `modules/license/status.ts` | The states, the warning threshold — shared by both modes |
| `modules/license/device.ts` | System ID derivation |
| `modules/license/service.ts` | Stored state, activation, expiry and rollback rules |
| `components/LicenseGate.tsx` | The lockout screen, outermost in `app/_layout.tsx` |
| `modules/license/LicenseCard.tsx` | The Settings section |
| `modules/license/serverLicense.ts` | Online mode: Server ID, and the same rules without SecureStore |
| `server/src/auth/license.ts` | Online mode: the licence row, install and status |
| `components/LicenseGate.web.tsx` | Online mode: the lockout screen in the browser |

`modules/license/__tests__/keygen-html.test.ts` runs the generator's own code out
of the HTML file and checks it still signs exactly what the app accepts — if the
two ever drift apart, that test fails instead of a client being locked out.

## Moving a client to a new phone

The new phone shows a different System ID, so issue a fresh licence file for it.
The old phone keeps working until its own expiry — there is no way to revoke a
licence offline, which is the honest trade for needing no server. Short expiry
periods (yearly rather than "3 years") are the practical answer.

## What this does and does not stop

**Stops:** one client passing the APK to another shop; a client using the app past
the date they paid for; winding the clock back; editing the licence file.

**Does not stop:** someone who patches the APK itself — removes the gate, or
swaps in their own public key — and re-signs it. No client-side scheme can, and
the earlier shared-secret design was worse: it let them mint keys for the
*genuine* app. If that ever becomes a real problem, the answer is an occasional
online check-in, not more obfuscation.

## Online mode — licensing the shop's server

The web app has no phone to be tied to: clear the site data, or open it from a
second laptop on the shop's network, and any per-browser lock is gone. What is
sold in Online mode is the **server** — one install, on the shop's computer,
holding the shop's books — so that is what the licence names. One licence per
installation, whatever number of shops are registered on it.

### The everyday flow

1. The owner opens the app and signs in as usual (registering the shop if this is
   the first run — a shop can be created on an unlicensed server, it just cannot
   be used).
2. Instead of the tabs they get **Activate this shop**, showing a **Server ID**
   like `SRV-9F3C-11AB-7E20-04D5`. **Copy Server ID** → WhatsApp.
3. You issue it exactly as for a phone — the prefix is the only difference:

   ```
   node tools/issue-license.mjs SRV-9F3C-11AB-7E20-04D5 1y "Sri Murugan Stores"
   ```

   `tools/keygen.html` works too; paste the Server ID into the same box.
4. Send it back. The owner pastes it into the box on that screen (or picks the
   `.lic` file) and the shop opens. Renewal is the same four steps.

Only an **owner** can install one. Staff see the same screen, the Server ID, and
who has to fix it.

### Where the Server ID comes from

A random seed written once into the control database (`public.server_license`),
hashed and shown as `SRV-` plus 16 hex. Not the machine's hardware, and not a
file next to the code: `start-web.bat` replaces the app folder on every update,
and a hardware fingerprint would break the shop's own database restore. Postgres
outlives both, so the database is the anchor.

The honest trade, the same one the phone makes: a shop that copies its whole
database onto a second machine copies the licence with it, and there is no
offline way to revoke that. Short expiry periods are the answer.

### What actually enforces it

`components/LicenseGate.web.tsx` is the screen, and a screen in a bundle on the
shop's own computer can be edited out. The part that cannot is
`requireLicense` in `server/src/http/middleware.ts`: while the install is
unlicensed, **every** `/api/rpc` and `/api/users` call is refused, so a patched
build, a second browser and `curl` all get the same nothing. Sign-in and
`/api/license` stay open, or the shop could never activate.

That is also why the gate sits *inside* AuthGate here and outside it on the
phone: installing a licence is an owner's decision and needs a sign-in first, and
nothing is given away by asking for the password first when the server is
refusing the data either way.

| Method | Path | Who |
|---|---|---|
| GET | `/api/license` | signed in — state, Server ID, expiry, days left |
| POST | `/api/license` `{license}` | **owner** — installs the `.lic` text |

Clock rollback is caught the same way as on the phone: the furthest date the
server has seen is kept in the same row, and the stamp only ever moves forward —
so reinstalling a genuine licence does not forgive a wound-back clock either.

`server/test/api.test.ts` activates its test server through this whole flow with
your real key, so it needs `tools/vendor-private-key.txt` present. There is
deliberately no way to switch the check off for tests: a switch for the tests
would be a switch on a client's machine too.
