// The GSTR-1 builders take rows and return an object — they never touch
// db/client, so unlike the other report tests there is nothing here to stub.
// That is the whole reason they are pure: what goes to the government has to be
// checkable without a device, a database or a filing season.
//
// What is pinned below is the handful of rules that would put a wrong figure in
// front of the CA: who lands in b2b and who in b2cs, that a state line turns the
// tax into IGST and a local sale into two halves that still add up, that a
// credit note both appears as a document and comes off the totals, that the HSN
// is the one frozen on the line, and that paise reach the JSON as rupees that
// still reconcile.

import {
  buildGstr1,
  buildGstr3b,
  gstr1Filename,
  monthRange,
  type GstrContext,
  type GstrInvoice,
  type GstrLine,
} from '@/modules/reports/gstr';

const ctx: GstrContext = { gstin: '33AAAAA0000A1Z5', state: 'Tamil Nadu', fp: '072026' };

const line = (over: Partial<GstrLine> = {}): GstrLine => ({
  taxRate: 1800,
  amount: 100000, // ₹1,000
  qty: 1000, // 1 unit
  hsnCode: '1006',
  itemName: 'Rice',
  unit: 'kg',
  ...over,
});

let nextId = 1;
const invoice = (over: Partial<GstrInvoice> = {}): GstrInvoice => {
  const id = nextId++;
  return {
    id,
    type: 'sale',
    invoiceNo: `INV-${id}`,
    date: '2026-07-05',
    grandTotal: 118000,
    placeOfSupply: 'Tamil Nadu',
    sourceInvoiceId: null,
    sourceInvoiceNo: null,
    sourceInvoiceDate: null,
    partyName: 'Rajesh',
    partyGstin: null,
    partyState: 'Tamil Nadu',
    lines: [line()],
    ...over,
  };
};

beforeEach(() => {
  nextId = 1;
});

/** Rupee figures back to paise, so a total can be compared exactly. */
const paise = (rupees: number) => Math.round(rupees * 100);

describe('who goes where', () => {
  it('puts a sale to a party with a GSTIN in b2b, under their GSTIN', () => {
    const out = buildGstr1([invoice({ partyGstin: '33BBBBB1111B1Z5' })], ctx);
    expect(out.b2b).toHaveLength(1);
    expect(out.b2b![0].ctin).toBe('33BBBBB1111B1Z5');
    expect(out.b2b![0].inv[0]).toMatchObject({
      inum: 'INV-1',
      idt: '05-07-2026', // DD-MM-YYYY, not the ISO day the app stores
      val: 1180,
      pos: '33',
      rchrg: 'N',
      inv_typ: 'R',
    });
    // A registered sale is a document, never a counter-trade summary line.
    expect(out.b2cs).toBeUndefined();
  });

  it('summarises a sale to a party with no GSTIN in b2cs', () => {
    const out = buildGstr1([invoice()], ctx);
    expect(out.b2b).toBeUndefined();
    expect(out.b2cs).toHaveLength(1);
    expect(out.b2cs![0]).toMatchObject({ sply_ty: 'INTRA', pos: '33', typ: 'OE', rt: 18 });
  });

  it('keeps two counter sales at the same rate and place as ONE b2cs line', () => {
    const out = buildGstr1([invoice(), invoice()], ctx);
    expect(out.b2cs).toHaveLength(1);
    expect(out.b2cs![0].txval).toBe(2000);
  });

  it('drops the sections a quiet month has nothing for', () => {
    const out = buildGstr1([], ctx);
    expect(out).toEqual({
      gstin: '33AAAAA0000A1Z5',
      fp: '072026',
      version: 'GST3.0.4',
      hash: 'hash',
    });
  });
});

describe('the state line', () => {
  it('carries the whole tax as IGST when the goods left the state', () => {
    const out = buildGstr1(
      [invoice({ partyGstin: '29CCCCC2222C1Z5', placeOfSupply: 'Karnataka' })],
      ctx,
    );
    const det = out.b2b![0].inv[0].itms[0].itm_det;
    expect(det).toEqual({ rt: 18, txval: 1000, iamt: 180, csamt: 0 });
    expect(out.b2b![0].inv[0].pos).toBe('29');
  });

  it('halves it into CGST and SGST on a local sale, and the halves add back', () => {
    // A tax that does not halve evenly: ₹123.50 @18% = ₹22.23, so one head has
    // to carry the odd paise or the return will not reconcile.
    const out = buildGstr1(
      [invoice({ partyGstin: '33BBBBB1111B1Z5', lines: [line({ amount: 12350 })] })],
      ctx,
    );
    const det = out.b2b![0].inv[0].itms[0].itm_det;
    expect(det.iamt).toBeUndefined();
    expect(paise(det.camt!) + paise(det.samt!)).toBe(2223);
  });

  it('reads a bill with no place of supply as a local one, the way the invoice prints', () => {
    const out = buildGstr1([invoice({ placeOfSupply: null, partyState: null })], ctx);
    expect(out.b2cs![0]).toMatchObject({ sply_ty: 'INTRA', pos: '33' });
  });

  it('uses the place of supply FROZEN on the bill, not where the party lives now', () => {
    // The customer has since moved to Kerala; the July return must not follow.
    const out = buildGstr1(
      [invoice({ placeOfSupply: 'Karnataka', partyState: 'Kerala' })],
      ctx,
    );
    expect(out.b2cs![0]).toMatchObject({ sply_ty: 'INTER', pos: '29' });
  });
});

describe('credit notes', () => {
  const sale = () =>
    invoice({ partyGstin: '33BBBBB1111B1Z5', invoiceNo: 'INV-100', date: '2026-07-02' });

  it('appears under cdnr against the party, naming the bill it reverses', () => {
    const out = buildGstr1(
      [
        sale(),
        invoice({
          type: 'saleReturn',
          invoiceNo: 'CN-1',
          date: '2026-07-20',
          partyGstin: '33BBBBB1111B1Z5',
          sourceInvoiceId: 1,
          sourceInvoiceNo: 'INV-100',
          sourceInvoiceDate: '2026-07-02',
          grandTotal: 118000,
        }),
      ],
      ctx,
    );
    expect(out.cdnr).toHaveLength(1);
    expect(out.cdnr![0].nt[0]).toMatchObject({
      ntty: 'C',
      nt_num: 'CN-1',
      nt_dt: '20-07-2026',
      inum: 'INV-100',
      idt: '02-07-2026',
    });
  });

  it('leaves the original blank when the goods came back without a bill', () => {
    const out = buildGstr1(
      [invoice({ type: 'saleReturn', partyGstin: '33BBBBB1111B1Z5' })],
      ctx,
    );
    expect(out.cdnr![0].nt[0].inum).toBeUndefined();
    expect(out.cdnr![0].nt[0].idt).toBeUndefined();
  });

  it('takes what came back off the counter-trade summary', () => {
    const out = buildGstr1(
      [
        invoice(), // ₹1,000 sold over the counter
        invoice(), // and another
        invoice({ type: 'saleReturn', lines: [line({ amount: 30000 })] }), // ₹300 back
      ],
      ctx,
    );
    expect(out.b2cs).toHaveLength(1);
    expect(out.b2cs![0].txval).toBe(1700);
    // The tax comes off with it: ₹1,700 @18% = ₹306, halved.
    expect(paise(out.b2cs![0].camt!) + paise(out.b2cs![0].samt!)).toBe(30600);
    // A small shop's unregistered return nets off rather than becoming a
    // document — cdnur is only for the ones reported bill by bill.
    expect(out.cdnur).toBeUndefined();
  });

  it('takes it off the HSN table too', () => {
    const out = buildGstr1(
      [invoice(), invoice({ type: 'saleReturn', lines: [line({ amount: 30000, qty: 300 })] })],
      ctx,
    );
    expect(out.hsn!.data).toHaveLength(1);
    expect(out.hsn!.data[0]).toMatchObject({ hsn_sc: '1006', qty: 0.7, txval: 700 });
  });

  it('reports an unregistered note as a document once the sale was one', () => {
    // Over ₹2.5 lakh and out of state: the sale is b2cl, so the note is cdnur.
    const big = { grandTotal: 30_000_000, placeOfSupply: 'Karnataka', lines: [line({ amount: 25_000_000 })] };
    const out = buildGstr1(
      [invoice(big), invoice({ ...big, type: 'saleReturn', invoiceNo: 'CN-9' })],
      ctx,
    );
    expect(out.b2cl).toHaveLength(1);
    expect(out.cdnur).toHaveLength(1);
    expect(out.cdnur![0]).toMatchObject({ typ: 'B2CL', ntty: 'C', nt_num: 'CN-9', pos: '29' });
    // Neither the sale nor the note is also counted in the summary.
    expect(out.b2cs).toBeUndefined();
  });
});

describe('the HSN summary', () => {
  it('uses the HSN frozen on the line, so a reclassification cannot rewrite July', () => {
    // The same item, billed under one code in the morning and re-coded later.
    const out = buildGstr1(
      [
        invoice({ lines: [line({ hsnCode: '1006' })] }),
        invoice({ lines: [line({ hsnCode: '1006' })] }),
      ],
      ctx,
    );
    expect(out.hsn!.data).toHaveLength(1);
    expect(out.hsn!.data[0]).toMatchObject({ hsn_sc: '1006', desc: 'Rice', uqc: 'KGS', qty: 2 });
  });

  it('keeps two rows when the same rate was billed under two codes', () => {
    const out = buildGstr1(
      [invoice({ lines: [line({ hsnCode: '1006' }), line({ hsnCode: '1101' })] })],
      ctx,
    );
    expect(out.hsn!.data.map((r) => r.hsn_sc)).toEqual(['1006', '1101']);
  });

  it('still counts a line that was never given an HSN, under a blank code', () => {
    const out = buildGstr1([invoice({ lines: [line({ hsnCode: null })] })], ctx);
    expect(out.hsn!.data[0]).toMatchObject({ hsn_sc: '', txval: 1000 });
  });

  it('splits one rate into two rows when the same code was sold at two', () => {
    const out = buildGstr1(
      [invoice({ lines: [line({ taxRate: 500 }), line({ taxRate: 1800 })] })],
      ctx,
    );
    expect(out.hsn!.data.map((r) => r.rt)).toEqual([5, 18]);
  });
});

describe('paise reaching the JSON as rupees', () => {
  it('adds the lines up in paise and converts once, so the slab still reconciles', () => {
    const out = buildGstr1(
      [
        invoice({
          partyGstin: '33BBBBB1111B1Z5',
          grandTotal: 59006,
          lines: [
            line({ amount: 33333 }), // tax ₹60.00
            line({ amount: 16667 }), // tax ₹30.00
            line({ amount: 5 }), // tax ₹0.01
          ],
        }),
      ],
      ctx,
    );
    const det = out.b2b![0].inv[0].itms[0].itm_det;
    expect(det.txval).toBe(500.05);
    // ₹45.01 + ₹45.00 — added as rupee floats this is 90.009999…, which is why
    // the books never leave paise until the very last step.
    expect(paise(det.camt!) + paise(det.samt!)).toBe(9001);
  });

  it('carries the invoice value, discount and round-off included, not the slab sum', () => {
    const out = buildGstr1(
      [invoice({ partyGstin: '33BBBBB1111B1Z5', grandTotal: 117500 })],
      ctx,
    );
    expect(out.b2b![0].inv[0].val).toBe(1175);
  });
});

describe('doc_issued', () => {
  it('reports the range issued per document type, credit notes separately', () => {
    const out = buildGstr1(
      [
        invoice({ invoiceNo: 'INV-9' }),
        invoice({ invoiceNo: 'INV-10' }),
        invoice({ invoiceNo: 'CN-1', type: 'saleReturn' }),
      ],
      ctx,
    );
    const det = out.doc_issued!.doc_det;
    expect(det.map((d) => d.doc_num)).toEqual([1, 5]);
    // 'INV-9' before 'INV-10': the range follows the number, not the alphabet.
    expect(det[0].docs[0]).toMatchObject({ from: 'INV-9', to: 'INV-10', totnum: 2, net_issue: 2 });
    expect(det[1].docs[0]).toMatchObject({ from: 'CN-1', to: 'CN-1', totnum: 1 });
  });

  it('declares a challan even though it supplied nothing', () => {
    const out = buildGstr1([invoice({ type: 'challan', invoiceNo: 'DC-1' })], ctx);
    expect(out.doc_issued!.doc_det[0].doc_num).toBe(12);
    expect(out.b2cs).toBeUndefined();
    expect(out.hsn).toBeUndefined();
  });
});

describe('the 3B table', () => {
  it('shapes the figures the GST summary already derived, without redoing them', () => {
    const summary = {
      taxableSales: 100000,
      outputTax: 18000,
      taxablePurchases: 50000,
      inputTax: 9000,
      netPayable: 9000,
    };
    const out = buildGstr3b('072026', summary, {
      sales: [{ cgst: 9000, sgst: 9000, igst: 0 }],
      purchases: [{ cgst: 4500, sgst: 4500, igst: 0 }],
    });
    expect(out.outward).toEqual({ txval: 1000, iamt: 0, camt: 90, samt: 90, csamt: 0 });
    expect(out.itc).toEqual({ txval: 500, iamt: 0, camt: 45, samt: 45, csamt: 0 });
    expect(out.netPayable).toBe(90);
  });

  it('gives a stray paise to the biggest head rather than letting the heads fall short', () => {
    const out = buildGstr3b(
      '072026',
      { taxableSales: 12350, outputTax: 2223, taxablePurchases: 0, inputTax: 0, netPayable: 2223 },
      { sales: [{ cgst: 1111, sgst: 1111, igst: 0 }], purchases: [] },
    );
    expect(paise(out.outward.camt) + paise(out.outward.samt)).toBe(2223);
  });
});

describe('the odds and ends', () => {
  it('names the file the way the CA expects to find it', () => {
    expect(gstr1Filename('33aaaaa0000a1z5', '072026')).toBe('GSTR1_33AAAAA0000A1Z5_072026.json');
  });

  it('knows how long a month is, February included', () => {
    expect(monthRange('2026-07')).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});
