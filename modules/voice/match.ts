// Fuzzy "what did they just say?" matching of a spoken name against the real
// item/party catalogue. Speech recognition mangles names constantly (and Tamil
// speech against English item names never matches literally), so every item and
// party carries an optional `voiceAlias` — comma-separated spoken names — which
// is matched with equal weight to the real name.

export interface Matchable {
  id: number;
  name: string;
  voiceAlias?: string | null;
}

export interface MatchResult<T> {
  value: T;
  score: number; // 0..1
}

// Plain-ASCII punctuation class (no \p{…} escapes) so Tamil letters pass through
// untouched on every JS engine.
const PUNCT = /[!?"'`():;,.،।/\\|+*=[\]{}<>~^%$#&@_₹–—-]/g;

const clean = (s: string) =>
  (s ?? '')
    .toLowerCase()
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Classic Levenshtein distance, two-row variant. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// ── Tamil ↔ romanised bridging ───────────────────────────────────────────────
// The recogniser returns Tamil script in a Tamil session and Latin letters in an
// English one, while the shop types its aliases in whichever it prefers. So both
// sides are reduced to a rough phonetic key before comparison: "சர்க்கரை" and
// "sakkarai" and "sarkarai" all collapse to the same thing.

const TA_VOWELS: Record<string, string> = {
  'அ': 'a', 'ஆ': 'a', 'இ': 'i', 'ஈ': 'i', 'உ': 'u', 'ஊ': 'u',
  'எ': 'e', 'ஏ': 'e', 'ஐ': 'ai', 'ஒ': 'o', 'ஓ': 'o', 'ஔ': 'au',
};

const TA_SIGNS: Record<string, string> = {
  'ா': 'a', 'ி': 'i', 'ீ': 'i', 'ு': 'u', 'ூ': 'u',
  'ெ': 'e', 'ே': 'e', 'ை': 'ai', 'ொ': 'o', 'ோ': 'o', 'ௌ': 'au',
};

const TA_CONSONANTS: Record<string, string> = {
  'க': 'k', 'ங': 'ng', 'ச': 'ch', 'ஞ': 'nj', 'ட': 't', 'ண': 'n',
  'த': 'th', 'ந': 'n', 'ப': 'p', 'ம': 'm', 'ய': 'y', 'ர': 'r',
  'ல': 'l', 'வ': 'v', 'ழ': 'zh', 'ள': 'l', 'ற': 'r', 'ன': 'n',
  'ஜ': 'j', 'ஷ': 'sh', 'ஸ': 's', 'ஹ': 'h', 'க்ஷ': 'ksh', 'ஶ': 'sh',
};

const PULLI = '்'; // the dot that strips a consonant's inherent vowel

/** Tamil script → rough Latin ("சர்க்கரை" → "sarkkarai"). Other text passes through. */
export function transliterateTamil(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const cons = TA_CONSONANTS[ch];
    if (cons) {
      out += cons;
      const next = text[i + 1];
      if (next === PULLI) i++; // bare consonant
      else if (next && TA_SIGNS[next]) {
        out += TA_SIGNS[next];
        i++;
      } else out += 'a'; // inherent vowel
      continue;
    }
    if (TA_VOWELS[ch]) {
      out += TA_VOWELS[ch];
      continue;
    }
    if (TA_SIGNS[ch] || ch === PULLI) continue; // stray sign
    out += ch;
  }
  return out;
}

/**
 * Squash the spelling differences that never change the word: Tamil makes no
 * voiced/unvoiced distinction (k/g, t/d, p/b, ch/s), long vowels are doubled at
 * random by the recogniser, and "zh"/"l" / "th"/"t" are written both ways.
 */
export function phoneticKey(text: string): string {
  let s = transliterateTamil(text).toLowerCase();
  s = s
    .replace(/zh/g, 'l')
    .replace(/th|dh/g, 't')
    .replace(/ch|sh|j/g, 's')
    .replace(/ng|nj/g, 'n')
    .replace(/[gk]/g, 'k')
    .replace(/[dt]/g, 't')
    .replace(/[bp]/g, 'p')
    .replace(/[cz]/g, 's')
    .replace(/[wv]/g, 'v')
    .replace(/h/g, '')
    .replace(/[aeiou]+/g, (m) => m[0]) // "aa"/"ee" → "a"/"e"
    .replace(/(.)\1+/g, '$1'); // any doubled letter → single
  return s.replace(/\s+/g, ' ').trim();
}

/** 0..1 similarity of two already-cleaned strings. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aTokens = a.split(' ');
  const bTokens = b.split(' ');

  // Whole-string containment: "tea" inside "masala tea" — scaled by how much of
  // the longer string is covered, so "a" doesn't match everything.
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return 0.75 + 0.25 * ratio;
  }

  // Any exact word in common ("chai" in "chai powder").
  const shared = aTokens.filter((t) => t.length >= 2 && bTokens.includes(t));
  if (shared.length) {
    const cover = shared.join('').length / Math.max(a.replace(/ /g, '').length, b.replace(/ /g, '').length);
    return 0.7 + 0.25 * cover;
  }

  // Otherwise fall back to edit distance (catches recogniser typos).
  const dist = levenshtein(a, b);
  return Math.max(0, 1 - dist / Math.max(a.length, b.length));
}

/**
 * Similarity of a spoken query to one candidate name, trying the literal text
 * first and the phonetic key as a fallback. The phonetic route is worth slightly
 * less (0.95×) so an exact literal match always wins, and is skipped for very
 * short keys where the aggressive squashing would match almost anything.
 */
export function pairScore(a: string, b: string): number {
  const direct = similarity(a, b);
  if (direct >= 0.9) return direct;
  const ka = phoneticKey(a);
  const kb = phoneticKey(b);
  if (ka.length < 3 || kb.length < 3) return direct;
  return Math.max(direct, similarity(ka, kb) * 0.95);
}

/** All the names a record answers to: its real name plus its spoken aliases. */
export function spokenNames(m: Matchable): string[] {
  const aliases = (m.voiceAlias ?? '')
    .split(/[,/|]/)
    .map((s) => clean(s))
    .filter(Boolean);
  return [clean(m.name), ...aliases].filter(Boolean);
}

/** Best candidate for a spoken query, or null when nothing is close enough. */
export function bestMatch<T extends Matchable>(
  query: string,
  candidates: T[],
  threshold = 0.55,
): MatchResult<T> | null {
  const q = clean(query);
  if (!q) return null;
  let best: MatchResult<T> | null = null;
  for (const c of candidates) {
    let score = 0;
    for (const name of spokenNames(c)) score = Math.max(score, pairScore(q, name));
    if (!best || score > best.score) best = { value: c, score };
  }
  return best && best.score >= threshold ? best : null;
}

/**
 * Best entry from a plain list of choices ("Tamil Nadu", "kg", "Grocery") — the
 * dropdown fields on the forms, so "தமிழ்நாடு"/"tamilnadu" still lands on the
 * exact option the picker offers.
 */
export function matchOption(query: string, options: string[], threshold = 0.6): string | null {
  const hit = bestMatch(
    query,
    options.map((name, id) => ({ id, name })),
    threshold,
  );
  return hit ? hit.value.name : null;
}

/** Ranked shortlist — used to offer "did you mean…?" when nothing matches well. */
export function rankMatches<T extends Matchable>(query: string, candidates: T[], limit = 5): T[] {
  const q = clean(query);
  if (!q) return [];
  return candidates
    .map((c) => ({ c, s: Math.max(...spokenNames(c).map((n) => pairScore(q, n)), 0) }))
    .filter((r) => r.s > 0.3)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.c);
}
