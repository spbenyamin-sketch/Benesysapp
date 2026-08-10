# Licensing — device lock + expiry

The app is sold as a direct install (no Play Store), so each copy is tied to one
phone and stops working on a date you choose. It is the same lock the VFP
product uses (`HWLock` in `MAIN.PRG` + `KEYGEN.PRG`), rebuilt for Android.

Nothing here needs a server or an internet connection — on your side or the
client's.

## The everyday flow

1. Client installs the APK and opens it. Instead of the login screen they get
   **Activate Billing App**, showing a **System ID** like `9F3C-11AB-7E20-04D5`.
2. They tap **Send System ID** and it arrives on your phone over WhatsApp.
3. You open `tools/keygen.html` (double-click — it runs offline in the browser),
   paste the System ID, pick an expiry date, press **Generate key**.
4. Send the key back. They type it in, tap **Activate**, and the app opens.

Renewal is the same four steps. The client can do it early from
**Settings → Licence → Enter key** — no need to wait for the lockout.

## What the client sees

| Situation | What happens |
|---|---|
| Never activated | Activation screen; app cannot be used |
| Activated, more than 7 days left | Normal; expiry shown in Settings |
| 7 days or fewer left | Normal, plus an orange warning in Settings |
| Expiry date passed | **Licence expired** screen; data untouched, a renewal key restores it |
| Phone date wound back | **Phone's date was changed** screen |

## How it works

**System ID** — SHA-256 of Android's `ANDROID_ID` plus the package name, shortened
to 16 hex characters. `ANDROID_ID` survives app updates and reinstalls, and
changes only on a factory reset. That is deliberate: a client who reinstalls the
app (or restores a Drive backup onto the same phone) keeps their licence, but the
APK copied to a second phone will not activate with the same key.

**Key** — 20 hex characters in five groups:

```
XXXX - XXXX XXXX XXXX XXXX
 └┬─┘   └────────┬───────┘
  │              └─ 64 bits of SHA-256(SystemID | expiry | secret)
  └─ expiry as a day number, masked with a value derived from the System ID
```

The expiry travels inside the key, so verification is one hash — the VFP version
has to try every date for ten years to work out what a key means.

**Storage** — SecureStore (Android Keystore), never SQLite. Restoring a backup
wipes and reloads every table, so a licence kept in the database would be
replaced by whatever was in the backup file.

**Rollback** — the date of every launch is recorded. If the phone's date is ever
earlier than that, the app locks. This is what stops "just set the clock back".

## Files

| File | Role |
|---|---|
| `tools/keygen.html` | **Vendor only.** The key generator. Never ships to a client. |
| `modules/license/secret.ts` | The shared secret. Must match `keygen.html`. |
| `modules/license/key.ts` | Key format — generate, verify, dates. Pure, tested. |
| `modules/license/device.ts` | System ID derivation |
| `modules/license/service.ts` | Stored state, activation, expiry and rollback rules |
| `components/LicenseGate.tsx` | The lockout screen, outermost in `app/_layout.tsx` |
| `modules/license/LicenseCard.tsx` | The Settings section |

`modules/license/__tests__/keygen-html.test.ts` runs the generator's own code out
of the HTML file and checks it still mints exactly what the app accepts — if the
two ever drift apart, that test fails instead of a client being locked out.

## Changing the secret

Editing `LICENSE_SECRET` invalidates **every key ever issued**. If you do it,
change the copy in `tools/keygen.html` in the same commit (the test above will
catch you if you forget), and expect to re-issue keys to every client.

## Honest limits

The secret ships inside the APK, exactly as it ships inside the VFP `.EXE`. Someone
who decompiles the bundle can extract it and mint their own keys. This stops
casual copying — one client passing the APK to another shop — which is what it is
for. It is not protection against a determined reverse-engineer, and no offline
scheme can be.
