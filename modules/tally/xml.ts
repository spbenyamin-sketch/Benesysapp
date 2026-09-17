// The little bit of XML this export needs, written by hand.
//
// No library, for the reason utils/xlsx.ts gives about SheetJS: a Metro bundle
// has no business pulling a Node parser in to write a few hundred well-known
// elements.
//
// Everything outside plain ASCII is written as a numeric character reference, so
// the file is ASCII bytes whatever it says. A shop in Tamil Nadu has parties
// named in Tamil, and Tally's importer has a long history of guessing encodings;
// "&#2949;" cannot be guessed wrong.

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function esc(value: string): string {
  let out = '';
  for (const ch of value) {
    const named = ESCAPES[ch];
    if (named) {
      out += named;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    out += code < 32 || code > 126 ? `&#${code};` : ch;
  }
  return out;
}

/** `<NAME>value</NAME>`, or nothing at all when there is nothing to say. */
export function el(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!text.trim()) return '';
  return `<${name}>${esc(text)}</${name}>`;
}

/** An element wrapping others. Attribute values are escaped too. */
export function tag(
  name: string,
  children: string,
  attrs: Record<string, string> = {},
): string {
  const a = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
  return `<${name}${a}>${children}</${name}>`;
}

/** ISO 'YYYY-MM-DD' → Tally's '20260917'. */
export function tallyDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '');
}

/**
 * Paise → the rupee string Tally reads. The one place in this module where
 * money stops being an integer, exactly as gstr.ts keeps its `rupees()` at the
 * edge: everything above this line adds up in paise and cannot drift.
 */
export function rupees(paise: number): string {
  return (Math.round(paise) / 100).toFixed(2);
}
