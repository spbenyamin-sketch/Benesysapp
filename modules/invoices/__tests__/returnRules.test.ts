// db/client is stubbed so the services load in plain Node; every rule below is
// a pure function.
jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));

import { stockSign } from '@/modules/invoices/service';
import { invoiceDelta } from '@/modules/parties/ledger';
import { defaultDirectionForInvoice } from '@/modules/payments/service';
import { prefixFor } from '@/utils/invoiceNumber';
import type { Invoice } from '@/db/schema';

// A return is the one document that runs backwards, and there are now two of
// them. These pin all four things that have to flip together — if any one of
// them is wrong the shop's stock, its ledger or its GST goes wrong with it.

const bill = (type: Invoice['type'], grandTotal = 10000) => ({ type, grandTotal }) as Invoice;

describe('stock direction', () => {
  it('sends goods out on a sale and on a purchase return', () => {
    expect(stockSign('sale')).toBe(-1);
    expect(stockSign('purchaseReturn')).toBe(-1);
  });

  it('brings goods in on a purchase and on a sale return', () => {
    expect(stockSign('purchase')).toBe(1);
    expect(stockSign('saleReturn')).toBe(1);
  });

  it('leaves the shelf alone for documents that promise rather than move', () => {
    expect(stockSign('quotation')).toBe(0);
    expect(stockSign('challan')).toBe(0);
  });
});

describe('ledger direction', () => {
  it('mirrors the document it reverses, exactly', () => {
    // A sale return undoes a sale; a purchase return undoes a purchase.
    expect(invoiceDelta(bill('sale'))).toBe(-invoiceDelta(bill('saleReturn')));
    expect(invoiceDelta(bill('purchase'))).toBe(-invoiceDelta(bill('purchaseReturn')));
  });

  it('leaves the shop owing the supplier less after goods go back', () => {
    // Buying puts us in debt; sending it back takes us out of it.
    expect(invoiceDelta(bill('purchase'))).toBe(-10000);
    expect(invoiceDelta(bill('purchaseReturn'))).toBe(10000);
  });

  it('moves nothing for a quotation or a challan', () => {
    expect(invoiceDelta(bill('quotation'))).toBe(0);
    expect(invoiceDelta(bill('challan'))).toBe(0);
  });
});

describe('settling a return', () => {
  it('pays money OUT on a credit note and takes it IN on a debit note', () => {
    // Refunding a customer costs the shop money; a supplier refunding us does not.
    expect(defaultDirectionForInvoice('saleReturn')).toBe('out');
    expect(defaultDirectionForInvoice('purchaseReturn')).toBe('in');
    expect(defaultDirectionForInvoice('sale')).toBe('in');
    expect(defaultDirectionForInvoice('purchase')).toBe('out');
  });
});

describe('numbering', () => {
  it('gives each return its own series, never the document it reverses', () => {
    const prefixes = (['sale', 'purchase', 'saleReturn', 'purchaseReturn'] as const).map((t) =>
      prefixFor(t),
    );
    expect(prefixes).toEqual(['INV', 'PUR', 'CN', 'DN']);
    expect(new Set(prefixes).size).toBe(4);
  });

  it('lets the shop rename only its own sale series', () => {
    expect(prefixFor('sale', 'BILL')).toBe('BILL');
    // A debit note must stay findable as one, whatever the sale prefix is.
    expect(prefixFor('purchaseReturn', 'BILL')).toBe('DN');
  });
});
