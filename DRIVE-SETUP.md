# Google Drive backup — one-time setup

The app can back your whole database up to **your own Google Drive**, the way
WhatsApp does: sign in once, every backup goes up automatically, and after a
reinstall you sign in with the same Google account and get your data back.

Nothing goes through any server of ours, and no data is emailed. The app asks
for the **narrowest Drive permission Google offers** (`drive.file`) — it can only
see the files it created itself, in a folder called **Benesys Billing Backups**.

Because Google ties Android OAuth to *your* app's package name and signing key,
the client ID has to be created once in your own Google account. It takes about
ten minutes and you never touch it again.

---

## What you need first

- The **EAS development build** (the same one the voice commands need — see
  `VOICE-SETUP.md`). Drive sign-in **cannot work in Expo Go**: Expo Go's URL
  scheme is not this app's package name, so Google refuses the callback.
- A Google account.

---

## Step 1 — Get your app's SHA-1 fingerprint

Google needs the fingerprint of the key EAS signs the app with.

```bash
eas credentials
```

Pick **Android** → the build profile you use (`development`) → **Keystore:
Manage everything…** → it prints `SHA1 Fingerprint: AB:CD:…`.
Copy that whole colon-separated string.

If it says no keystore exists yet, let EAS generate one (it offers), or just run
the build once and come back.

---

## Step 2 — Make a Google Cloud project

1. Go to <https://console.cloud.google.com/>
2. Top bar → project dropdown → **New Project** → name it `Benesys Billing` →
   **Create**, then make sure it is the selected project.

---

## Step 3 — Turn on the Drive API

**APIs & Services → Library** → search **Google Drive API** → **Enable**.

---

## Step 4 — Fill the OAuth consent screen

**APIs & Services → OAuth consent screen**

- User type: **External** → Create
- App name: `Benesys Billing`, user support email: your address
- Developer contact: your address → Save and continue
- Scopes: **Add or remove scopes** → search `drive.file` → tick
  `.../auth/drive.file` → Update → Save and continue
- Test users: add your own Gmail address → Save

Then, on the consent screen page, press **PUBLISH APP** (publishing status →
*In production*).

> **Why publish?** While the app sits in *Testing*, Google expires the refresh
> token after **7 days**, so you would have to sign in again every week.
> Published apps keep it indefinitely. `drive.file` is Google's narrowest Drive
> scope and normally goes to production without any verification review. If
> Google does ask you to verify, you can stay in *Testing* instead — everything
> still works, you just re-connect the account about once a week.

---

## Step 5 — Create the Android OAuth client

**APIs & Services → Credentials → + Create credentials → OAuth client ID**

- Application type: **Android**
- Name: `Benesys Billing Android`
- Package name: `com.benesys.billingapp`
- SHA-1 certificate fingerprint: the one from Step 1
- **Create**

Then **open the client you just made** and, under **Advanced Settings**, switch on
**Enable Custom URI Scheme** → **Save**. Google ships new Android clients with it
off, and without it sign-in dies on *Error 400: invalid_request — Custom URI
scheme is not enabled for your Android client*. The change takes a few minutes to
take effect.

Copy the client ID it shows — it looks like:

```
123456789012-abcdefghijklmnop.apps.googleusercontent.com
```

It is **not a secret**. Android OAuth clients have no secret at all; the package
name + SHA-1 are what protect them.

---

## Step 6 — Put the client ID in the app

Two ways — either is fine.

**A. In the app (no rebuild):**
Settings → *Google Drive backup* → **Google client ID (advanced)** → paste →
tap outside the box to save.

**B. In the code (baked into every build):**
`app.json` → `expo.extra.googleClientId` → paste between the quotes → rebuild.

The pasted-in value wins over the one in `app.json`, and it is kept in
SecureStore, so restoring a backup never wipes it.

---

## Step 7 — Connect and test

1. Settings → **Sign in with Google** → pick your account → Allow.
   It should then show `✓ your@gmail.com`.
2. **Back up to Drive now** → open Drive on any device → the folder
   **Benesys Billing Backups** has a `billing-backup-….json` in it.
3. Turn **Automatic backup** on and pick how many times a day. Each run saves a
   snapshot on the phone (last 10 kept) and uploads it (last 20 kept in Drive).

### The reinstall test — worth doing once

1. Uninstall the app, install the build again.
2. On the **Create your account** screen tap
   *"Used this app before? Restore from Google Drive"*.
3. Sign in with the same Google account → pick the newest backup → Restore.
4. Create your login again (username/password live only on the phone and are
   deliberately never part of a backup), and everything is back.

---

## If something goes wrong

| What you see | What it means |
| --- | --- |
| `Error 400: invalid_request` — *Custom URI scheme is not enabled* | Step 5's **Enable Custom URI Scheme** switch is still off on the Android client. |
| `Error 400: redirect_uri_mismatch` | The OAuth client isn't the **Android** type, or the package name isn't `com.benesys.billingapp`. |
| `Error 403: access_denied` | The app is in *Testing* and your address isn't in the test users list — or the consent screen was never published. |
| Sign-in page opens then nothing happens | You're running in **Expo Go**. Install the EAS development build. |
| `Google access expired — connect the account again` | The refresh token died (7-day *Testing* expiry, password change, or access revoked). Sign in again; publish the consent screen to stop it recurring. |
| `Drive 403: … insufficient permissions` | The Drive API wasn't enabled on the project (Step 3). |

## Where things live in the code

| File | What it does |
| --- | --- |
| `modules/backup/drive.ts` | OAuth (PKCE, refresh) + the Drive REST calls |
| `modules/backup/DriveRestorePicker.tsx` | The "pick a backup to restore" sheet |
| `modules/backup/auto.ts` | Schedule + phone snapshots (destination-agnostic) |
| `modules/backup/useAutoBackup.ts` | Runs the schedule on open/foreground |
| `modules/backup/service.ts` | Builds the JSON, restores it, shares a local copy |

Tokens are kept in **SecureStore**, never in the database — a restore wipes every
table, so a token stored there would be destroyed (or swapped for someone
else's) the moment you restored a backup.
