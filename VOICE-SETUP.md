# Voice commands — one-time setup

The app now takes Tamil + English voice commands on **every screen** ("ரெண்டு டீ", "பில் போடு",
"முகப்பு", "எக்செல்"…). Everything except the microphone itself already works in the current build.

## Why a one-time build is needed

Expo Go has **no speech-to-text engine**. Reading the microphone needs a native module
(`expo-speech-recognition`), and native modules can only be added by building your own app.
So voice stays greyed out in Expo Go — you'll see "Voice needs the development build" — until you
install a **development build** once. After that, everything keeps working exactly like today
(`npm start`, scan/enter the URL), just with the mic alive.

You do **not** need Android Studio, the Android SDK or Java on this PC — EAS builds in Expo's cloud.

## Steps (once, ~15 minutes, mostly waiting)

```bash
npm install -g eas-cli          # if you don't have it
eas login                       # your Expo account (free) — run this yourself, it's interactive
eas build --profile development --platform android
```

The `development` profile is already configured in `eas.json` and produces an **APK**.
When the build finishes, EAS prints a link/QR — open it on the phone and install the APK
(allow "install unknown apps" if Android asks). Uninstalling Expo Go is not necessary.

From then on:

```bash
npm start
```

…and open the project in the **new app** (the one named "Billing App") instead of Expo Go, same
as before — LAN URL `exp://<tether-ip>:8081`.

### First launch

Android asks for microphone permission the first time you tap 🎙 — allow it.

### Offline speech (recommended)

To make recognition work with no internet, download the offline language packs on the phone:

**Settings → System → Languages & input → On-device speech recognition** → add **தமிழ் (Tamil)**
and **English (India)**. Without them Android falls back to Google's online recogniser, which
needs a data connection.

### If the EAS build fails on `expo-speech-recognition`

The published package targets Expo SDK 56 and this project is on SDK 57, so a native compile error
there is the one plausible failure. If it happens:

```bash
npx expo install expo-speech-recognition   # picks an SDK-compatible version if one exists
```

Nothing else in the app depends on it — removing the package and its `app.json` plugin entry
returns you to a working build with voice disabled.

## Using it

- **🎙 button** — bottom right of every screen. Tap to start, tap again to stop. It keeps
  listening, so you can speak bill after bill without touching the phone.
- **Language chip** (தமிழ் / English) — next to the mic, or in Settings. Android's recogniser
  listens in one language per session, so switch it to match how you speak. The command grammar
  itself always understands both, plus Tanglish ("rendu tea").
- **? button** — the full command list, in the selected language.
- **Talk-back** — confirmations are spoken aloud ("ரெண்டு டீ சேர்த்தாச்சு"). Turn it off in
  Settings if the counter is noisy.

## Making Tamil item names work

The recogniser returns Tamil text, but your items are probably named in English. Fill the
**"Voice name (தமிழ்)"** field on each item (and party) with what you actually *say*:

| Item name | Voice name |
|---|---|
| `Tea` | `டீ, chai, tea` |
| `Sugar 1kg` | `சர்க்கரை, sakkarai` |
| `Idly` | `இட்லி` |

Comma-separate as many spellings as you like. Items without an alias are still matched fuzzily
against their English name.

## Notes

- Nothing is sent to a server by the app itself: recognition runs through Android's speech
  service (on-device when the language pack is installed).
- The mic never stays hot in the background — it is stopped when you leave the screen or close
  the app.
