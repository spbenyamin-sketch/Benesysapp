// GSTR-1 as the government's OFFLINE UTILITY wants it: a JSON file the shop
// hands to its CA (or uploads into the utility itself), which then produces the
// file that is actually filed. Nothing here files anything, talks to any GST
// server, or signs anything — it is a well-shaped statement of the month's
// outward supplies, and it is still the CA who checks it and files it.
//
// Everything in this file is PURE: rows in, object out, no database. That is
// what makes the arithmetic testable in plain Node, and it is the arithmetic —
// not the plumbing — that can put a wrong figure in front of the government.
//
// The one conversion that happens here is paise → rupees, and it happens ONCE,
// at the edge, when the object is built. The books stay integer paise all the
// way in: adding rupee floats slab by slab is how a return ends up a paise short
// of the invoice it came from.

import { lineTax, splitTax, supplyType, type SupplyType } from '@/utils/gst';

// ── What the builder is fed ───────────────────────────────────────────────────
// Deliberately not the drizzle row types: a plain shape means a test can hand in
// four invoices without a database, and the loader in service.ts is free to get
// them there however it likes.

/** One billed line, with the HSN FROZEN ON IT — see below for why that matters. */
export interface GstrLine {
  taxRate: number; // basis points
  amount: number; // paise, pre-tax, already net of the line discount
  qty: number; // thousandths
  /** The HSN as it stood when the bill was made. Reclassifying the item today
   *  must not rewrite a return that was already filed for July. */
  hsnCode: string | null;
  itemName: string;
  unit: string;
}

export interface GstrInvoice {
  id: number;
  type: 'sale' | 'saleReturn' | 'challan';
  invoiceNo: string;
  date: string; // ISO 'YYYY-MM-DD'
  grandTotal: number; // paise
  /** Frozen on the bill. Blank on old rows, where the party's state stands in. */
  placeOfSupply: string | null;
  sourceInvoiceId: number | null;
  /** The bill a credit note reverses, when it named one. */
  sourceInvoiceNo: string | null;
  sourceInvoiceDate: string | null;
  partyName: string;
  partyGstin: string | null;
  partyState: string | null;
  lines: GstrLine[];
}

export interface GstrContext {
  /** The shop's own GSTIN. A return without one is not a return. */
  gstin: string;
  /** The shop's state — one half of the intra/inter decision. */
  state: string;
  /** Filing period, MMYYYY. */
  fp: string;
}

// ── Conversions the JSON needs ────────────────────────────────────────────────

/**
 * paise → rupees as a plain number with at most 2 decimals. Called once per
 * figure, on a total that was accumulated in whole paise, so a slab of 37 lines
 * still adds up to the invoice it came from.
 */
export function rupees(paise: number): number {
  return Math.round(paise) / 100;
}

/** thousandths → a plain unit number (3 dp is all the schema stores). */
export function units(thousandths: number): number {
  return Math.round(thousandths) / 1000;
}

/** basis points → the whole-percent number a return carries (1800 → 18). */
export function ratePercent(basisPoints: number): number {
  return Math.round(basisPoints) / 100;
}

/** 'YYYY-MM' → 'MMYYYY', the filing period every GSTR JSON opens with. */
export function filingPeriod(month: string): string {
  const [y, m] = month.split('-');
  return `${m}${y}`;
}

/** ISO 'YYYY-MM-DD' → 'DD-MM-YYYY'. The utility rejects anything else. */
export function gstDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

/** First and last day of a 'YYYY-MM' month, as ISO days. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

// The place of supply in a return is a two-digit STATE CODE, not the state name
// the app stores against a party (utils/constants INDIAN_STATES). The codes are
// fixed by the government and never change, so they live as a literal table.
const STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'dadra and nagar haveli and daman and diu': '26',
  maharashtra: '27',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh': '37',
  ladakh: '38',
};

/** A state name → its GST code. '' when the name is blank or unrecognised. */
export function stateCode(state?: string | null): string {
  return STATE_CODES[(state ?? '').trim().toLowerCase()] ?? '';
}

// A return counts in UQCs, not in the words a shopkeeper types on the item. Only
// the units the app offers are mapped; anything else goes to OTH, which the
// utility accepts and the CA can correct — better than guessing a code that
// makes the quantity mean something it doesn't.
const UQC_CODES: Record<string, string> = {
  pcs: 'PCS',
  kg: 'KGS',
  g: 'GMS',
  ltr: 'LTR',
  ml: 'MLT',
  mtr: 'MTR',
  cm: 'CMS',
  box: 'BOX',
  dozen: 'DOZ',
  pack: 'PAC',
  bag: 'BAG',
  bottle: 'BTL',
  set: 'SET',
  pair: 'PRS',
  roll: 'ROL',
  'sq ft': 'SQF',
  unit: 'UNT',
};

/** An item's unit → the UQC the return carries. Unknown units read as OTH. */
export function uqc(unit: string): string {
  return UQC_CODES[(unit ?? '').trim().toLowerCase()] ?? 'OTH';
}

// ── The JSON shapes ───────────────────────────────────────────────────────────
// Named as the schema names them (`txval`, `iamt`, `rchrg`) rather than as this
// codebase would name them: these keys are read by the government's utility, and
// a friendlier name here would simply be a rejected file.

/** One rate slab inside a document. `csamt` is cess — always 0; see below. */
export interface Gstr1ItemDet {
  rt: number; // rate as a percentage
  txval: number; // rupees, taxable value
  iamt?: number; // rupees, IGST — inter-state only
  camt?: number; // rupees, CGST — intra-state only
  samt?: number; // rupees, SGST — intra-state only
  csamt: number;
}

export interface Gstr1Item {
  num: number;
  itm_det: Gstr1ItemDet;
}

export interface Gstr1Doc {
  inum: string;
  idt: string; // DD-MM-YYYY
  val: number; // rupees, the invoice value the customer actually paid
  pos: string;
  rchrg: 'N';
  inv_typ: 'R';
  itms: Gstr1Item[];
}

export interface Gstr1B2b {
  ctin: string; // the buyer's GSTIN
  inv: Gstr1Doc[];
}

export interface Gstr1B2cl {
  pos: string;
  inv: Omit<Gstr1Doc, 'pos' | 'rchrg'>[];
}

export interface Gstr1B2cs {
  sply_ty: 'INTER' | 'INTRA';
  pos: string;
  typ: 'OE'; // ordinary counter sale, not through an e-commerce operator
  rt: number;
  txval: number;
  iamt?: number;
  camt?: number;
  samt?: number;
  csamt: number;
}

/**
 * A note against a supply. `ntty` is 'C' for a credit note and 'D' for a debit
 * note — this app only ever produces 'C': a purchase return is a note the
 * SUPPLIER raises, and it belongs in their GSTR-1, not the shop's.
 */
export interface Gstr1Note {
  ntty: 'C' | 'D';
  nt_num: string;
  nt_dt: string; // DD-MM-YYYY
  /** The bill being reversed. Newer schema versions dropped this pair, but the
   *  CA still wants to see which invoice a note belongs to, and the utility
   *  ignores what it does not read. Omitted when the note named no bill. */
  inum?: string;
  idt?: string;
  val: number;
  pos: string;
  rchrg: 'N';
  inv_typ: 'R';
  itms: Gstr1Item[];
}

export interface Gstr1Cdnr {
  ctin: string;
  nt: Gstr1Note[];
}

export interface Gstr1Cdnur extends Omit<Gstr1Note, 'inv_typ'> {
  typ: 'B2CL';
}

export interface Gstr1HsnRow {
  num: number;
  hsn_sc: string;
  desc: string;
  uqc: string;
  qty: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
  rt: number;
}

export interface Gstr1DocRange {
  num: number;
  from: string;
  to: string;
  totnum: number;
  cancel: number;
  net_issue: number;
}

export interface Gstr1 {
  gstin: string;
  fp: string; // MMYYYY
  version: string;
  hash: string;
  b2b?: Gstr1B2b[];
  b2cl?: Gstr1B2cl[];
  b2cs?: Gstr1B2cs[];
  cdnr?: Gstr1Cdnr[];
  cdnur?: Gstr1Cdnur[];
  hsn?: { data: Gstr1HsnRow[] };
  doc_issued?: { doc_det: { doc_num: number; docs: Gstr1DocRange[] }[] };
}

/** The schema version and hash placeholder the offline utility expects verbatim. */
export const GSTR1_VERSION = 'GST3.0.4';
const GSTR1_HASH = 'hash';

/**
 * Above this invoice value an unregistered INTER-state sale stops being a
 * summary line (b2cs) and has to be reported bill by bill (b2cl) — and its
 * credit note with it (cdnur). ₹2,50,000, in paise.
 */
export const B2CL_THRESHOLD = 25_000_000;

// ── Building the slabs ────────────────────────────────────────────────────────

/** Taxable value and tax at one rate, accumulated in paise. */
interface Slab {
  taxRate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

const emptySlab = (taxRate: number): Slab => ({ taxRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 });

/**
 * A document's lines rolled up by GST rate, split across the heads by the supply
 * type frozen on the bill.
 *
 * The tax is re-derived from each line's stored pre-tax amount rather than read
 * off the invoice header, exactly as the rate-wise breakup in service.ts does —
 * the header carries one rolled-up figure and a return needs it per slab. On a
 * tax-inclusive bill that can land a paise away from the header; both places
 * doing it the same way is what keeps the return and the report agreeing.
 */
function slabsOf(lines: GstrLine[], supply: SupplyType, sign = 1): Slab[] {
  const byRate = new Map<number, Slab>();
  for (const line of lines) {
    const slab = byRate.get(line.taxRate) ?? emptySlab(line.taxRate);
    const split = splitTax(sign * lineTax(line.amount, line.taxRate), supply);
    slab.taxable += sign * line.amount;
    slab.cgst += split.cgst;
    slab.sgst += split.sgst;
    slab.igst += split.igst;
    byRate.set(line.taxRate, slab);
  }
  return [...byRate.values()].sort((a, b) => a.taxRate - b.taxRate);
}

/**
 * A slab as the JSON carries it. Cess (`csamt`) is always 0: the app has no cess
 * field, and a shop that sold something cessable would have to be told, not have
 * a number invented for it. The intra/inter heads are mutually exclusive, so
 * only the pair that applies is written — an `iamt: 0` beside a CGST/SGST pair
 * reads to a CA as "no IGST was charged on an inter-state sale".
 */
function itemDet(slab: Slab): Gstr1ItemDet {
  const det: Gstr1ItemDet = { rt: ratePercent(slab.taxRate), txval: rupees(slab.taxable), csamt: 0 };
  if (slab.igst !== 0) det.iamt = rupees(slab.igst);
  else {
    det.camt = rupees(slab.cgst);
    det.samt = rupees(slab.sgst);
  }
  return det;
}

const itemsOf = (slabs: Slab[]): Gstr1Item[] =>
  slabs.map((slab, i) => ({ num: i + 1, itm_det: itemDet(slab) }));

/**
 * Where a document was supplied to, as a state code. The place of supply frozen
 * on the bill wins; a bill made before that column existed falls back to where
 * the party lived, then to the shop's own state — the same "a bill with no
 * address is a local sale" default the printed invoice uses.
 *
 * A credit note carries the place of supply of the bill it reverses, because it
 * is stamped onto the note when the return is made.
 */
function posOf(inv: GstrInvoice, ctx: GstrContext): string {
  return (
    stateCode(inv.placeOfSupply) || stateCode(inv.partyState) || stateCode(ctx.state) || '97'
  );
}

const supplyOf = (inv: GstrInvoice, ctx: GstrContext): SupplyType =>
  supplyType(ctx.state, inv.placeOfSupply || inv.partyState);

/** A GSTIN that is actually filled in — a blank or whitespace one is not one. */
const registered = (gstin?: string | null): string => (gstin ?? '').trim().toUpperCase();

// ── The sections ──────────────────────────────────────────────────────────────

function buildB2b(sales: GstrInvoice[], ctx: GstrContext): Gstr1B2b[] {
  const byCtin = new Map<string, Gstr1Doc[]>();
  for (const inv of sales) {
    const ctin = registered(inv.partyGstin);
    if (!ctin) continue;
    const docs = byCtin.get(ctin) ?? [];
    docs.push({
      inum: inv.invoiceNo,
      idt: gstDate(inv.date),
      // The invoice value, not the sum of the slabs: a bill-level discount and
      // the round-off live on the header and belong to no one rate. They will
      // therefore not reconcile against `txval` on a discounted bill — which is
      // the truth about the bill, and the CA should see it rather than have the
      // discount silently smeared across the slabs.
      val: rupees(inv.grandTotal),
      pos: posOf(inv, ctx),
      rchrg: 'N', // this shop never sells under reverse charge
      inv_typ: 'R',
      itms: itemsOf(slabsOf(inv.lines, supplyOf(inv, ctx))),
    });
    byCtin.set(ctin, docs);
  }
  return [...byCtin.entries()].map(([ctin, inv]) => ({ ctin, inv }));
}

function buildB2cl(sales: GstrInvoice[], ctx: GstrContext): Gstr1B2cl[] {
  const byPos = new Map<string, Gstr1B2cl['inv']>();
  for (const inv of sales) {
    if (registered(inv.partyGstin)) continue;
    const supply = supplyOf(inv, ctx);
    if (supply !== 'inter' || inv.grandTotal <= B2CL_THRESHOLD) continue;
    const pos = posOf(inv, ctx);
    const docs = byPos.get(pos) ?? [];
    docs.push({
      inum: inv.invoiceNo,
      idt: gstDate(inv.date),
      val: rupees(inv.grandTotal),
      inv_typ: 'R',
      itms: itemsOf(slabsOf(inv.lines, supply)),
    });
    byPos.set(pos, docs);
  }
  return [...byPos.entries()].map(([pos, inv]) => ({ pos, inv }));
}

/**
 * The counter trade: every unregistered sale that is not a b2cl one, summarised
 * by rate + place of supply + supply type.
 *
 * Credit notes to unregistered customers net off HERE rather than appearing as
 * documents — the standard only asks for an unregistered note separately when
 * the sale itself was reported separately (cdnur, below). A month whose returns
 * outweigh its counter sales at some rate therefore reports a negative figure,
 * which is exactly the reduction being claimed.
 */
function buildB2cs(rows: GstrInvoice[], ctx: GstrContext): Gstr1B2cs[] {
  const byKey = new Map<string, Gstr1B2cs & { paise: Slab }>();
  for (const inv of rows) {
    if (registered(inv.partyGstin)) continue;
    const supply = supplyOf(inv, ctx);
    const isNote = inv.type === 'saleReturn';
    if (!isNote && supply === 'inter' && inv.grandTotal > B2CL_THRESHOLD) continue;
    if (isNote && cdnurApplies(inv, ctx)) continue;
    const pos = posOf(inv, ctx);
    for (const slab of slabsOf(inv.lines, supply, isNote ? -1 : 1)) {
      const key = `${supply}|${pos}|${slab.taxRate}`;
      const row = byKey.get(key) ?? {
        sply_ty: supply === 'inter' ? ('INTER' as const) : ('INTRA' as const),
        pos,
        typ: 'OE' as const,
        rt: ratePercent(slab.taxRate),
        txval: 0,
        csamt: 0,
        paise: emptySlab(slab.taxRate),
      };
      row.paise.taxable += slab.taxable;
      row.paise.cgst += slab.cgst;
      row.paise.sgst += slab.sgst;
      row.paise.igst += slab.igst;
      byKey.set(key, row);
    }
  }
  // Paise all the way down the accumulation, rupees only on the way out.
  return [...byKey.values()].map(({ paise, ...row }) => {
    const det = itemDet(paise);
    return { ...row, txval: det.txval, iamt: det.iamt, camt: det.camt, samt: det.samt };
  });
}

/**
 * Whether an unregistered credit note has to be reported as a document. It does
 * only when the supply behind it was itself reported as one — an inter-state
 * counter sale over the b2cl threshold. Everything else nets off inside b2cs.
 */
function cdnurApplies(note: GstrInvoice, ctx: GstrContext): boolean {
  return supplyOf(note, ctx) === 'inter' && note.grandTotal > B2CL_THRESHOLD;
}

function noteOf(inv: GstrInvoice, ctx: GstrContext): Gstr1Note {
  const note: Gstr1Note = {
    ntty: 'C',
    nt_num: inv.invoiceNo,
    nt_dt: gstDate(inv.date),
    val: rupees(inv.grandTotal),
    pos: posOf(inv, ctx),
    rchrg: 'N',
    inv_typ: 'R',
    itms: itemsOf(slabsOf(inv.lines, supplyOf(inv, ctx))),
  };
  // Goods that came back without anyone finding the original bill leave these
  // blank rather than naming a bill that was guessed at.
  if (inv.sourceInvoiceNo) note.inum = inv.sourceInvoiceNo;
  if (inv.sourceInvoiceDate) note.idt = gstDate(inv.sourceInvoiceDate);
  return note;
}

function buildCdnr(notes: GstrInvoice[], ctx: GstrContext): Gstr1Cdnr[] {
  const byCtin = new Map<string, Gstr1Note[]>();
  for (const inv of notes) {
    const ctin = registered(inv.partyGstin);
    if (!ctin) continue;
    const nt = byCtin.get(ctin) ?? [];
    nt.push(noteOf(inv, ctx));
    byCtin.set(ctin, nt);
  }
  return [...byCtin.entries()].map(([ctin, nt]) => ({ ctin, nt }));
}

function buildCdnur(notes: GstrInvoice[], ctx: GstrContext): Gstr1Cdnur[] {
  return notes
    .filter((inv) => !registered(inv.partyGstin) && cdnurApplies(inv, ctx))
    .map((inv) => {
      const { inv_typ, ...note } = noteOf(inv, ctx);
      return { typ: 'B2CL' as const, ...note };
    });
}

/**
 * The HSN summary, per HSN + rate, net of returns.
 *
 * The HSN is the one FROZEN ON THE LINE, never the item's HSN of today: a return
 * filed for July must read the same in August after someone reclassifies the
 * item. Lines with no HSN at all are still summarised, under a blank code — the
 * shop can see the gap and fill it in, which is more useful than dropping the
 * value out of a table that has to add up to the return.
 */
function buildHsn(rows: GstrInvoice[], ctx: GstrContext): Gstr1HsnRow[] {
  const byKey = new Map<
    string,
    { hsn: string; desc: string; uqc: string; qty: number; slab: Slab }
  >();
  for (const inv of rows) {
    const supply = supplyOf(inv, ctx);
    const sign = inv.type === 'saleReturn' ? -1 : 1;
    for (const line of inv.lines) {
      const hsn = (line.hsnCode ?? '').trim();
      const key = `${hsn}|${line.taxRate}`;
      const entry = byKey.get(key) ?? {
        hsn,
        // The first item seen under the code names the group; an HSN covers a
        // family of goods, and the CA reads the code, not the description.
        desc: line.itemName,
        uqc: uqc(line.unit),
        qty: 0,
        slab: emptySlab(line.taxRate),
      };
      const split = splitTax(sign * lineTax(line.amount, line.taxRate), supply);
      entry.qty += sign * line.qty;
      entry.slab.taxable += sign * line.amount;
      entry.slab.cgst += split.cgst;
      entry.slab.sgst += split.sgst;
      entry.slab.igst += split.igst;
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => a.hsn.localeCompare(b.hsn) || a.slab.taxRate - b.slab.taxRate)
    .map((e, i) => ({
      num: i + 1,
      hsn_sc: e.hsn,
      desc: e.desc,
      uqc: e.uqc,
      qty: units(e.qty),
      txval: rupees(e.slab.taxable),
      iamt: rupees(e.slab.igst),
      camt: rupees(e.slab.cgst),
      samt: rupees(e.slab.sgst),
      csamt: 0,
      rt: ratePercent(e.slab.taxRate),
    }));
}

// The document natures the GST portal numbers. Only the three this app can
// actually issue are listed; a shop that never writes a challan never sees one.
const DOC_NATURE: Record<GstrInvoice['type'], number> = {
  sale: 1, // Invoices for outward supply
  saleReturn: 5, // Credit note
  challan: 12, // Delivery challan, other than by way of supply
};

/** The numeric tail of an invoice number, for ordering 'INV-9' before 'INV-10'. */
const serialOf = (invoiceNo: string): number => Number(invoiceNo.match(/(\d+)\s*$/)?.[1] ?? NaN);

/**
 * The number ranges issued in the month, per document type.
 *
 * `cancel` is 0 throughout, honestly rather than helpfully: this app deletes a
 * bill outright instead of marking it cancelled, so a deleted number leaves a
 * hole in the range that nothing here can see. A month with a gap is worth the
 * CA asking about.
 */
function buildDocIssued(rows: GstrInvoice[]): Gstr1['doc_issued'] {
  const byNature = new Map<number, GstrInvoice[]>();
  for (const inv of rows) {
    const nature = DOC_NATURE[inv.type];
    byNature.set(nature, [...(byNature.get(nature) ?? []), inv]);
  }
  const doc_det = [...byNature.entries()]
    .sort(([a], [b]) => a - b)
    .map(([doc_num, docs]) => {
      const sorted = [...docs].sort((a, b) => {
        const [x, y] = [serialOf(a.invoiceNo), serialOf(b.invoiceNo)];
        // Numbers without a numeric tail fall back to plain text order.
        return Number.isNaN(x) || Number.isNaN(y) ? a.invoiceNo.localeCompare(b.invoiceNo) : x - y;
      });
      return {
        doc_num,
        docs: [
          {
            num: 1,
            from: sorted[0].invoiceNo,
            to: sorted[sorted.length - 1].invoiceNo,
            totnum: sorted.length,
            cancel: 0,
            net_issue: sorted.length,
          },
        ],
      };
    });
  return doc_det.length ? { doc_det } : undefined;
}

/**
 * The whole return for one month.
 *
 * Only outward supplies appear: purchases are the SUPPLIER's GSTR-1 and reach
 * the shop through GSTR-2B, so a purchase bill in the same month is deliberately
 * absent. Empty sections are dropped rather than written as `[]` — the utility
 * reads a missing section as "nothing to report", and an empty array in a file
 * has been known to be read as an attempt to wipe one.
 */
export function buildGstr1(rows: GstrInvoice[], ctx: GstrContext): Gstr1 {
  const sales = rows.filter((r) => r.type === 'sale');
  const notes = rows.filter((r) => r.type === 'saleReturn');
  const supplies = [...sales, ...notes];

  const b2b = buildB2b(sales, ctx);
  const b2cl = buildB2cl(sales, ctx);
  const b2cs = buildB2cs(supplies, ctx);
  const cdnr = buildCdnr(notes, ctx);
  const cdnur = buildCdnur(notes, ctx);
  const hsn = buildHsn(supplies, ctx);
  const docIssued = buildDocIssued(rows);

  return {
    gstin: registered(ctx.gstin),
    fp: ctx.fp,
    version: GSTR1_VERSION,
    hash: GSTR1_HASH,
    ...(b2b.length ? { b2b } : {}),
    ...(b2cl.length ? { b2cl } : {}),
    ...(b2cs.length ? { b2cs } : {}),
    ...(cdnr.length ? { cdnr } : {}),
    ...(cdnur.length ? { cdnur } : {}),
    ...(hsn.length ? { hsn: { data: hsn } } : {}),
    // Challans are not a supply, but their numbers still have to be declared,
    // so doc_issued sees every document the month issued.
    ...(docIssued ? { doc_issued: docIssued } : {}),
  };
}

/** `GSTR1_<GSTIN>_<MMYYYY>.json` — what the CA expects to find in the folder. */
export function gstr1Filename(gstin: string, fp: string): string {
  return `GSTR1_${registered(gstin) || 'NOGSTIN'}_${fp}.json`;
}

// ── GSTR-3B summary ───────────────────────────────────────────────────────────
// Not a filing either: the two rows of the 3B table a small shop actually fills
// (3.1(a) outward taxable supplies, 4(A)(5) all other ITC), taken from the SAME
// figures the GST summary screen shows. Nothing here re-derives them — if the
// summary and the 3B ever disagree, one of them is lying, so there is only one
// place the numbers come from.

export interface TaxHeads {
  cgst: number;
  sgst: number;
  igst: number;
}

/** The three heads as a rate-wise slab row carries them. */
export type RateSlab = TaxHeads;

/**
 * CGST/SGST/IGST rolled up out of the slab rows, forced to add back to the tax
 * figure they sit beside. Re-deriving line by line can land a paise away from
 * the invoice headers (a tax-inclusive bill carves its tax out of the gross); a
 * stray paise is given to the head already carrying the most rather than shown
 * as three numbers that don't sum to the fourth.
 */
export function reconcileTaxHeads(rows: RateSlab[] | undefined, total: number): TaxHeads {
  const heads = {
    cgst: (rows ?? []).reduce((s, r) => s + r.cgst, 0),
    sgst: (rows ?? []).reduce((s, r) => s + r.sgst, 0),
    igst: (rows ?? []).reduce((s, r) => s + r.igst, 0),
  };
  const residual = total - (heads.cgst + heads.sgst + heads.igst);
  if (residual !== 0) {
    const biggest = (['cgst', 'sgst', 'igst'] as const).reduce((a, b) =>
      Math.abs(heads[b]) > Math.abs(heads[a]) ? b : a,
    );
    if (heads[biggest] !== 0) heads[biggest] += residual;
  }
  return heads;
}

/** One 3B row: a taxable value and the tax on it, in rupees. */
export interface Gstr3bRow {
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface Gstr3bSummary {
  fp: string; // MMYYYY
  /** 3.1(a) — outward taxable supplies, other than zero-rated and exempt. */
  outward: Gstr3bRow;
  /** 4(A)(5) — all other ITC, the credit on the month's purchases. */
  itc: Gstr3bRow;
  /** Rupees. Positive = tax to pay in cash, negative = credit carried forward. */
  netPayable: number;
}

/** The figures the GST summary already derived, shaped for the 3B table. */
export function buildGstr3b(
  fp: string,
  summary: {
    taxableSales: number;
    outputTax: number;
    taxablePurchases: number;
    inputTax: number;
    netPayable: number;
  },
  rates: { sales: RateSlab[]; purchases: RateSlab[] },
): Gstr3bSummary {
  const output = reconcileTaxHeads(rates.sales, summary.outputTax);
  const input = reconcileTaxHeads(rates.purchases, summary.inputTax);
  const row = (taxable: number, heads: TaxHeads): Gstr3bRow => ({
    txval: rupees(taxable),
    iamt: rupees(heads.igst),
    camt: rupees(heads.cgst),
    samt: rupees(heads.sgst),
    csamt: 0,
  });
  return {
    fp,
    outward: row(summary.taxableSales, output),
    itc: row(summary.taxablePurchases, input),
    netPayable: rupees(summary.netPayable),
  };
}
