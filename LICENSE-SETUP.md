# Licensing — device lock + expiry

The app is sold as a direct install (no Play Store), so each copy is tied to one
phone and stops working on a date you choose. Same idea as the VFP product's
`HWLock`, with one important difference: the APK carries only a **public** key,
so a decompiled bundle cannot be used to issue licences.

Nothing here needs a server or an internet connection — on your side or the
client's.

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
| `tools/keygen.html` | **Vendor only.** Issues and checks licence files. |
| `tools/noble-ed25519.js` | The signing library, vendored as a plain script (`tools/vendor-noble.mjs` regenerates it) so the page works from `file://` |
| `tools/new-vendor-key.mjs` | Mints a new keypair |
| `modules/license/publicKey.ts` | Public key, ships in the APK |
| `modules/license/licenseFile.ts` | Licence format — canonical message, parse, verify |
| `modules/license/device.ts` | System ID derivation |
| `modules/license/service.ts` | Stored state, activation, expiry and rollback rules |
| `components/LicenseGate.tsx` | The lockout screen, outermost in `app/_layout.tsx` |
| `modules/license/LicenseCard.tsx` | The Settings section |

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
