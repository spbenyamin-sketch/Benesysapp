// What the Tally writer is handed.
//
// Plain shapes, not drizzle rows — the same trick modules/reports/gstr.ts uses,
// and for the same reason: the builder is then pure, and its tests need no
// database. The loader (modules/tally/service.ts) is what turns the shop's
// tables into this.
//
// Money is paise and rates are basis points everywhere below, exactly as the
// rest of the app. Rupees appear once, at the very edge of the XML writer.

/** The shop itself, from Settings → Business. */
export interface TallyBusiness {
  name: string;
  gstin: string;
  /** The shop's own state — what decides CGST+SGST against IGST. */
  state: string;
}

/** A party as the ledger master will describe them. */
export interface TallyParty {
  id: number;
  name: string;
  type: 'customer' | 'supplier';
  gstin: string | null;
  state: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
}

/** One line of a bill, already pre-tax and already net of its own discount. */
export interface TallyLine {
  taxRate: number; // basis points
  amount: number; // paise, taxable value
}

export type TallyInvoiceType = 'sale' | 'purchase' | 'saleReturn' | 'purchaseReturn';

export interface TallyInvoice {
  id: number;
  type: TallyInvoiceType;
  invoiceNo: string;
  date: string; // ISO 'YYYY-MM-DD'
  partyId: number;
  subtotal: number; // paise, pre-tax
  taxTotal: number; // paise
  discount: number; // paise, off the TAXED total — belongs to no slab
  roundOff: number; // paise, signed
  grandTotal: number; // paise
  /** Frozen on the bill; null falls back to the party, then to the shop. */
  placeOfSupply: string | null;
  lines: TallyLine[];
  /** The bill a credit/debit note reverses, when it could be found. */
  sourceInvoiceNo?: string | null;
  sourceDate?: string | null;
  accounted: boolean;
}

export interface TallyPayment {
  id: number;
  partyId: number;
  amount: number; // paise
  mode: 'cash' | 'upi' | 'card' | 'bank';
  direction: 'in' | 'out';
  date: string;
  notes: string | null;
  /** The cash box or bank account it moved through; null = never recorded. */
  accountName: string | null;
  accountType: 'cash' | 'bank' | null;
  /** The bill it was set against; null = on account. */
  invoiceNo: string | null;
  accounted: boolean;
}

export interface TallyExpense {
  id: number;
  category: string;
  amount: number; // paise, GROSS — the GST is inside it
  taxRate: number; // basis points
  date: string;
  notes: string | null;
  accountName: string | null;
  accountType: 'cash' | 'bank' | null;
  accounted: boolean;
}

export interface TallyPayload {
  from: string;
  to: string;
  business: TallyBusiness;
  parties: TallyParty[];
  invoices: TallyInvoice[];
  payments: TallyPayment[];
  expenses: TallyExpense[];
}

/** What the shop ticked on the export screen. */
export interface TallyOptions {
  /** Write the ledger masters the vouchers refer to. Default true. */
  masters?: boolean;
  /** Which vouchers to write. Default: all of them. */
  kinds?: {
    sales?: boolean;
    purchases?: boolean;
    returns?: boolean;
    payments?: boolean;
    expenses?: boolean;
  };
}
