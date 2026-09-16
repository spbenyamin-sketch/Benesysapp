import { sql } from 'drizzle-orm';
import { bigint, integer, pgTable, text } from 'drizzle-orm/pg-core';

// ─────────────────────────────────────────────────────────────────────────────
// The Postgres twin of the app's db/schema.ts — ONE SHOP's books.
//
// Every shop gets its own Postgres schema (shop_1, shop_2, …) holding exactly
// these tables, and a request runs with search_path pointed at its shop. That
// is what lets the app's service code (modules/*/service.ts) run here unchanged:
// it never has to say which shop it means, and a query that forgets to can't
// reach another shop's rows. The phone's SQLite file is one shop too.
//
// So this file has to stay in step with db/schema.ts: same exported names, same
// column names, same TypeScript types on every row. When a column is added to
// the app, add it here and run `npm run db:generate`.
//
// Unit conventions are the app's: money in integer paise, rates in basis
// points, qty/stock in thousandths, dates as ISO strings. Money is BIGINT here —
// SQLite's INTEGER is already 64-bit, and a year of a busy shop's sales in paise
// does not fit Postgres's 32-bit integer.
// ─────────────────────────────────────────────────────────────────────────────

const money = (name: string) => bigint(name, { mode: 'number' });

// Same ISO 8601 UTC shape the SQLite default writes: 2026-09-15T10:04:31.123Z
const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

// By default, not always: a phone's books are uploaded with their own ids so
// every foreign key in them still points at the right row.
const id = () => integer('id').primaryKey().generatedByDefaultAsIdentity();

export const parties = pgTable('parties', {
  id: id(),
  name: text('name').notNull(),
  phone: text('phone'),
  gstin: text('gstin'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  type: text('type', { enum: ['customer', 'supplier'] }).notNull().default('customer'),
  openingBalance: money('opening_balance').notNull().default(0),
  voiceAlias: text('voice_alias'),
  createdAt: createdAt(),
});

export const items = pgTable('items', {
  id: id(),
  name: text('name').notNull(),
  hsnCode: text('hsn_code'),
  barcode: text('barcode'),
  category: text('category'),
  unit: text('unit').notNull().default('pcs'),
  salePrice: money('sale_price').notNull().default(0),
  purchasePrice: money('purchase_price').notNull().default(0),
  taxRate: integer('tax_rate').notNull().default(0),
  openingStock: bigint('opening_stock', { mode: 'number' }).notNull().default(0),
  currentStock: bigint('current_stock', { mode: 'number' }).notNull().default(0),
  minStock: bigint('min_stock', { mode: 'number' }).notNull().default(0),
  voiceAlias: text('voice_alias'),
  imageUri: text('image_uri'),
  createdAt: createdAt(),
});

export const invoices = pgTable('invoices', {
  id: id(),
  type: text('type', {
    enum: ['sale', 'purchase', 'quotation', 'challan', 'saleReturn', 'purchaseReturn'],
  }).notNull(),
  invoiceNo: text('invoice_no').notNull(),
  partyId: integer('party_id')
    .notNull()
    .references(() => parties.id),
  date: text('date').notNull(),
  subtotal: money('subtotal').notNull().default(0),
  taxTotal: money('tax_total').notNull().default(0),
  discount: money('discount').notNull().default(0),
  discountPercent: integer('discount_percent'),
  grandTotal: money('grand_total').notNull().default(0),
  paymentStatus: text('payment_status', { enum: ['unpaid', 'partial', 'paid'] })
    .notNull()
    .default('unpaid'),
  dueDate: text('due_date'),
  placeOfSupply: text('place_of_supply'),
  roundOff: money('round_off').notNull().default(0),
  sourceInvoiceId: integer('source_invoice_id'),
  taxMode: text('tax_mode', { enum: ['exclusive', 'inclusive'] })
    .notNull()
    .default('exclusive'),
  createdAt: createdAt(),
});

export const invoiceItems = pgTable('invoice_items', {
  id: id(),
  invoiceId: integer('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  itemId: integer('item_id')
    .notNull()
    .references(() => items.id),
  qty: bigint('qty', { mode: 'number' }).notNull(),
  rate: money('rate').notNull(),
  taxRate: integer('tax_rate').notNull().default(0),
  amount: money('amount').notNull(),
  costPrice: money('cost_price'),
  discount: money('discount').notNull().default(0),
  discountPercent: integer('discount_percent'),
  hsnCode: text('hsn_code'),
});

export const payments = pgTable('payments', {
  id: id(),
  partyId: integer('party_id')
    .notNull()
    .references(() => parties.id),
  invoiceId: integer('invoice_id').references(() => invoices.id),
  amount: money('amount').notNull(),
  mode: text('mode', { enum: ['cash', 'upi', 'card', 'bank'] }).notNull().default('cash'),
  direction: text('direction', { enum: ['in', 'out'] }),
  accountId: integer('account_id').references(() => bankAccounts.id),
  date: text('date').notNull(),
  notes: text('notes'),
  createdAt: createdAt(),
});

export const expenses = pgTable('expenses', {
  id: id(),
  category: text('category').notNull(),
  amount: money('amount').notNull(),
  taxRate: integer('tax_rate').notNull().default(0),
  accountId: integer('account_id').references(() => bankAccounts.id),
  date: text('date').notNull(),
  notes: text('notes'),
  createdAt: createdAt(),
});

export const bankAccounts = pgTable('bank_accounts', {
  id: id(),
  name: text('name').notNull(),
  type: text('type', { enum: ['cash', 'bank'] }).notNull().default('bank'),
  openingBalance: money('opening_balance').notNull().default(0),
  createdAt: createdAt(),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
});

// ── Inferred row types — the same names the app's services import ───────────
export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type NewBankAccount = typeof bankAccounts.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
