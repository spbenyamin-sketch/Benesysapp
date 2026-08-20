import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { settings, type Setting } from '@/db/schema';
import type { TaxMode } from '@/utils/gst';
import type { VoiceLang } from '@/modules/voice/types';

// Key/value store for business profile, invoice prefix, backup frequency, etc.
export async function getSetting(key: string): Promise<string | undefined> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value ?? undefined;
}

export async function listSettings(): Promise<Setting[]> {
  return db.select().from(settings);
}

// Upsert: insert or overwrite the value for a key.
export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function deleteSetting(key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}

/**
 * The shop's own details, as they head a printed bill or statement. Read in one
 * pass so a document never issues five queries for five fields, and kept here so
 * the keys are spelled in exactly one place.
 */
export interface BusinessProfile {
  name: string;
  gstin?: string;
  address?: string;
  phone?: string;
  /** The shop's state — one half of the CGST+SGST vs IGST decision. */
  state?: string;
  /** file:// uris inside the app's own storage — see modules/settings/brandImages. */
  logoUri?: string;
  signatureUri?: string;
  /** Free text printed at the foot of every bill: warranty, return policy. */
  terms?: string;
  /** UPI id ("shop@okaxis"), which becomes a scan-to-pay code on the bill. */
  upiId?: string;
}

export async function getBusinessProfile(): Promise<BusinessProfile> {
  const rows = await listSettings();
  const map = new Map(rows.map((r) => [r.key, r.value ?? '']));
  return {
    name: map.get('business_name') || 'My Business',
    gstin: map.get('business_gstin') || undefined,
    address: map.get('business_address') || undefined,
    phone: map.get('business_phone') || undefined,
    state: map.get('business_state') || undefined,
    logoUri: map.get('business_logo') || undefined,
    signatureUri: map.get('business_signature') || undefined,
    terms: map.get('invoice_terms') || undefined,
    upiId: map.get('business_upi') || undefined,
  };
}

// ── Typed accessors for settings the whole app reads ──────────────────────────
// Kept here (not scattered through screens) so a key is spelled in exactly one
// place and a missing/garbage value always falls back to a safe default.

/** Default GST entry style for new invoices & quick bills. See utils/gst TaxMode. */
export const TAX_MODE_KEY = 'tax_mode';

export async function getDefaultTaxMode(): Promise<TaxMode> {
  return (await getSetting(TAX_MODE_KEY)) === 'inclusive' ? 'inclusive' : 'exclusive';
}

export async function setDefaultTaxMode(mode: TaxMode): Promise<void> {
  await setSetting(TAX_MODE_KEY, mode);
}

/**
 * The paper the shop's bills come out on:
 *   'a4'        → the full tax invoice sheet (modules/invoices/pdf)
 *   'thermal58' → a 58mm counter receipt (modules/invoices/thermal)
 * Set once and read by every print/share in the app, so a counter with one
 * thermal printer is never asked which paper it wants.
 */
export type PrintFormat = 'a4' | 'thermal58';

export const PRINT_FORMAT_LABEL: Record<PrintFormat, string> = {
  a4: 'A4 sheet',
  thermal58: '58mm thermal',
};

export const PRINT_FORMAT_KEY = 'print_format';

export async function getPrintFormat(): Promise<PrintFormat> {
  return (await getSetting(PRINT_FORMAT_KEY)) === 'thermal58' ? 'thermal58' : 'a4';
}

export async function setPrintFormat(format: PrintFormat): Promise<void> {
  await setSetting(PRINT_FORMAT_KEY, format);
}

/** Recognition language for voice commands ('ta-IN' Tamil / 'en-IN' English). */
export const VOICE_LANG_KEY = 'voice_lang';
export const VOICE_SPEAK_KEY = 'voice_speak'; // '1' = speak confirmations back

export async function getVoiceLang(): Promise<VoiceLang> {
  return (await getSetting(VOICE_LANG_KEY)) === 'en-IN' ? 'en-IN' : 'ta-IN';
}

export async function setVoiceLang(lang: VoiceLang): Promise<void> {
  await setSetting(VOICE_LANG_KEY, lang);
}

export async function getVoiceSpeak(): Promise<boolean> {
  return (await getSetting(VOICE_SPEAK_KEY)) !== '0';
}

export async function setVoiceSpeak(on: boolean): Promise<void> {
  await setSetting(VOICE_SPEAK_KEY, on ? '1' : '0');
}
