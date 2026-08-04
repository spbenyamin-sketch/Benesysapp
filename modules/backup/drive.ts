// Google Drive backup — the WhatsApp arrangement.
//
// Sign in once with a Google account and every backup is uploaded to a folder
// in that account's Drive. Reinstall the app, sign in with the same account,
// and the newest backup is offered back. Nothing is emailed, and no server of
// ours ever sees the data — it goes phone → the user's own Drive.
//
// Scope is `drive.file`, the narrowest one Google offers: this app can only see
// and touch files IT created. The rest of the user's Drive stays invisible to
// it, which is also why this scope needs no Google verification review.
//
// The tokens live in SecureStore, NOT the settings table — `restoreBackup()`
// wipes every table, so a token kept there would be destroyed (or replaced by
// someone else's) the moment a backup is restored. Same reasoning as the login
// credentials in modules/auth/service.ts.

import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { restoreBackupFromJson, type RestoreCounts } from '@/modules/backup/service';

WebBrowser.maybeCompleteAuthSession();

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'];

/**
 * Google's Android OAuth clients accept exactly one redirect shape: the app's
 * package name as the scheme. `app.json` registers the same string under
 * `scheme` so Android hands the callback back to us.
 */
export const REDIRECT_URI = AuthSession.makeRedirectUri({
  native: 'com.benesys.billingapp:/oauth2redirect',
});

const FOLDER_NAME = 'Benesys Billing Backups';
/** Snapshots to keep in Drive; older ones are deleted after each upload. */
const KEEP_IN_DRIVE = 20;

const K = {
  clientId: 'drive_client_id',
  refresh: 'drive_refresh_token',
  access: 'drive_access_token',
  expiry: 'drive_expires_at',
  email: 'drive_email',
} as const;

// ── Client id ────────────────────────────────────────────────────────────────
// Ships in app.json (extra.googleClientId) but can be pasted in Settings, so a
// wrong id doesn't cost a whole rebuild. The id is not a secret — Android OAuth
// clients have no secret at all; they're tied to the package name and signing
// certificate instead, which is what actually protects them.

function configuredClientId(): string {
  const extra = Constants.expoConfig?.extra as { googleClientId?: string } | undefined;
  return (extra?.googleClientId ?? '').trim();
}

export async function getClientId(): Promise<string> {
  const stored = (await SecureStore.getItemAsync(K.clientId))?.trim();
  return stored || configuredClientId();
}

export async function setClientId(id: string): Promise<void> {
  const trimmed = id.trim();
  if (trimmed) await SecureStore.setItemAsync(K.clientId, trimmed);
  else await SecureStore.deleteItemAsync(K.clientId);
}

// ── Sign in / out ────────────────────────────────────────────────────────────

export interface DriveStatus {
  configured: boolean; // a client id exists
  connected: boolean; // we hold a refresh token
  email: string | null;
}

export async function getDriveStatus(): Promise<DriveStatus> {
  const [clientId, refresh, email] = await Promise.all([
    getClientId(),
    SecureStore.getItemAsync(K.refresh),
    SecureStore.getItemAsync(K.email),
  ]);
  return { configured: !!clientId, connected: !!refresh, email: email ?? null };
}

async function saveTokens(token: AuthSession.TokenResponse): Promise<void> {
  // Google only returns a refresh token on the first consent, so an existing one
  // must survive a re-sign-in that doesn't include a new one.
  if (token.refreshToken) await SecureStore.setItemAsync(K.refresh, token.refreshToken);
  await SecureStore.setItemAsync(K.access, token.accessToken);
  const lifetime = (token.expiresIn ?? 3600) * 1000;
  await SecureStore.setItemAsync(K.expiry, String(Date.now() + lifetime));
}

async function fetchEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Opens Google's own sign-in page. Returns the connected account's address, or
 * null if the user backed out.
 */
export async function connectDrive(): Promise<string | null> {
  const clientId = await getClientId();
  if (!clientId) {
    throw new Error(
      'No Google client ID yet. Follow DRIVE-SETUP.md, then paste the ID in Settings.',
    );
  }

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
    usePKCE: true,
    // offline + consent is what makes Google hand back a refresh token, which is
    // what lets backups run later without the user signing in again.
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });

  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== 'success') {
    if (result.type === 'error') {
      throw new Error(result.error?.message ?? 'Google sign-in failed.');
    }
    return null; // dismissed or cancelled
  }

  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri: REDIRECT_URI,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    DISCOVERY,
  );

  await saveTokens(token);
  const email = await fetchEmail(token.accessToken);
  if (email) await SecureStore.setItemAsync(K.email, email);
  return email ?? '(signed in)';
}

export async function disconnectDrive(): Promise<void> {
  const [clientId, refresh] = await Promise.all([
    getClientId(),
    SecureStore.getItemAsync(K.refresh),
  ]);
  if (clientId && refresh) {
    try {
      await AuthSession.revokeAsync({ clientId, token: refresh }, DISCOVERY);
    } catch {
      /* the local tokens are cleared either way */
    }
  }
  await Promise.all([
    SecureStore.deleteItemAsync(K.refresh),
    SecureStore.deleteItemAsync(K.access),
    SecureStore.deleteItemAsync(K.expiry),
    SecureStore.deleteItemAsync(K.email),
  ]);
}

/** A valid access token, refreshed if the stored one has run out. */
async function getAccessToken(): Promise<string | null> {
  const [access, expiry, refresh, clientId] = await Promise.all([
    SecureStore.getItemAsync(K.access),
    SecureStore.getItemAsync(K.expiry),
    SecureStore.getItemAsync(K.refresh),
    getClientId(),
  ]);
  if (!refresh || !clientId) return null;

  const expiresAt = Number(expiry);
  // A minute of slack — a token that expires mid-upload is a failed backup.
  if (access && Number.isFinite(expiresAt) && Date.now() < expiresAt - 60_000) return access;

  try {
    const token = await AuthSession.refreshAsync({ clientId, refreshToken: refresh }, DISCOVERY);
    await saveTokens(token);
    return token.accessToken;
  } catch (e) {
    // The user revoked access, or changed their password. Clear the dead token
    // so the UI shows "not connected" instead of failing forever.
    await SecureStore.deleteItemAsync(K.refresh);
    throw new Error('Google access expired — connect the account again.');
  }
}

// ── Drive REST ───────────────────────────────────────────────────────────────

async function driveFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error('Google Drive is not connected.');
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive ${res.status}: ${text.slice(0, 180)}`);
  }
  return res;
}

/** The app's backup folder, made on first use. Only files we created are visible. */
async function ensureFolder(): Promise<string> {
  const q = encodeURIComponent(
    `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`,
  );
  const json = (await res.json()) as { files?: { id: string }[] };
  const existing = json.files?.[0]?.id;
  if (existing) return existing;

  const created = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  return ((await created.json()) as { id: string }).id;
}

export interface DriveBackup {
  id: string;
  name: string;
  createdTime: string;
  size: number;
}

/** Backups in Drive, newest first. */
export async function listDriveBackups(): Promise<DriveBackup[]> {
  const folderId = await ensureFolder();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&fields=files(id,name,size,createdTime)`,
  );
  const json = (await res.json()) as {
    files?: { id: string; name: string; size?: string; createdTime: string }[];
  };
  return (json.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    createdTime: f.createdTime,
    size: Number(f.size ?? 0),
  }));
}

async function pruneDrive(): Promise<void> {
  const files = await listDriveBackups();
  for (const f of files.slice(KEEP_IN_DRIVE)) {
    try {
      await driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: 'DELETE' });
    } catch {
      /* an old file we can't delete must not fail the new backup */
    }
  }
}

const BOUNDARY = 'benesys-backup-boundary';

/** Upload JSON text as a new file in the backup folder. Returns the Drive file id. */
async function uploadJson(name: string, json: string): Promise<string> {
  const folderId = await ensureFolder();
  const metadata = JSON.stringify({ name, parents: [folderId], mimeType: 'application/json' });
  // Multipart is built by hand: the body is plain text either way, and RN's
  // FormData would set its own boundary that Drive's parser then disagrees with.
  const body =
    `--${BOUNDARY}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${BOUNDARY}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    `${json}\r\n` +
    `--${BOUNDARY}--`;

  const res = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${BOUNDARY}` },
      body,
    },
  );
  return ((await res.json()) as { id: string }).id;
}

/**
 * The `Uploader` the backup scheduler calls. Returns null — a success, not a
 * failure — when no Google account is connected, so a phone-only setup is never
 * reported as broken.
 */
export async function uploadToDrive(file: File, _nowIso: string): Promise<string | null> {
  const { connected } = await getDriveStatus();
  if (!connected) return null;
  await uploadJson(file.name, await file.text());
  await pruneDrive();
  const email = await SecureStore.getItemAsync(K.email);
  return email ? `Uploaded to Drive (${email})` : 'Uploaded to Google Drive';
}

/** Upload right now, outside the schedule. Throws if not connected. */
export async function backupToDriveNow(nowIso: string, json: string): Promise<string> {
  const name = `billing-backup-${nowIso.replace(/[:.]/g, '-')}.json`;
  await uploadJson(name, json);
  await pruneDrive();
  return name;
}

/** DESTRUCTIVE — replaces all local data with the chosen Drive backup. */
export async function restoreFromDrive(fileId: string): Promise<RestoreCounts> {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  const text = await res.text();
  // Keep a copy of what was pulled down, so a restore that goes wrong still has
  // the file on the phone to try again with.
  try {
    const cached = new File(Paths.cache, 'drive-restore.json');
    if (cached.exists) cached.delete();
    cached.create();
    cached.write(text);
  } catch {
    /* the restore itself doesn't depend on this */
  }
  return restoreBackupFromJson(text);
}
