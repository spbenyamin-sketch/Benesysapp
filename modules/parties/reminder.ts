// Asking for money, on WhatsApp — the one channel a small shop and its customers
// already share. The shop taps once; the message opens ready to send, never sent
// behind their back, so what goes out is always something they read first.
//
// Everything except the final `openURL` is pure, because the wording and the
// phone-number handling are the parts that can embarrass a shopkeeper.

import { Linking } from 'react-native';
import { formatMoney } from '@/utils/format';
import type { VoiceLang } from '@/modules/voice/types';
import type { Party } from '@/db/schema';

/** India, where this app's shops are. Kept named rather than sprinkled about. */
const DEFAULT_COUNTRY_CODE = '91';

/**
 * A phone as it was typed → what WhatsApp needs: country code and number, digits
 * only. Handles the shapes a shopkeeper actually enters — "98765 43210",
 * "+91 98765-43210", "098765 43210". Returns null when there is nothing usable,
 * so the caller can hide the button instead of opening a broken chat.
 */
export function whatsappPhone(
  raw: string | null | undefined,
  countryCode = DEFAULT_COUNTRY_CODE,
): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  // A leading trunk zero is for dialling inside the country; WhatsApp wants the
  // international form.
  const local = digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  if (local.length === 10) return `${countryCode}${local}`;
  return local;
}

export interface ReminderContext {
  partyName: string;
  balance: number; // paise owed to the shop
  businessName: string;
  lang: VoiceLang;
  /** Age of the oldest unpaid money, in days. Named only when it is real. */
  oldestDays?: number;
}

/**
 * The message itself. Polite, short, and it states the amount — a reminder that
 * makes the customer open the app to find out what it is about is a reminder
 * that gets ignored. The age is mentioned only past a month, where it is a fact
 * rather than a nudge.
 */
export function reminderMessage(ctx: ReminderContext): string {
  const amount = formatMoney(Math.abs(ctx.balance));
  const aged = (ctx.oldestDays ?? 0) > 30;
  if (ctx.lang === 'ta-IN') {
    return [
      `வணக்கம் ${ctx.partyName},`,
      `${ctx.businessName} கணக்கில் ${amount} நிலுவை உள்ளது.`,
      aged ? `மிகப் பழைய தொகை ${ctx.oldestDays} நாட்களாக உள்ளது.` : '',
      'வசதியான போது கொடுத்தால் நன்றாக இருக்கும். நன்றி.',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    `Hello ${ctx.partyName},`,
    `${amount} is outstanding on your account with ${ctx.businessName}.`,
    aged ? `The oldest amount has been pending ${ctx.oldestDays} days.` : '',
    'Please settle it when convenient. Thank you.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The app link — opens the chat directly when WhatsApp is installed. */
export function whatsappAppUrl(phone: string, message: string): string {
  return `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
}

/** The web link — works from a browser, and hands off to the app if there is one. */
export function whatsappWebUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export type ReminderResult = 'opened' | 'no-phone' | 'failed';

/**
 * Open WhatsApp with the reminder typed out and waiting. The app link is tried
 * first because it lands straight in the chat; a phone without WhatsApp falls
 * back to the web link rather than failing silently.
 */
export async function sendWhatsAppReminder(
  party: Pick<Party, 'name' | 'phone'>,
  ctx: Omit<ReminderContext, 'partyName'>,
): Promise<ReminderResult> {
  const phone = whatsappPhone(party.phone);
  if (!phone) return 'no-phone';
  const message = reminderMessage({ ...ctx, partyName: party.name });
  try {
    await Linking.openURL(whatsappAppUrl(phone, message));
    return 'opened';
  } catch {
    try {
      await Linking.openURL(whatsappWebUrl(phone, message));
      return 'opened';
    } catch {
      return 'failed';
    }
  }
}
