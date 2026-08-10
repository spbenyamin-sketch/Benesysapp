// The System ID a client reads out to the vendor over the phone.
//
// The VFP build hashes three WMI serials (CPU, board, BIOS). Android has no
// equivalent a normal app may read — hardware serials have been permission-
// gated since Android 10 — so the anchor is ANDROID_ID: a value the OS derives
// per app-signing-key per user, stable across app updates and reinstalls, and
// reset only by a factory reset. That is the right granularity here: the licence
// is meant to survive the client reinstalling the app, and to die with the phone.
//
// It is hashed with the package name before being shown, so what travels over
// WhatsApp is not the raw device identifier.

import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { formatKey } from './key';

const K_FALLBACK = 'license.deviceSeed';
const ID_HEX_LEN = 16;

let cached: string | null = null;

async function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

/**
 * A per-install random seed, used when the platform gives us nothing stable
 * (iOS simulators, an Android build that returns an empty ANDROID_ID). It is
 * written once and kept in the Keystore, so the System ID stays put for as long
 * as the app is installed — a reinstall would need a fresh key, which is worse
 * than ANDROID_ID but still better than refusing to run.
 */
async function fallbackSeed(): Promise<string> {
  const existing = await SecureStore.getItemAsync(K_FALLBACK);
  if (existing) return existing;
  const bytes = Crypto.getRandomBytes(16);
  const seed = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  await SecureStore.setItemAsync(K_FALLBACK, seed);
  return seed;
}

async function hardwareAnchor(): Promise<string> {
  try {
    if (Platform.OS === 'android') {
      const androidId = Application.getAndroidId();
      if (androidId) return `android:${androidId}`;
    } else if (Platform.OS === 'ios') {
      const vendorId = await Application.getIosIdForVendorAsync();
      if (vendorId) return `ios:${vendorId}`;
    }
  } catch {
    // Fall through to the seed — a licence screen that throws is worse than one
    // anchored to the install.
  }
  return `seed:${await fallbackSeed()}`;
}

/** "9F3C-11AB-7E20-04D5" — stable for this app on this device. */
export async function getSystemId(): Promise<string> {
  if (cached) return cached;
  const anchor = await hardwareAnchor();
  const digest = await sha256(`${anchor}|${Application.applicationId ?? 'billing-app'}`);
  cached = formatKey(digest.slice(0, ID_HEX_LEN).toUpperCase());
  return cached;
}

/** Test/diagnostic hook — forces the next getSystemId() to recompute. */
export function forgetSystemId(): void {
  cached = null;
}
