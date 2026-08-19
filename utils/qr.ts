// A QR encoder, written out rather than pulled in — the same reason utils/xlsx
// writes its own workbook. The app is offline and installs as one APK; a QR on
// the bill must not depend on a network round-trip or a native module.
//
// Scope is deliberately the smallest that does the job: BYTE mode at error
// correction level M, versions 1–10 (up to 213 bytes). A UPI payment string is
// around a hundred characters, so that is room to spare, and the tables stay
// short enough to read.
//
// References in the comments are to the shapes ISO/IEC 18004 defines; the maths
// below is self-checking (see the tests: a correct codeword divided by its
// generator polynomial leaves no remainder).

// ── GF(256) — the field Reed–Solomon works in ────────────────────────────────
// x^8 + x^4 + x^3 + x^2 + 1 (0x11D) is the QR standard's primitive polynomial.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}

/** Multiply in GF(256). Zero times anything is zero — logs have no answer for it. */
export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** The generator polynomial for `degree` error-correction codewords. */
function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let d = 0; d < degree; d += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i += 1) {
      next[i] ^= poly[i];
      next[i + 1] ^= gfMul(poly[i], EXP[d]);
    }
    poly = next;
  }
  return poly;
}

/**
 * The error-correction codewords for one block: the remainder of the data
 * polynomial shifted up by `degree` and divided by the generator.
 */
export function reedSolomon(data: number[], degree: number): number[] {
  const gen = generatorPoly(degree);
  const rem = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    if (factor !== 0) {
      for (let i = 0; i < degree; i += 1) rem[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return rem;
}

// ── Version tables, error correction level M only ────────────────────────────
// [total data codewords, EC codewords per block, group-1 blocks, group-1 data,
//  group-2 blocks, group-2 data]
interface VersionSpec {
  version: number;
  ecPerBlock: number;
  blocks: { count: number; data: number }[];
  dataCodewords: number;
}

const VERSIONS: VersionSpec[] = [
  { version: 1, ecPerBlock: 10, blocks: [{ count: 1, data: 16 }], dataCodewords: 16 },
  { version: 2, ecPerBlock: 16, blocks: [{ count: 1, data: 28 }], dataCodewords: 28 },
  { version: 3, ecPerBlock: 26, blocks: [{ count: 1, data: 44 }], dataCodewords: 44 },
  { version: 4, ecPerBlock: 18, blocks: [{ count: 2, data: 32 }], dataCodewords: 64 },
  { version: 5, ecPerBlock: 24, blocks: [{ count: 2, data: 43 }], dataCodewords: 86 },
  { version: 6, ecPerBlock: 16, blocks: [{ count: 4, data: 27 }], dataCodewords: 108 },
  { version: 7, ecPerBlock: 18, blocks: [{ count: 4, data: 31 }], dataCodewords: 124 },
  {
    version: 8,
    ecPerBlock: 22,
    blocks: [
      { count: 2, data: 38 },
      { count: 2, data: 39 },
    ],
    dataCodewords: 154,
  },
  {
    version: 9,
    ecPerBlock: 22,
    blocks: [
      { count: 3, data: 36 },
      { count: 2, data: 37 },
    ],
    dataCodewords: 182,
  },
  {
    version: 10,
    ecPerBlock: 26,
    blocks: [
      { count: 4, data: 43 },
      { count: 1, data: 44 },
    ],
    dataCodewords: 216,
  },
];

/** Alignment-pattern centre coordinates per version (none on version 1). */
const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

/** The character-count field is 8 bits in byte mode until version 10. */
const countBits = (version: number) => (version < 10 ? 8 : 16);

/** Bytes that fit at this version, after the mode and length header. */
function capacityOf(spec: VersionSpec): number {
  return Math.floor((spec.dataCodewords * 8 - 4 - countBits(spec.version)) / 8);
}

/** The smallest version the payload fits in. */
function pickVersion(byteLength: number): VersionSpec {
  const found = VERSIONS.find((v) => byteLength <= capacityOf(v));
  if (!found) {
    throw new Error(
      `That is too long for a QR code here (${byteLength} bytes; the limit is ${capacityOf(
        VERSIONS[VERSIONS.length - 1],
      )}).`,
    );
  }
  return found;
}

// ── Bit stream ───────────────────────────────────────────────────────────────
class Bits {
  private bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
  }

  get length(): number {
    return this.bits.length;
  }

  /** Pad to a whole number of bytes and hand back the codewords. */
  toCodewords(total: number): number[] {
    const bits = [...this.bits];
    // Terminator, then to a byte boundary.
    const terminator = Math.min(4, total * 8 - bits.length);
    for (let i = 0; i < terminator; i += 1) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const words: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
      words.push(byte);
    }
    // The standard's alternating pad bytes fill whatever is left.
    const PAD = [0xec, 0x11];
    let p = 0;
    while (words.length < total) {
      words.push(PAD[p % 2]);
      p += 1;
    }
    return words;
  }
}

/** UTF-8 bytes of a string — byte mode is what a scanner reads as text. */
export function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return out;
}

/** Data codewords and EC codewords, interleaved the way the symbol expects. */
function buildCodewords(text: string, spec: VersionSpec): number[] {
  const bytes = utf8Bytes(text);
  const bits = new Bits();
  bits.push(0b0100, 4); // byte mode
  bits.push(bytes.length, countBits(spec.version));
  for (const b of bytes) bits.push(b, 8);
  const data = bits.toCodewords(spec.dataCodewords);

  // Split into blocks, error-correct each, then interleave.
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let at = 0;
  for (const group of spec.blocks) {
    for (let b = 0; b < group.count; b += 1) {
      const block = data.slice(at, at + group.data);
      at += group.data;
      dataBlocks.push(block);
      ecBlocks.push(reedSolomon(block, spec.ecPerBlock));
    }
  }

  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i += 1) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return out;
}

// ── Matrix ───────────────────────────────────────────────────────────────────
type Grid = { modules: Int8Array; reserved: Uint8Array; size: number };

const at = (g: Grid, r: number, c: number) => g.modules[r * g.size + c];
const set = (g: Grid, r: number, c: number, dark: 0 | 1, reserve = true) => {
  g.modules[r * g.size + c] = dark;
  if (reserve) g.reserved[r * g.size + c] = 1;
};
const isReserved = (g: Grid, r: number, c: number) => g.reserved[r * g.size + c] === 1;

function placeFinder(g: Grid, row: number, col: number): void {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= g.size || cc >= g.size) continue;
      const onRing = r === 0 || r === 6 || c === 0 || c === 6;
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      set(g, rr, cc, inside && (onRing || inCore) ? 1 : 0);
    }
  }
}

function placeAlignment(g: Grid, version: number): void {
  const centres = ALIGNMENT[version] ?? [];
  for (const r of centres) {
    for (const c of centres) {
      // The three finder corners have no alignment pattern.
      const nearFinder =
        (r === 6 && c === 6) ||
        (r === 6 && c === g.size - 7) ||
        (r === g.size - 7 && c === 6);
      if (nearFinder) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          set(g, r + dr, c + dc, ring === 1 ? 0 : 1);
        }
      }
    }
  }
}

/** BCH(15,5) format information, masked as the standard requires. */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // 00 = error correction level M
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >>> i) & 1) rem ^= 0b10100110111 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

/** BCH(18,6) version information, for versions 7 and up. */
export function versionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i -= 1) {
    if ((rem >>> i) & 1) rem ^= 0b1111100100101 << (i - 12);
  }
  return (version << 12) | rem;
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** The standard's four penalty rules — lower is easier for a scanner to read. */
function penalty(g: Grid): number {
  const n = g.size;
  let score = 0;

  // Rule 1: runs of five or more of one colour.
  const runScore = (get: (i: number, j: number) => number) => {
    let total = 0;
    for (let i = 0; i < n; i += 1) {
      let run = 1;
      for (let j = 1; j < n; j += 1) {
        if (get(i, j) === get(i, j - 1)) {
          run += 1;
        } else {
          if (run >= 5) total += run - 2;
          run = 1;
        }
      }
      if (run >= 5) total += run - 2;
    }
    return total;
  };
  score += runScore((i, j) => at(g, i, j));
  score += runScore((i, j) => at(g, j, i));

  // Rule 2: 2×2 blocks of one colour.
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const v = at(g, r, c);
      if (v === at(g, r, c + 1) && v === at(g, r + 1, c) && v === at(g, r + 1, c + 1)) score += 3;
    }
  }

  // Rule 3: the finder-like 1:1:3:1:1 pattern with four light modules beside it.
  const PATTERN = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const REVERSE = [...PATTERN].reverse();
  const matches = (get: (k: number) => number, start: number, pat: number[]) =>
    pat.every((v, k) => get(start + k) === v);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j + 11 <= n; j += 1) {
      if (matches((k) => at(g, i, k), j, PATTERN)) score += 40;
      if (matches((k) => at(g, i, k), j, REVERSE)) score += 40;
      if (matches((k) => at(g, k, i), j, PATTERN)) score += 40;
      if (matches((k) => at(g, k, i), j, REVERSE)) score += 40;
    }
  }

  // Rule 4: how far the dark/light balance strays from half.
  let dark = 0;
  for (let i = 0; i < n * n; i += 1) dark += g.modules[i];
  const percent = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

function writeFormat(g: Grid, mask: number): void {
  const bits = formatBits(mask);
  const bit = (i: number) => ((bits >>> i) & 1) as 0 | 1;
  for (let i = 0; i <= 5; i += 1) set(g, 8, i, bit(i));
  set(g, 8, 7, bit(6));
  set(g, 8, 8, bit(7));
  set(g, 7, 8, bit(8));
  for (let i = 9; i <= 14; i += 1) set(g, 14 - i, 8, bit(i));

  for (let i = 0; i <= 7; i += 1) set(g, g.size - 1 - i, 8, bit(i));
  for (let i = 8; i <= 14; i += 1) set(g, 8, g.size - 15 + i, bit(i));
  set(g, g.size - 8, 8, 1); // the dark module, always
}

/**
 * Encode text as a QR matrix of true/false modules. Throws only when the text
 * is longer than a version-10 symbol can hold.
 */
export function qrMatrix(text: string): boolean[][] {
  const spec = pickVersion(utf8Bytes(text).length);
  const size = spec.version * 4 + 17;
  const g: Grid = {
    modules: new Int8Array(size * size),
    reserved: new Uint8Array(size * size),
    size,
  };

  placeFinder(g, 0, 0);
  placeFinder(g, 0, size - 7);
  placeFinder(g, size - 7, 0);
  placeAlignment(g, spec.version);

  // Timing patterns.
  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0 ? 1 : 0;
    set(g, 6, i, dark);
    set(g, i, 6, dark);
  }

  // Reserve the format areas before any data goes down.
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      set(g, 8, i, 0);
      set(g, i, 8, 0);
    }
  }
  for (let i = 0; i < 8; i += 1) {
    set(g, size - 1 - i, 8, 0);
    set(g, 8, size - 1 - i, 0);
  }

  // Version information, versions 7 and up.
  if (spec.version >= 7) {
    const bits = versionBits(spec.version);
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) as 0 | 1;
      const r = Math.floor(i / 3);
      const c = (i % 3) + size - 11;
      set(g, r, c, dark);
      set(g, c, r, dark);
    }
  }

  // Data, in the zigzag the standard walks: upward and downward pairs of
  // columns from the bottom-right, skipping the vertical timing column.
  const codewords = buildCodewords(text, spec);
  let bitIndex = 0;
  const nextBit = (): 0 | 1 => {
    const byte = codewords[bitIndex >> 3] ?? 0;
    const bit = ((byte >>> (7 - (bitIndex & 7))) & 1) as 0 | 1;
    bitIndex += 1;
    return bit;
  };
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    const col = right === 6 ? right - 1 : right; // column 6 is the timing line
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (isReserved(g, row, c)) continue;
        set(g, row, c, nextBit(), false);
      }
    }
    upward = !upward;
  }

  // Try every mask, keep the easiest one to scan.
  let best: { modules: Int8Array; score: number; mask: number } | null = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const trial: Grid = { modules: Int8Array.from(g.modules), reserved: g.reserved, size };
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (isReserved(trial, r, c)) continue;
        if (MASKS[mask](r, c)) trial.modules[r * size + c] ^= 1;
      }
    }
    writeFormat(trial, mask);
    const score = penalty(trial);
    if (!best || score < best.score) best = { modules: trial.modules, score, mask };
  }

  const chosen = best as { modules: Int8Array; score: number; mask: number };
  const out: boolean[][] = [];
  for (let r = 0; r < size; r += 1) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c += 1) row.push(chosen.modules[r * size + c] === 1);
    out.push(row);
  }
  return out;
}

/**
 * The matrix as an inline SVG, sized in points for the printed page. The quiet
 * zone is part of the code, not decoration — a scanner needs it.
 */
export function qrSvg(text: string, sizePx = 120): string {
  const matrix = qrMatrix(text);
  const quiet = 4;
  const modules = matrix.length + quiet * 2;
  let path = '';
  for (let r = 0; r < matrix.length; r += 1) {
    for (let c = 0; c < matrix.length; c += 1) {
      if (matrix[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${modules} ${modules}" shape-rendering="crispEdges"><rect width="${modules}" height="${modules}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

/**
 * The string a UPI app expects behind a "scan to pay" code. Amount and note are
 * optional — a code without them lets the customer type what they are paying,
 * which is what a shop wants on a statement rather than on one bill.
 */
export function upiPayload(args: {
  vpa: string;
  name: string;
  amount?: number; // paise
  note?: string;
}): string {
  const params: string[] = [`pa=${encodeURIComponent(args.vpa.trim())}`];
  if (args.name.trim()) params.push(`pn=${encodeURIComponent(args.name.trim())}`);
  if (args.amount && args.amount > 0) params.push(`am=${(args.amount / 100).toFixed(2)}`);
  params.push('cu=INR');
  if (args.note?.trim()) params.push(`tn=${encodeURIComponent(args.note.trim())}`);
  return `upi://pay?${params.join('&')}`;
}
