import type { Invoice, Party, Payment } from '@/db/schema';

// The ledger is the one number a shopkeeper argues with a customer over, and the
// plan forbids storing it — it is derived from transactions every time. These
// tests pin that derivation: the sign convention, the running balance, and the
// rule that a quotation or challan moves no money.
//
// db/client is stubbed so the service modules load in plain Node (they only touch
// `db` when a query actually runs, and every query here is mocked out).
jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));

jest.mock('@/modules/parties/service', () => ({
  ...jest.requireActual('@/modules/parties/service'),
  getParty: jest.fn(),
  listParties: jest.fn(),
}));

jest.mock('@/modules/invoices/service', () => ({
  ...jest.requireActual('@/modules/invoices/service'),
  listInvoices: jest.fn(),
  listInvoicesByParty: jest.fn(),
}));

jest.mock('@/modules/payments/service', () => ({
  ...jest.requireActual('@/modules/payments/service'),
  listPayments: jest.fn(),
  listPaymentsByParty: jest.fn(),
}));

import { getPartyLedger, listPartiesWithBalance } from '@/modules/parties/ledger';
import { listInvoices, listInvoicesByParty } from '@/modules/invoices/service';
import { getParty, listParties } from '@/modules/parties/service';
import { listPayments, listPaymentsByParty } from '@/modules/payments/service';

const mockGetParty = getParty as jest.MockedFunction<typeof getParty>;
const mockListParties = listParties as jest.MockedFunction<typeof listParties>;
const mockListInvoices = listInvoices as jest.MockedFunction<typeof listInvoices>;
const mockListInvoicesByParty = listInvoicesByParty as jest.MockedFunction<
  typeof listInvoicesByParty
>;
const mockListPayments = listPayments as jest.MockedFunction<typeof listPayments>;
const mockListPaymentsByParty = listPaymentsByParty as jest.MockedFunction<
  typeof listPaymentsByParty
>;

function party(over: Partial<Party> = {}): Party {
  return {
    id: 1,
    name: 'Rajesh',
    phone: null,
    gstin: null,
    address: null,
    city: null,
    state: null,
    type: 'customer',
    openingBalance: 0,
    voiceAlias: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    type: 'sale',
    invoiceNo: 'INV/2026-27/001',
    partyId: 1,
    date: '2026-04-10',
    subtotal: 10000,
    taxTotal: 1800,
    discount: 0,
    grandTotal: 11800,
    paymentStatus: 'unpaid',
    taxMode: 'exclusive',
    createdAt: '2026-04-10T00:00:00.000Z',
    ...over,
  };
}

function payment(over: Partial<Payment> = {}): Payment {
  return {
    id: 1,
    partyId: 1,
    invoiceId: null,
    amount: 5000,
    mode: 'cash',
    direction: null,
    date: '2026-04-11',
    notes: null,
    createdAt: '2026-04-11T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListInvoices.mockResolvedValue([]);
  mockListInvoicesByParty.mockResolvedValue([]);
  mockListPayments.mockResolvedValue([]);
  mockListPaymentsByParty.mockResolvedValue([]);
});

describe('getPartyLedger', () => {
  it('returns null for a party that does not exist', async () => {
    mockGetParty.mockResolvedValue(undefined);
    expect(await getPartyLedger(99)).toBeNull();
  });

  it('opens with the opening balance', async () => {
    mockGetParty.mockResolvedValue(party({ openingBalance: 25000 }));
    const ledger = await getPartyLedger(1);
    expect(ledger?.entries[0]).toMatchObject({ kind: 'opening', balance: 25000 });
    expect(ledger?.balance).toBe(25000);
  });

  it('increases what a customer owes on a sale', async () => {
    mockGetParty.mockResolvedValue(party());
    mockListInvoicesByParty.mockResolvedValue([invoice({ grandTotal: 11800 })]);
    const ledger = await getPartyLedger(1);
    expect(ledger?.balance).toBe(11800); // positive = receivable
  });

  it('reduces the balance when the customer pays', async () => {
    mockGetParty.mockResolvedValue(party());
    mockListInvoicesByParty.mockResolvedValue([invoice({ grandTotal: 11800 })]);
    mockListPaymentsByParty.mockResolvedValue([payment({ amount: 5000, date: '2026-04-11' })]);
    const ledger = await getPartyLedger(1);
    expect(ledger?.balance).toBe(6800);
  });

  it('books a purchase from a supplier as money we owe', async () => {
    mockGetParty.mockResolvedValue(party({ type: 'supplier' }));
    mockListInvoicesByParty.mockResolvedValue([
      invoice({ type: 'purchase', grandTotal: 30000 }),
    ]);
    const ledger = await getPartyLedger(1);
    expect(ledger?.balance).toBe(-30000); // negative = payable
  });

  it('settles a payable when we pay the supplier', async () => {
    mockGetParty.mockResolvedValue(party({ type: 'supplier' }));
    mockListInvoicesByParty.mockResolvedValue([
      invoice({ type: 'purchase', grandTotal: 30000 }),
    ]);
    mockListPaymentsByParty.mockResolvedValue([payment({ amount: 30000 })]);
    const ledger = await getPartyLedger(1);
    expect(ledger?.balance).toBe(0);
  });

  it('lets an explicit direction override the party default (customer refund)', async () => {
    mockGetParty.mockResolvedValue(party());
    mockListPaymentsByParty.mockResolvedValue([payment({ amount: 5000, direction: 'out' })]);
    const ledger = await getPartyLedger(1);
    // Money paid OUT to a customer increases what they owe us back.
    expect(ledger?.balance).toBe(5000);
  });

  it('ignores quotations and challans — they are not financial documents', async () => {
    mockGetParty.mockResolvedValue(party());
    mockListInvoicesByParty.mockResolvedValue([
      invoice({ id: 1, type: 'quotation', grandTotal: 50000 }),
      invoice({ id: 2, type: 'challan', grandTotal: 70000 }),
    ]);
    const ledger = await getPartyLedger(1);
    expect(ledger?.balance).toBe(0);
    expect(ledger?.entries).toHaveLength(1); // opening only
  });

  it('runs the balance forward in date order', async () => {
    mockGetParty.mockResolvedValue(party({ openingBalance: 1000 }));
    mockListInvoicesByParty.mockResolvedValue([
      invoice({ id: 2, date: '2026-04-20', grandTotal: 2000 }),
      invoice({ id: 1, date: '2026-04-10', grandTotal: 5000 }),
    ]);
    mockListPaymentsByParty.mockResolvedValue([
      payment({ id: 1, date: '2026-04-15', amount: 3000 }),
    ]);
    const ledger = await getPartyLedger(1);
    expect(ledger?.entries.map((e) => e.balance)).toEqual([1000, 6000, 3000, 5000]);
    expect(ledger?.balance).toBe(5000);
  });
});

describe('listPartiesWithBalance', () => {
  it('keeps each party on its own balance', async () => {
    const a = party({ id: 1, name: 'Rajesh', openingBalance: 1000 });
    const b = party({ id: 2, name: 'Kumar', type: 'supplier' });
    mockListParties.mockResolvedValue([a, b]);
    mockListInvoices.mockResolvedValue([
      invoice({ id: 1, partyId: 1, grandTotal: 5000 }),
      invoice({ id: 2, partyId: 2, type: 'purchase', grandTotal: 8000 }),
    ]);
    mockListPayments.mockResolvedValue([payment({ id: 1, partyId: 1, amount: 2000 })]);

    const rows = await listPartiesWithBalance();
    expect(rows).toEqual([
      { party: a, balance: 4000 }, // 1000 opening + 5000 sale − 2000 received
      { party: b, balance: -8000 },
    ]);
  });

  it('drops transactions whose party is gone instead of throwing', async () => {
    const a = party({ id: 1 });
    mockListParties.mockResolvedValue([a]);
    mockListInvoices.mockResolvedValue([invoice({ id: 9, partyId: 404, grandTotal: 9999 })]);
    const rows = await listPartiesWithBalance();
    expect(rows).toEqual([{ party: a, balance: 0 }]);
  });

  it('matches getPartyLedger for the same data', async () => {
    const p = party({ openingBalance: 1000 });
    const invoices = [invoice({ id: 1, grandTotal: 5000 })];
    const payments = [payment({ id: 1, amount: 2000 })];

    mockGetParty.mockResolvedValue(p);
    mockListInvoicesByParty.mockResolvedValue(invoices);
    mockListPaymentsByParty.mockResolvedValue(payments);
    mockListParties.mockResolvedValue([p]);
    mockListInvoices.mockResolvedValue(invoices);
    mockListPayments.mockResolvedValue(payments);

    const single = await getPartyLedger(1);
    const [fromList] = await listPartiesWithBalance();
    expect(single?.balance).toBe(fromList.balance);
  });
});
