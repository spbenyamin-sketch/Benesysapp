// App lock, delegated entirely to the phone's own screen lock — fingerprint,
// face or the device PIN/pattern. We never define our own PIN: the OS one is
// already set up, already secure, and already familiar to the user.

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const K_ENABLED = 'lock.enabled';

export interface LockCapability {
  /** Device has fingerprint/face hardware OR at least a PIN set. */
  available: boolean;
  /** Something is actually enrolled — without this, prompting would fail. */
  enrolled: boolean;
  /** "Fingerprint", "Face", "Screen lock" — for the settings label. */
  label: string;
}

export async function getLockCapability(): Promise<LockCapability> {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const kinds = new Set(types);
    const label = kinds.has(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? 'Face unlock'
      : kinds.has(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? 'Fingerprint'
        : 'Screen lock';
    return { available: hasHardware || enrolled, enrolled, label };
  } catch {
    return { available: false, enrolled: false, label: 'Screen lock' };
  }
}

export async function isLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(K_ENABLED)) === '1';
}

export async function setLockEnabled(on: boolean): Promise<void> {
  if (on) await SecureStore.setItemAsync(K_ENABLED, '1');
  else await SecureStore.deleteItemAsync(K_ENABLED);
}

/**
 * Show the system unlock prompt. `disableDeviceFallback: false` means a user
 * whose finger isn't recognised can still fall back to the device PIN — without
 * it, a wet thumb would lock them out of their own billing app mid-sale.
 */
export async function promptUnlock(): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Billing App',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return res.success;
  } catch {
    return false;
  }
}
