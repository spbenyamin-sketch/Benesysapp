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
    for (const name of spokenNames(c)) score = Math.max(score, similarity(q, name));
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
    .map((c) => ({ c, s: Math.max(...spokenNames(c).map((n) => similarity(q, n)), 0) }))
    .filter((r) => r.s > 0.3)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.c);
}
