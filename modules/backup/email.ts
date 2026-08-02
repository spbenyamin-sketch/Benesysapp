// Emailing the automatic backup.
//
// A phone app has no mail server of its own, so there are exactly two honest
// ways to get a backup into an inbox — and this module supports both:
//
//   'ask'  (default, nothing to set up) — the scheduled backup is written and
//          remembered as "waiting to be emailed". The next time the app is
//          opened it offers a one-tap Send, which hands the file to the phone's
//          own mail app (Gmail etc.) already addressed and attached.
//
//   'auto' (fully hands-off) — the file is POSTed to a transactional email
//          service with the user's own API key, so it arrives with nobody
//          touching the phone. The provider is detected from the key itself, so
//          there is no extra dropdown to get wrong:
//            re_…       → Resend      (resend.com)
//            xkeysib-…  → Brevo       (brevo.com)
//
// Either way the phone copy and the synced-folder copy still happen first — the
// email is an extra destination, never the only one.

import { File } from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import { hasInternet } from '@/modules/backup/auto';
import { deleteSetting, getSetting, setSetting } from '@/modules/settings/service';

export const EMAIL_TO_KEY = 'backup_email'; // shared with the manual export
export const EMAIL_MODE_KEY = 'backup_email_mode';
export const EMAIL_API_KEY = 'backup_email_api_key';
export const EMAIL_SENDER_KEY = 'backup_email_sender';
export const EMAIL_PENDING_KEY = 'backup_email_pending';

export type EmailMode = 'off' | 'ask' | 'auto';

export interface EmailConfig {
  mode: EmailMode;
  to: string;
  apiKey: string;
  sender: string;
}

export interface EmailProvider {
  id: 'resend' | 'brevo';
  label: string;
}

/** Which service an API key belongs to — null when the key is missing/unknown. */
export function providerForKey(apiKey: string): EmailProvider | null {
  const k = (apiKey ?? '').trim();
  if (k.startsWith('re_')) return { id: 'resend', label: 'Resend' };
  if (k.startsWith('xkeysib-')) return { id: 'brevo', label: 'Brevo' };
  return null;
}

export async function getEmailConfig(): Promise<EmailConfig> {
  const [mode, to, apiKey, sender] = await Promise.all([
    getSetting(EMAIL_MODE_KEY),
    getSetting(EMAIL_TO_KEY),
    getSetting(EMAIL_API_KEY),
    getSetting(EMAIL_SENDER_KEY),
  ]);
  return {
    mode: mode === 'auto' || mode === 'ask' ? mode : 'off',
    to: (to ?? '').trim(),
    apiKey: (apiKey ?? '').trim(),
    sender: (sender ?? '').trim(),
  };
}

export async function setEmailMode(mode: EmailMode): Promise<void> {
  await setSetting(EMAIL_MODE_KEY, mode);
}

export async function setEmailApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (trimmed) await setSetting(EMAIL_API_KEY, trimmed);
  else await deleteSetting(EMAIL_API_KEY);
}

export async function setEmailSender(sender: string): Promise<void> {
  const trimmed = sender.trim();
  if (trimmed) await setSetting(EMAIL_SENDER_KEY, trimmed);
  else await deleteSetting(EMAIL_SENDER_KEY);
}

// ── The hands-off route: POST the backup to a mail API ───────────────────────

const SUBJECT = (nowIso: string) => `Billing app backup — ${nowIso.slice(0, 10)}`;
const BODY =
  'Automatic backup from your Billing App. Keep this JSON file safe — you can load it back with Settings → Restore from file.';

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // The API's own message is far more useful than "request failed" — a wrong
    // key or an unverified sender is the usual cause and both say so plainly.
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${text.slice(0, 180)}`.trim());
  }
}

async function sendViaApi(
  provider: EmailProvider,
  config: EmailConfig,
  file: File,
  nowIso: string,
): Promise<string> {
  const content = await file.base64();
  // Resend's shared sender only delivers to the account owner's own address,
  // which is exactly this use case; Brevo needs a sender it has verified.
  const from = config.sender || (provider.id === 'resend' ? 'onboarding@resend.dev' : config.to);

  if (provider.id === 'resend') {
    await post(
      'https://api.resend.com/emails',
      { Authorization: `Bearer ${config.apiKey}` },
      {
        from,
        to: [config.to],
        subject: SUBJECT(nowIso),
        text: BODY,
        attachments: [{ filename: file.name, content }],
      },
    );
  } else {
    await post(
      'https://api.brevo.com/v3/smtp/email',
      { 'api-key': config.apiKey },
      {
        sender: { email: from, name: 'Billing App' },
        to: [{ email: config.to }],
        subject: SUBJECT(nowIso),
        textContent: BODY,
        attachment: [{ content, name: file.name }],
      },
    );
  }
  return `Emailed to ${config.to}`;
}

// ── The one-tap route: remember the file, offer to send it later ──────────────

export async function getPendingEmail(): Promise<string | null> {
  return (await getSetting(EMAIL_PENDING_KEY)) || null;
}

export async function clearPendingEmail(): Promise<void> {
  await deleteSetting(EMAIL_PENDING_KEY);
}

/**
 * Hand the pending (or given) backup to the phone's mail app, prefilled. The
 * user still taps Send — nothing can send mail from their address without that.
 * Clears the pending marker once the composer has been through.
 */
export async function sendPendingByComposer(uri?: string): Promise<boolean> {
  const target = uri ?? (await getPendingEmail());
  if (!target) return false;
  const { to } = await getEmailConfig();
  if (!(await MailComposer.isAvailableAsync())) {
    throw new Error('No mail app is set up on this phone.');
  }
  await MailComposer.composeAsync({
    subject: SUBJECT(new Date().toISOString()),
    body: BODY,
    recipients: to ? [to] : undefined,
    attachments: [target],
  });
  await clearPendingEmail();
  return true;
}

/**
 * The `Uploader` handed to the backup scheduler. Returns a short message on
 * success, or null when emailing is switched off / not addressed — a phone-only
 * setup must never be reported as a failure.
 */
export async function emailBackup(file: File, nowIso: string): Promise<string | null> {
  const config = await getEmailConfig();
  if (config.mode === 'off') return null;
  if (!config.to) return null;

  const provider = providerForKey(config.apiKey);
  if (config.mode === 'auto' && provider) {
    if (await hasInternet()) return sendViaApi(provider, config, file, nowIso);
    // Offline right now — keep it and let flushPendingEmail() send it as soon
    // as the phone is back on a network.
    await setSetting(EMAIL_PENDING_KEY, file.uri);
    return 'No internet — will email when back online';
  }

  // No key (or 'ask' mode): park it for the one-tap send. A newer snapshot
  // simply replaces the older pending one — only the latest is worth sending.
  await setSetting(EMAIL_PENDING_KEY, file.uri);
  return 'Ready to email — open the app to send';
}

/**
 * Retry a backup that couldn't be emailed when it was made (the phone was
 * offline). Only meaningful in 'auto' mode — in 'ask' mode the pending file is
 * waiting for the user's tap, not for the network. Safe to call often; it does
 * nothing unless there is something to send.
 */
export async function flushPendingEmail(nowIso: string): Promise<string | null> {
  const uri = await getPendingEmail();
  if (!uri) return null;
  const config = await getEmailConfig();
  const provider = providerForKey(config.apiKey);
  if (config.mode !== 'auto' || !provider || !config.to) return null;

  const file = new File(uri);
  if (!file.exists) {
    // Pruned by the 10-snapshot cap before we ever got online.
    await clearPendingEmail();
    return null;
  }
  if (!(await hasInternet())) return null;

  const message = await sendViaApi(provider, config, file, nowIso);
  await clearPendingEmail();
  return message;
}
