// Transcript → VoiceIntent[]. Pure functions only (no DB, no React), so the
// whole command grammar is testable in isolation and shared by every screen.
//
// The grammar is deliberately forgiving: shop speech is fast, mixed-language and
// full of filler. We never demand a fixed sentence shape — we look for a verb
// keyword, pull out any number, and treat whatever is left as the item/person
// name (fuzzy-matched later in match.ts against the actual catalogue).

import {
  ACTION_WORDS,
  BACKUP_WORDS,
  CODE_FIELDS,
  FIELD_WORDS,
  FILLER,
  KW,
  NAV_WORDS,
  NUM_COMPOUND,
  NUM_FRACTIONS,
  NUM_SCALES,
  NUM_WORDS,
  PARTY_WORDS,
  PAYMENT_MODE_WORDS,
  PICK_WORDS,
  TAMIL_DIGITS,
  TEXT_FIELDS,
} from './lexicon';
import type { NavTarget, VoiceIntent } from './types';

const DOT = '\u0001'; // placeholder so "2.5" survives sentence splitting

/** Words that force a "go to that screen" reading of an otherwise bare noun. */
const PAGE_WORDS = ['பக்கம்', 'பக்கத்துக்கு', 'ஸ்கிரீன்', 'டேப்', 'page', 'screen', 'tab', 'section'];

/** Verbs that mean "navigate/open", used with a page word or page noun. */
const GO_WORDS = [...KW.open, ...KW.newWord, 'போ', 'போங்க', 'செல்', 'po', 'go', 'goto', 'take', 'jump'];

export function normalize(text: string): string {
  let s = (text ?? '').toLowerCase().trim();
  for (const [glyph, digit] of Object.entries(TAMIL_DIGITS)) s = s.split(glyph).join(digit);
  // ₹500 / rs.500 → "500" (the currency word is filler anyway)
  s = s.replace(/[₹]/g, ' ');
  return s.replace(/\s+/g, ' ');
}

/** One utterance → clauses. "ரெண்டு டீ, மூணு காபி" → ['ரெண்டு டீ', 'மூணு காபி']. */
export function splitClauses(text: string): string[] {
  const guarded = normalize(text).replace(/(\d)[.](\d)/g, `$1${DOT}$2`);
  return guarded
    .split(/[,;،]|[.।?!]|\s+(?:மற்றும்|அப்புறம்|பிறகு|and|then|also)\s+/)
    .map((c) => c.split(DOT).join('.').trim())
    .filter(Boolean);
}

// Strip punctuation explicitly (rather than a \p{L} whitelist) so the regex
// stays plain-ASCII and Hermes-safe while leaving Tamil letters untouched.
const PUNCT = /[!?"'`():;،।/\\|+*=[\]{}<>~^%$#&_–—-]/g;

export function tokenize(clause: string): string[] {
  return clause
    .replace(PUNCT, ' ')
    .split(/[\s@]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// ── Keyword helpers ──────────────────────────────────────────────────────────
// Tamil glues suffixes onto stems ("பில்" → "பில்லு", "பில்ல"), so an exact
// token match is tried first and a prefix/substring match is the fallback.

// eslint-disable-next-line no-control-regex
const NON_ASCII = /[^\x00-\x7f]/;

function tokenMatches(token: string, word: string): boolean {
  if (token === word) return true;
  // Token carries an extra suffix: "பில்லு" → "பில்", "items" → "item".
  if (word.length >= 3 && token.length >= word.length && token.startsWith(word)) return true;
  // Token is a slightly clipped form of the word: "தேடுங" → "தேடுங்க". Tamil
  // only — the recogniser drops those trailing letters constantly, while in
  // English it would make "back" match "backup" and break both commands.
  if (
    NON_ASCII.test(word) &&
    word.length >= 5 &&
    token.length >= 4 &&
    word.startsWith(token) &&
    token.length >= word.length - 2
  ) {
    return true;
  }
  return false;
}

/** Index of the first token matching any word in `words`, else -1. */
export function findKw(tokens: string[], words: readonly string[]): number {
  for (let i = 0; i < tokens.length; i++) {
    for (const w of words) if (tokenMatches(tokens[i], w)) return i;
  }
  return -1;
}

const hasKw = (tokens: string[], words: readonly string[]) => findKw(tokens, words) >= 0;

/** True when every token is either a keyword from `words` or a filler word. */
function isPureCommand(tokens: string[], words: readonly string[]): boolean {
  if (tokens.length === 0) return false;
  let hit = false;
  for (const t of tokens) {
    if (words.some((w) => tokenMatches(t, w))) {
      hit = true;
      continue;
    }
    if (FILLER.some((f) => tokenMatches(t, f))) continue;
    return false;
  }
  return hit;
}

function isNumberToken(t: string): boolean {
  return (
    /^\d+(\.\d+)?$/.test(t) ||
    NUM_WORDS[t] != null ||
    NUM_SCALES[t] != null ||
    NUM_FRACTIONS[t] != null ||
    NUM_COMPOUND[t] != null
  );
}

export interface NumberSpan {
  value: number;
  start: number;
  end: number; // exclusive
}

/**
 * Read a number phrase starting at `i`, additive with multiplying scales:
 *   "இருபத்தி ஐந்து" → 25, "ரெண்டு நூறு" → 200, "two thousand five hundred" → 2500,
 *   "ஒன்றரை" → 1.5, "அரை" → 0.5.
 */
export function readNumberAt(tokens: string[], i: number): NumberSpan | null {
  let total = 0;
  let current = 0;
  let n = 0;
  let matched = false;

  while (i + n < tokens.length) {
    const t = tokens[i + n];
    if (/^\d+(\.\d+)?$/.test(t)) {
      current += parseFloat(t);
    } else if (NUM_COMPOUND[t] != null) {
      current += NUM_COMPOUND[t];
    } else if (NUM_WORDS[t] != null) {
      current += NUM_WORDS[t];
    } else if (NUM_FRACTIONS[t] != null) {
      current += NUM_FRACTIONS[t];
    } else if (NUM_SCALES[t] != null) {
      current = (current === 0 ? 1 : current) * NUM_SCALES[t];
      total += current;
      current = 0;
    } else {
      break;
    }
    matched = true;
    n++;
  }
  if (!matched) return null;
  return { value: total + current, start: i, end: i + n };
}

/** Every number phrase in the clause, left to right. */
export function findNumbers(tokens: string[]): NumberSpan[] {
  const out: NumberSpan[] = [];
  let i = 0;
  while (i < tokens.length) {
    const span = readNumberAt(tokens, i);
    if (span) {
      out.push(span);
      i = span.end;
    } else i++;
  }
  return out;
}

/** Drop filler/keyword noise and join what's left — the spoken item/person name. */
function nameFrom(tokens: string[], skip: Set<number> = new Set()): string {
  const words: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (skip.has(i)) continue;
    const t = tokens[i];
    if (isNumberToken(t)) continue;
    if (FILLER.some((f) => tokenMatches(t, f))) continue;
    words.push(t);
  }
  return words.join(' ').trim();
}

/**
 * The person's name inside a party clause: everything that is not the party
 * word itself, a "name/select/new" word or filler. Empty when the user only
 * said "customer" — that is a request for the Parties tab, not a selection.
 */
const PARTY_NOISE = [...PARTY_WORDS, ...PICK_WORDS, ...KW.add, ...KW.set, ...KW.open, ...KW.newWord];

/** Every field keyword, for telling "another field word" from "an item name". */
const ALL_FIELD_WORDS = FIELD_WORDS.flatMap((f) => f.words);

function partyNameFrom(tokens: string[]): string {
  const nameWords = FIELD_WORDS.find((f) => f.field === 'name')!.words;
  const noise = [...PARTY_NOISE, ...nameWords];
  const kept = tokens.filter((t) => !noise.some((w) => tokenMatches(t, w)));
  return nameFrom(kept);
}

function skipSet(spans: NumberSpan[]): Set<number> {
  const s = new Set<number>();
  for (const sp of spans) for (let i = sp.start; i < sp.end; i++) s.add(i);
  return s;
}

/** Remove the tokens belonging to a matched keyword so they don't leak into names. */
function without(tokens: string[], idx: number): string[] {
  if (idx < 0) return tokens;
  return tokens.filter((_, i) => i !== idx);
}

// ── Clause → intents ─────────────────────────────────────────────────────────

function parseClause(clause: string): VoiceIntent[] {
  const tokens = tokenize(clause);
  if (tokens.length === 0) return [];

  // 1. Bare commands: the whole clause is one verb (+ filler).
  if (isPureCommand(tokens, KW.help)) return [{ kind: 'help' }];
  // "பேக்அப்" must not be heard as "பேக்" (go back) — it is a Settings button.
  if (isPureCommand(tokens, KW.back) && !hasKw(tokens, BACKUP_WORDS)) return [{ kind: 'back' }];
  if (isPureCommand(tokens, KW.clear)) return [{ kind: 'clear' }];
  if (isPureCommand(tokens, KW.print)) return [{ kind: 'print' }];
  if (isPureCommand(tokens, KW.share)) return [{ kind: 'share' }];
  if (isPureCommand(tokens, KW.excel)) return [{ kind: 'exportExcel' }];
  if (isPureCommand(tokens, KW.total)) return [{ kind: 'total' }];

  // 2. Tax mode: needs a tax word plus an inclusive/exclusive word.
  if (hasKw(tokens, KW.tax) || hasKw(tokens, KW.taxIn) || hasKw(tokens, KW.taxOut)) {
    if (hasKw(tokens, KW.taxIn)) return [{ kind: 'setTaxMode', mode: 'inclusive' }];
    if (hasKw(tokens, KW.taxOut)) return [{ kind: 'setTaxMode', mode: 'exclusive' }];
  }

  const numbers = findNumbers(tokens);
  const joined = tokens.join('');

  // 3. Screen buttons — "எடிட்", "டெலிட்", "லாக் ஆன்", "பேக்அப்". Never when the
  //    clause carries a number: that is always data ("ஸ்டாக் இருபது"), not a tap.
  if (numbers.length === 0) {
    for (const entry of ACTION_WORDS) {
      const hit =
        hasKw(tokens, entry.words) || entry.words.some((w) => w.length >= 6 && joined.includes(w));
      if (!hit) continue;
      if (entry.with && !hasKw(tokens, entry.with)) continue;
      if (entry.pure && !isPureCommand(tokens, entry.words)) continue;
      return [{ kind: 'action', action: entry.action }];
    }
  }

  // 4. Payment mode ("ஜிபே", "cash mode").
  for (const { mode, words } of PAYMENT_MODE_WORDS) {
    if (hasKw(tokens, words) && numbers.length === 0) return [{ kind: 'setPaymentMode', mode }];
  }

  const wantsPage = hasKw(tokens, PAGE_WORDS) || hasKw(tokens, GO_WORDS);

  // 5. Who the bill is for — "பார்ட்டி ராஜேஷ்", "customer name rajesh". Checked
  //    before navigation so a party word followed by a person's name picks that
  //    person instead of opening the Parties tab (a bare "customer" still does).
  if (!wantsPage && hasKw(tokens, PARTY_WORDS)) {
    const query = partyNameFrom(tokens);
    if (query) return [{ kind: 'selectParty', query }];
  }

  // 6. Navigation. A page noun counts as navigation when it stands alone, or is
  //    paired with a go/new verb or an explicit "page/screen" word. The LONGEST
  //    matched word wins, so "sales report" beats the plain "sale" of newSale.
  let nav: { target: NavTarget; len: number } | null = null;
  for (const { target, words } of NAV_WORDS) {
    for (const w of words) {
      const hit = tokens.some((t) => tokenMatches(t, w)) || (w.length >= 6 && joined.includes(w));
      if (hit && (!nav || w.length > nav.len)) nav = { target, len: w.length };
    }
  }
  if (nav) {
    const bare = tokens.length <= 3 && numbers.length === 0;
    const isNewTarget = nav.target.startsWith('new') || nav.target.startsWith('report');
    if (wantsPage || bare || (isNewTarget && hasKw(tokens, KW.newWord))) {
      return [{ kind: 'navigate', target: nav.target }];
    }
  }

  // 7. Bare "bill/save" → submit (checked after nav so "பில் பக்கம்" still routes).
  if (isPureCommand(tokens, KW.submit)) return [{ kind: 'submit' }];

  // 8. Search — "ராஜேஷ் தேடு" / "search rajesh".
  const searchIdx = findKw(tokens, KW.search);
  if (searchIdx >= 0) {
    const query = nameFrom(without(tokens, searchIdx));
    return query ? [{ kind: 'search', query }] : [{ kind: 'help' }];
  }

  // 9. Named field assignment — "ரேட் நூறு", "phone 98765...", "ஊர் மதுரை".
  for (const { field, words } of FIELD_WORDS) {
    const idx = findKw(tokens, words);
    if (idx < 0) continue;
    const rest = without(tokens, idx);
    const nums = findNumbers(rest);
    // Text fields keep the spoken words, code fields keep the characters, and
    // everything else takes the number that was said.
    if (TEXT_FIELDS.includes(field)) {
      // Units and categories ARE the words filler normally drops ("unit kg",
      // "வகை பாட்டில்"), so fall back to the raw words when nothing survives.
      const value = nameFrom(rest) || rest.join(' ').trim();
      if (value) return [{ kind: 'setField', field, value }];
      continue;
    }
    if (CODE_FIELDS.includes(field)) {
      const value = rest.join('').replace(/[^a-z0-9]/gi, '').toUpperCase();
      if (value) return [{ kind: 'setField', field, value }];
      continue;
    }
    if (field === 'email') {
      const value = rest.join('').replace(/\s+/g, '').toLowerCase();
      if (value) return [{ kind: 'setField', field, value }];
      continue;
    }
    if (field === 'phone') {
      const digits = rest.join('').replace(/\D/g, '');
      if (digits.length >= 6) return [{ kind: 'setField', field, value: digits }];
      continue;
    }
    if (nums.length) {
      // "rate 20 tea" is really an add-with-rate; leave it to rule 11. Other
      // field words are not leftovers though — "purchase rate 40" names one
      // field twice, it does not name an item called "rate".
      const skip = skipSet(nums);
      rest.forEach((tk, i) => {
        if (ALL_FIELD_WORDS.some((w) => tokenMatches(tk, w))) skip.add(i);
      });
      const leftover = nameFrom(rest, skip);
      if (!leftover) return [{ kind: 'setField', field, value: String(nums[0].value) }];
    }
  }

  // 10. Remove / set-quantity on an existing line.
  const removeIdx = findKw(tokens, KW.remove);
  if (removeIdx >= 0) {
    const rest = without(tokens, removeIdx);
    const nums = findNumbers(rest);
    const itemQuery = nameFrom(rest, skipSet(nums));
    if (itemQuery) {
      return [{ kind: 'removeLine', itemQuery, qty: nums.length ? nums[0].value : undefined }];
    }
    return [{ kind: 'clear' }];
  }

  const setIdx = findKw(tokens, KW.set);
  if (setIdx >= 0) {
    const rest = without(tokens, setIdx);
    const nums = findNumbers(rest);
    const itemQuery = nameFrom(rest, skipSet(nums));
    if (itemQuery && nums.length) {
      return [{ kind: 'setQty', itemQuery, qty: nums[0].value }];
    }
  }

  // 11. Add lines — the default reading of "<number> <item>" speech.
  return parseAddLines(tokens);
}

/**
 * "ரெண்டு டீ மூணு காபி" → two addLine intents; "டீ ரெண்டு" → one; a bare
 * "டீ" → one of qty 1. An explicit rate ("டீ ரெண்டு ரேட் இருபது") is attached
 * to the line rather than becoming a separate field edit.
 */
function parseAddLines(tokensIn: string[]): VoiceIntent[] {
  let tokens = tokensIn;
  const addIdx = findKw(tokens, KW.add);
  if (addIdx >= 0) tokens = without(tokens, addIdx);

  // Pull out an explicit rate first so it isn't mistaken for a quantity.
  let rate: number | undefined;
  const rateWords = FIELD_WORDS.find((f) => f.field === 'rate')!.words;
  const rateIdx = findKw(tokens, rateWords);
  if (rateIdx >= 0) {
    const after = readNumberAt(tokens, rateIdx + 1);
    if (after) {
      rate = after.value;
      tokens = tokens.filter((_, i) => i !== rateIdx && (i < after.start || i >= after.end));
    } else {
      tokens = without(tokens, rateIdx);
    }
  }

  const nums = findNumbers(tokens);
  const name = nameFrom(tokens, skipSet(nums));
  if (!name && nums.length === 0) return [{ kind: 'unknown', transcript: tokensIn.join(' ') }];

  // No number at all → a single unit of whatever was named.
  if (nums.length === 0) return [{ kind: 'addLine', itemQuery: name, qty: 1, rate }];

  // One number → it's the quantity for the whole clause. A number with NOTHING
  // else ("ஐநூறு") is a bare amount — the reading that's useful on the payment
  // and discount screens; screens that can't use it just decline.
  if (nums.length === 1) {
    if (!name) return [{ kind: 'setField', field: 'amount', value: String(nums[0].value) }];
    return [{ kind: 'addLine', itemQuery: name, qty: nums[0].value, rate }];
  }

  // Several numbers → treat each as "<qty> <item words up to the next qty>".
  const intents: VoiceIntent[] = [];
  const leading = nameFrom(tokens.slice(0, nums[0].start));
  for (let k = 0; k < nums.length; k++) {
    const from = nums[k].end;
    const to = k + 1 < nums.length ? nums[k + 1].start : tokens.length;
    const itemQuery = nameFrom(tokens.slice(from, to)) || (k === 0 ? leading : '');
    if (itemQuery) intents.push({ kind: 'addLine', itemQuery, qty: nums[k].value, rate });
  }
  if (intents.length === 0) return [{ kind: 'unknown', transcript: tokensIn.join(' ') }];
  return intents;
}

/** Public entry point: one recognised utterance → the commands it contains. */
export function parseTranscript(transcript: string): VoiceIntent[] {
  const clauses = splitClauses(transcript);
  const intents = clauses.flatMap(parseClause);
  if (intents.length === 0) return [{ kind: 'unknown', transcript }];
  return intents;
}
