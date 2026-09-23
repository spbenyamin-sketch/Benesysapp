// Resetting a forgotten password without the old one is the only door into a
// shop's books that opens without the password, so what it refuses matters more
// than what it allows: no phone lock enrolled, a cancelled prompt, or a password
// too short must all leave the stored hash exactly as it was.

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null),
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));

jest.mock('expo-crypto', () => {
  const { createHash, randomBytes } = require('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algo: string, input: string) =>
      createHash('sha256').update(input).digest('hex'),
    getRandomBytes: (n: number) => new Uint8Array(randomBytes(n)),
  };
});

const mockLock = { enrolled: true, unlocks: true };

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
  hasHardwareAsync: async () => true,
  isEnrolledAsync: async () => mockLock.enrolled,
  supportedAuthenticationTypesAsync: async () => [1],
  authenticateAsync: async () => ({ success: mockLock.unlocks }),
}));

import { resetPasswordWithDeviceLock, signIn, signUp } from '@/modules/auth/service';

const ACCOUNT = { email: 'shop@example.com', username: 'shopowner', password: 'first-pass' };

beforeEach(async () => {
  mockStore.clear();
  mockLock.enrolled = true;
  mockLock.unlocks = true;
  await signUp({ ...ACCOUNT });
});

const storedHash = () => mockStore.get('auth.hash');

describe('resetting a forgotten password', () => {
  it('sets a new password once the phone lock says yes', async () => {
    const before = storedHash();
    await resetPasswordWithDeviceLock('second-pass');
    expect(storedHash()).not.toBe(before);

    const account = await signIn('shopowner', 'second-pass');
    expect(account.username).toBe('shopowner');
    await expect(signIn('shopowner', ACCOUNT.password)).rejects.toThrow('Wrong username or password.');
  });

  it('keeps the email and username — only the password changes', async () => {
    await resetPasswordWithDeviceLock('second-pass');
    expect(mockStore.get('auth.username')).toBe('shopowner');
    expect(mockStore.get('auth.email')).toBe('shop@example.com');
  });

  it('refuses when the phone has no fingerprint, PIN or pattern set', async () => {
    mockLock.enrolled = false;
    const before = storedHash();
    await expect(resetPasswordWithDeviceLock('second-pass')).rejects.toThrow('no fingerprint');
    expect(storedHash()).toBe(before);
    await expect(signIn('shopowner', ACCOUNT.password)).resolves.toBeTruthy();
  });

  it('refuses when the unlock prompt is cancelled or not recognised', async () => {
    mockLock.unlocks = false;
    const before = storedHash();
    await expect(resetPasswordWithDeviceLock('second-pass')).rejects.toThrow('not changed');
    expect(storedHash()).toBe(before);
  });

  it('refuses a password too short to be one, without prompting at all', async () => {
    const before = storedHash();
    await expect(resetPasswordWithDeviceLock('ab')).rejects.toThrow('at least 4 characters');
    expect(storedHash()).toBe(before);
  });

  it('refuses on a phone nobody has signed up on', async () => {
    mockStore.clear();
    await expect(resetPasswordWithDeviceLock('second-pass')).rejects.toThrow('No account');
  });
});
