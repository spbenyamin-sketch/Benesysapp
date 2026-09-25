// Date and display helpers shared by the licence code. Pure, so the tests, the
// app and tools/keygen.html all agree on what "expires on 2027-08-10" means.

/** ISO 'YYYY-MM-DD' → days since 1 Jan 2020. NaN for anything unparseable. */
export function dayNumber(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? '').trim());
  if (!m) return NaN;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const ms = Date.UTC(year, month - 1, day);
  // Date.UTC happily rolls 2026-02-31 over into March; reject that.
  const back = new Date(ms);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() + 1 !== month || back.getUTCDate() !== day) {
    return NaN;
  }
  return Math.round((ms - Date.UTC(2020, 0, 1)) / 86400000);
}

/** True when the string is a real calendar day in ISO form. */
export function isValidDate(iso: string): boolean {
  return Number.isFinite(dayNumber(iso));
}

/** Whole days from `from` to `to` (negative once `to` is in the past). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/**
 * Today in the phone's OWN timezone, as ISO 'YYYY-MM-DD'. Not UTC: at 00:30 in
 * India a UTC date is still yesterday, and an expiry check must not lose a day
 * to that.
 */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "9F3C11AB7E2004D5" → "9F3C-11AB-7E20-04D5", for reading out over the phone. */
export function groupFour(text: string): string {
  return (text.match(/.{1,4}/g) ?? []).join('-');
}

/** `iso` moved `days` forward (or back, when negative), as ISO 'YYYY-MM-DD'. */
export function addDays(iso: string, days: number): string {
  const n = dayNumber(iso);
  if (!Number.isFinite(n)) return iso;
  const d = new Date(Date.UTC(2020, 0, 1) + (n + days) * 86400000);
  return d.toISOString().slice(0, 10);
}
