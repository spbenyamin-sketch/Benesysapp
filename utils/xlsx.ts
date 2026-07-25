// Minimal .xlsx (SpreadsheetML) writer — no dependencies.
//
// Why hand-rolled instead of SheetJS: this app is offline-first and bundled by
// Metro, and the npm `xlsx` build reaches for Node's `fs`/`stream`, which forces
// resolver shims into the bundle. An .xlsx is just a ZIP of a few XML parts, and
// we only ever WRITE one simple sheet, so the whole thing fits in one file with
// zero install cost and zero polyfills.
//
// The ZIP entries are STORED (uncompressed). Excel, LibreOffice, Google Sheets
// and WPS all accept that; it keeps us from having to implement DEFLATE.

export type CellValue = string | number | null | undefined;

export interface SheetColumn {
  header: string;
  /** Column width in characters (Excel units). */
  width?: number;
  /** Render as money with 2 decimals + thousands separator. */
  money?: boolean;
}

export interface SheetSpec {
  /** Sheet tab name (Excel forbids : \ / ? * [ ] and >31 chars). */
  name: string;
  /** Free-text lines above the table — title, date range, filters. */
  preamble?: string[];
  columns: SheetColumn[];
  rows: CellValue[][];
  /** Bold summary row appended after a blank line. */
  totals?: CellValue[];
}

// ── XML helpers ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 0 → A, 25 → Z, 26 → AA. */
export function colName(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim() || 'Report';
  return cleaned.slice(0, 31);
}

// Style indices baked into styles.xml below.
const S_NORMAL = 0;
const S_BOLD = 1;
const S_MONEY = 2;
const S_TITLE = 3;

function cell(ref: string, value: CellValue, style: number): string {
  const s = style ? ` s="${style}"` : '';
  if (value === null || value === undefined || value === '') return `<c r="${ref}"${s}/>`;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
}

function sheetXml(spec: SheetSpec): string {
  const rows: string[] = [];
  let r = 0;

  for (const line of spec.preamble ?? []) {
    r++;
    rows.push(`<row r="${r}">${cell(`A${r}`, line, S_TITLE)}</row>`);
  }
  if (spec.preamble?.length) {
    r++; // blank spacer row
  }

  r++;
  rows.push(
    `<row r="${r}">${spec.columns
      .map((c, i) => cell(`${colName(i)}${r}`, c.header, S_BOLD))
      .join('')}</row>`,
  );

  for (const row of spec.rows) {
    r++;
    const cells = spec.columns.map((c, i) => {
      const v = row[i];
      const style = c.money && typeof v === 'number' ? S_MONEY : S_NORMAL;
      return cell(`${colName(i)}${r}`, v, style);
    });
    rows.push(`<row r="${r}">${cells.join('')}</row>`);
  }

  if (spec.totals) {
    r += 2;
    const cells = spec.columns.map((c, i) => {
      const v = spec.totals![i];
      const style = c.money && typeof v === 'number' ? S_MONEY : S_BOLD;
      return cell(`${colName(i)}${r}`, v, style);
    });
    rows.push(`<row r="${r}">${cells.join('')}</row>`);
  }

  const cols = spec.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows.join(
    '',
  )}</sheetData></worksheet>`;
}

function contentTypesXml(sheetCount: number): string {
  const overrides = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

// Sheets take rId1..rIdN, so styles is relegated to the id after the last sheet.
function workbookRelsXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

// numFmtId 4 is the built-in "#,##0.00"; xf index order defines S_* above.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function workbookXml(sheetNames: string[]): string {
  const sheets = sheetNames
    .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

// ── ZIP (stored entries) ─────────────────────────────────────────────────────

function utf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      // surrogate pair → single code point
      const next = str.charCodeAt(i + 1);
      c = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
      i++;
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: number[]): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

interface ZipEntry {
  path: string;
  data: number[];
}

/** Build a ZIP archive with all entries stored (compression method 0). */
function zip(entries: ZipEntry[]): Uint8Array {
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = utf8Bytes(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const header = [
      ...u32(0x04034b50), // local file header
      ...u16(20), // version needed
      ...u16(0x0800), // flags: UTF-8 names
      ...u16(0), // method: stored
      ...u16(0), // mod time
      ...u16(0x21), // mod date (1980-01-01)
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(name.length),
      ...u16(0),
      ...name,
    ];
    local.push(...header, ...entry.data);

    central.push(
      ...u32(0x02014b50), // central directory header
      ...u16(20),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0x21),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...name,
    );
    offset += header.length + size;
  }

  const end = [
    ...u32(0x06054b50), // end of central directory
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(offset),
    ...u16(0),
  ];

  return Uint8Array.from([...local, ...central, ...end]);
}

/** Build an .xlsx workbook (one or more sheets) as raw bytes. */
export function buildXlsx(input: SheetSpec | SheetSpec[]): Uint8Array {
  const specs = (Array.isArray(input) ? input : [input]).filter(Boolean);
  if (specs.length === 0) throw new Error('A workbook needs at least one sheet.');

  // Excel rejects duplicate tab names, so de-duplicate after truncating to 31.
  const used = new Set<string>();
  const named = specs.map((spec) => {
    let name = sanitizeSheetName(spec.name);
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${sanitizeSheetName(spec.name).slice(0, 28)} ${n++}`;
    used.add(name.toLowerCase());
    return { ...spec, name };
  });

  return zip([
    { path: '[Content_Types].xml', data: utf8Bytes(contentTypesXml(named.length)) },
    { path: '_rels/.rels', data: utf8Bytes(ROOT_RELS) },
    { path: 'xl/workbook.xml', data: utf8Bytes(workbookXml(named.map((s) => s.name))) },
    { path: 'xl/_rels/workbook.xml.rels', data: utf8Bytes(workbookRelsXml(named.length)) },
    { path: 'xl/styles.xml', data: utf8Bytes(STYLES) },
    ...named.map((spec, i) => ({
      path: `xl/worksheets/sheet${i + 1}.xml`,
      data: utf8Bytes(sheetXml(spec)),
    })),
  ]);
}
