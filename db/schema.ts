import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ─────────────────────────────────────────────────────────────────────────────
// UNIT CONVENTIONS (enforced here so the rest of the app never sees a float)
//   money   → INTEGER paise.        ₹1.00     = 100
//   taxRate → INTEGER basis points. 18%       = 1800   (1% = 100)
//   qty     → INTEGER thousandths.  2.5 units = 2500   (1 unit = 1000)
//   stock   → INTEGER thousandths.  same as qty
//   dates   → ISO 8601 strings.     day = 'YYYY-MM-DD', timestamp = full ISO Z
// Ledger/party balances are ALWAYS computed from transactions, never stored.
// ─────────────────────────────────────────────────────────────────────────────

// Server(app)-side timestamp default, stored as ISO 8601 UTC.
const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

export const parties = sqliteTable('parties', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone'),
  gstin: text('gstin'),
  address: text('address'),
  city: text('city'),
  state: text('state'), // Indian state/UT name (see utils/constants INDIAN_STATES)
  type: text('type', { enum: ['customer', 'supplier'] }).notNull().default('customer'),
  openingBalance: integer('opening_balance').notNull().default(0), // paise
  voiceAlias: text('voice_alias'), // Tamil/spoken name(s), comma-separated — voice matching
  createdAt: createdAt(),
});

export const items = sqliteTable('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  hsnCode: text('hsn_code'), // HSN/SAC code for GST classification
  category: text('category'), // free text; presets in utils/constants ITEM_CATEGORIES
  unit: text('unit').notNull().default('pcs'),
  salePrice: integer('sale_price').notNull().default(0), // paise
  purchasePrice: integer('purchase_price').notNull().default(0), // paise
  taxRate: integer('tax_rate').notNull().default(0), // basis points
  openingStock: integer('opening_stock').notNull().default(0), // thousandths
  currentStock: integer('current_stock').notNull().default(0), // thousandths
  voiceAlias: text('voice_alias'), // Tamil/spoken name(s), comma-separated — voice matching
  // Photo of the product, shown on the Quick Bill tiles so the counter can be
  // worked by picture alone. A file:// uri inside the app's document dir (see
  // modules/items/images.ts) — copied there on pick, so it survives cache wipes.
  imageUri: text('image_uri'),
  createdAt: createdAt(),
});

export const invoices = sqliteTable('invoices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['sale', 'purchase', 'quotation', 'challan'] }).notNull(),
  invoiceNo: text('invoice_no').notNull(), // generated per financial year, not user-editable
  partyId: integer('party_id')
    .notNull()
    .references(() => parties.id),
  date: text('date').notNull(), // ISO 'YYYY-MM-DD'
  subtotal: integer('subtotal').notNull().default(0), // paise (pre-tax)
  taxTotal: integer('tax_total').notNull().default(0), // paise
  discount: integer('discount').notNull().default(0), // paise
  grandTotal: integer('grand_total').notNull().default(0), // paise
  paymentStatus: text('payment_status', { enum: ['unpaid', 'partial', 'paid'] })
    .notNull()
    .default('unpaid'),
  // Whether the line rates on this invoice already contained GST (see utils/gst
  // TaxMode). Stored per invoice so a reprint shows the same numbers forever;
  // `subtotal`/`tax_total` are ALWAYS the split-out taxable value + tax either way.
  taxMode: text('tax_mode', { enum: ['exclusive', 'inclusive'] })
    .notNull()
    .default('exclusive'),
  createdAt: createdAt(),
});

export const invoiceItems = sqliteTable('invoice_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  invoiceId: integer('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  itemId: integer('item_id')
    .notNull()
    .references(() => items.id),
  qty: integer('qty').notNull(), // thousandths
  rate: integer('rate').notNull(), // paise per unit
  taxRate: integer('tax_rate').notNull().default(0), // basis points
  amount: integer('amount').notNull(), // paise (pre-tax line total = qty * rate)
});

export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  partyId: integer('party_id')
    .notNull()
    .references(() => parties.id),
  invoiceId: integer('invoice_id').references(() => invoices.id), // null = on-account payment
  amount: integer('amount').notNull(), // paise
  mode: text('mode', { enum: ['cash', 'upi', 'card', 'bank'] }).notNull().default('cash'),
  // 'in' = money received, 'out' = money paid. NULL on rows written before this
  // column existed — those fall back to the party type (customer=in, supplier=out).
  // An explicit value is what makes a refund to a customer possible.
  direction: text('direction', { enum: ['in', 'out'] }),
  date: text('date').notNull(), // ISO 'YYYY-MM-DD'
  notes: text('notes'),
  createdAt: createdAt(),
});

export const expenses = sqliteTable('expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(),
  amount: integer('amount').notNull(), // paise
  taxRate: integer('tax_rate').notNull().default(0), // basis points
  date: text('date').notNull(), // ISO 'YYYY-MM-DD'
  notes: text('notes'),
  createdAt: createdAt(),
});

export const bankAccounts = sqliteTable('bank_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type', { enum: ['cash', 'bank'] }).notNull().default('bank'),
  openingBalance: integer('opening_balance').notNull().default(0), // paise
  createdAt: createdAt(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
});

// ── Inferred row types (use these across services & screens) ─────────────────
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
