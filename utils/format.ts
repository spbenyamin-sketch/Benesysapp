// Display/parse helpers for the money + date conventions defined in db/schema.ts.
// Money is stored as INTEGER paise; dates as ISO 8601 strings. UI is the ONLY
// layer that turns those into human strings (and back), so all of that lives here.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Indian digit grouping: last 3 digits, then groups of 2 (12,34,567).
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length) parts.unshift(rest);
  return `${parts.join(',')},${last3}`;
}

/** paise → "₹1,23,456.00" (negative values keep a leading minus). */
export function formatMoney(paise: number): string {
  const rounded = Math.round(paise);
  const neg = rounded < 0;
  const abs = Math.abs(rounded);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const s = `₹${groupIndian(String(rupees))}.${String(p).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

/** User rupee input ("1,500" / "1500.50" / "₹99") → integer paise. Blank/invalid → 0. */
export function parseRupeesToPaise(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
  const val = parseFloat(cleaned);
  if (Number.isNaN(val)) return 0;
  return Math.round(val * 100);
}

/** paise → editable rupee string for prefilling a form ("" when zero). */
export function paiseToRupeeInput(paise: number): string {
  if (!paise) return '';
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

/**
 * ISO ('YYYY-MM-DD' or full timestamp) → "5 Jul 2026".
 * Anything that isn't a date is handed back untouched — note the NaN checks:
 * `NaN < 0 || NaN > 11` is false, so a range test alone would let "not-a-date"
 * through and print "NaN undefined not".
 */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  const mi = Number(m) - 1;
  const day = Number(d);
  if (!y || !d || !Number.isInteger(mi) || mi < 0 || mi > 11 || !Number.isFinite(day)) return iso;
  return `${day} ${MONTHS[mi]} ${y}`;
}

// ── Day arithmetic on ISO 'YYYY-MM-DD' days ──────────────────────────────────
// Everything here works in UTC on purpose. A bill's date is a DAY, not a moment;
// parsing it in the phone's local zone would shift it by one either side of
// midnight and make a bill fall due on the wrong day.

/** An ISO day → milliseconds at UTC midnight. NaN when it isn't a date. */
function dayMs(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

const DAY = 86400000;

/** ISO day + n days → ISO day. A negative n goes backwards. */
export function addDays(iso: string, days: number): string {
  const ms = dayMs(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms + days * DAY).toISOString().slice(0, 10);
}

/**
 * Whole days from one ISO day to another; negative when `to` is earlier.
 * Returns 0 if either side isn't a date, so a corrupt row ages as "today"
 * rather than landing in a bucket by accident.
 */
export function daysBetween(from: string, to: string): number {
  const a = dayMs(from);
  const b = dayMs(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY);
}

/**
 * How a signed ledger balance reads to the user.
 * Sign convention (see db/schema.ts): > 0 → party owes YOU (receivable);
 * < 0 → you owe the party (payable); 0 → settled.
 */
export function balanceSummary(paise: number): { label: string; toneColor: string } {
  if (paise > 0) return { label: 'To collect', toneColor: '#1a9d5a' };
  if (paise < 0) return { label: 'To pay', toneColor: '#c0392b' };
  return { label: 'Settled', toneColor: '#888' };
}

// ── Quantity / stock (stored as INTEGER thousandths: 2.5 units = 2500) ────────
/** thousandths → "2.5" / "10" (trailing zeros trimmed). */
export function formatQty(thousandths: number): string {
  const v = thousandths / 1000;
  return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(3)));
}

/** User qty input → integer thousandths. Blank/invalid → 0. */
export function parseQtyToThousandths(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
  const v = parseFloat(cleaned);
  return Number.isNaN(v) ? 0 : Math.round(v * 1000);
}

/** thousandths → editable qty string ("" when zero). */
export function qtyToInput(thousandths: number): string {
  return thousandths ? formatQty(thousandths) : '';
}

// ── Tax rate (stored as INTEGER basis points: 18% = 1800) ─────────────────────
/** basis points → "18%" / "2.5%". */
export function formatTaxRate(basisPoints: number): string {
  const v = basisPoints / 100;
  return `${Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(2)))}%`;
}

/** User percent input ("18" / "2.5") → integer basis points. Blank/invalid → 0. */
export function parseTaxRateToBasisPoints(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
  const v = parseFloat(cleaned);
  return Number.isNaN(v) ? 0 : Math.round(v * 100);
}

/** basis points → editable percent string ("" when zero). */
export function taxRateToInput(basisPoints: number): string {
  if (!basisPoints) return '';
  const v = basisPoints / 100;
  return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(2)));
}
