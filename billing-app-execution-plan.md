# Simple Billing & Accounts App — Full Execution Plan
### (Vyapar-style, offline-first mobile app, local storage + Gmail backup)

This document is written to be handed directly to Claude Code as a build brief.
Build in the exact phase order below — each phase produces a working, testable
app before the next one starts. Do not skip ahead.

---

## 1. Tech Stack (final decision)

| Layer | Choice | Why |
|---|---|---|
| Framework | **React Native + Expo** | JS-based, fastest path to Android + iOS from one codebase |
| Local Database | **expo-sqlite** (SQLite) | Real relational DB, handles invoices/ledgers correctly, works fully offline |
| ORM/Query helper | **Drizzle ORM** (SQLite driver) | Type-safe schema, migrations, avoids raw SQL bugs |
| Navigation | **React Navigation** (stack + bottom tabs) | Industry standard for RN |
| State management | **Zustand** | Lightweight, avoids Redux boilerplate |
| PDF generation | **expo-print** | Generates invoice PDFs on-device |
| Sharing | **expo-sharing** + native Share sheet | Send PDF via WhatsApp/Gmail/etc. |
| Backup transport | **Gmail via expo-mail-composer** (Phase 1) → **Gmail API OAuth** (Phase 2, optional upgrade) | Mail composer needs zero OAuth setup and covers 90% of the need |
| Date/number standards | **ISO 8601** dates internally (`YYYY-MM-DD`), display formatted per locale; **ISO 4217** currency codes (INR default) | International-standard data handling, avoids ambiguous date bugs |
| Testing | **Jest** + **React Native Testing Library** | Catch regressions as modules are added |

**Backup design decision:** Don't build Gmail API OAuth first — it's a common source of setup errors (client IDs, consent screens, token refresh). Start with `expo-mail-composer`, which opens the device's Gmail/mail app with the backup file pre-attached, and you tap send. This is "no error" by construction because there's no API auth to misconfigure. Upgrade to full Gmail API + auto-scheduled backup only after the core app is stable, as a Phase 7 optional module.

---

## 2. Folder Structure

```
billing-app/
├── app/                      # Expo Router screens
│   ├── (tabs)/
│   │   ├── dashboard.tsx
│   │   ├── parties.tsx
│   │   ├── items.tsx
│   │   ├── reports.tsx
│   │   └── settings.tsx
│   ├── sale/
│   │   ├── new.tsx
│   │   └── [id].tsx
│   ├── purchase/
│   ├── party/[id].tsx        # party ledger detail
│   └── item/[id].tsx
├── db/
│   ├── schema.ts             # Drizzle schema (single source of truth)
│   ├── migrations/
│   └── client.ts             # DB connection singleton
├── modules/
│   ├── parties/
│   ├── items/
│   ├── invoices/
│   ├── payments/
│   ├── reports/
│   └── backup/
├── components/                # shared UI (Button, Input, InvoiceRow, etc.)
├── store/                     # Zustand stores
├── utils/
│   ├── gst.ts                 # tax calculation logic
│   ├── invoiceNumber.ts
│   └── dateFormat.ts
└── assets/
```

Keep one module = one folder with its own `service.ts` (DB queries), `types.ts`, and screen components. This avoids the tangled-file problem that causes most "AI-generated app" bugs.

---

## 3. Database Schema (build this first — everything depends on it)

```
parties        id, name, phone, gstin, address, type(customer/supplier), opening_balance, created_at
items          id, name, unit, sale_price, purchase_price, tax_rate, opening_stock, current_stock, created_at
invoices       id, type(sale/purchase/quotation/challan), invoice_no, party_id, date, subtotal, tax_total, discount, grand_total, payment_status, created_at
invoice_items  id, invoice_id, item_id, qty, rate, tax_rate, amount
payments       id, party_id, invoice_id (nullable), amount, mode(cash/upi/card/bank), date, notes
expenses       id, category, amount, tax_rate, date, notes
bank_accounts  id, name, type(cash/bank), opening_balance
settings       key, value   (business profile, invoice prefix, backup frequency, etc.)
```

Rules to enforce at the schema level (this is what "international standard" actually means for accounting software):
- Every money field stored as **integer paise/cents**, never floating point (avoids rounding bugs — the #1 cause of billing-app errors).
- Every date stored as ISO 8601 string, converted to locale display only in UI layer.
- `invoice_no` generated server-side (i.e., app-side) with a per-financial-year counter, never user-editable after creation.
- Ledger balance is **always derived/computed** from transactions, never stored as a mutable running total — prevents drift/corruption bugs.

---

## 4. Build Phases (execute in this order)

### Phase 0 — Project Setup
- `npx create-expo-app billing-app`
- Install: expo-sqlite, drizzle-orm, react-navigation, zustand, expo-print, expo-sharing, expo-mail-composer
- Set up Drizzle config + migration runner
- Empty tab navigation shell (Dashboard/Parties/Items/Reports/Settings) — just navigable screens, no logic yet

### Phase 1 — Data Layer
- Write `db/schema.ts` for all tables above
- Write and run first migration
- Write basic CRUD service functions per table (create, list, update, delete)
- Test: insert dummy party/item via a temp debug screen, confirm it persists after app reload

### Phase 2 — Party Module
- Party list screen (search + add button)
- Add/Edit party form (name, phone, GSTIN, address, opening balance)
- Party ledger screen: list all invoices/payments for that party, running balance computed from transactions

### Phase 3 — Item Module
- Item list screen (search + add button)
- Add/Edit item form (name, unit, sale price, purchase price, tax rate, opening stock)
- Stock adjustment screen (manual correction entries)

### Phase 4 — Invoice Module (the core screen)
- New Sale Invoice screen: party picker, item picker with qty/rate/tax auto-fill, running total, payment mode, save
- Invoice detail/view screen
- Auto invoice numbering per financial year
- Stock auto-decrements on sale, auto-increments on purchase
- PDF generation (expo-print) from invoice detail
- Share sheet integration (send PDF via WhatsApp/Gmail/etc.)
- Repeat pattern for Purchase, Quotation, Delivery Challan (they reuse 90% of the Sale screen with a `type` flag)

### Phase 5 — Payments Module
- Record payment against a specific invoice or as a general on-account payment
- Update party ledger automatically (via computed balance, not stored counter)

### Phase 6 — Reports Module
- Sale Report (date range filter)
- Party Outstanding Report (who owes you, who you owe)
- Stock Summary Report
- GST Summary Report (sales tax collected, purchase tax paid — basic GSTR-1 style, not full filing)

### Phase 7 — Backup Module
- Export: serialize all tables to JSON, write to a file in app storage
- Send via `expo-mail-composer` with the JSON attached, pre-filled to the user's own Gmail address
- Restore: file picker → parse JSON → wipe and reload tables (with a confirmation warning, since this is destructive)
- (Optional later upgrade) Gmail API OAuth for fully automatic scheduled backups without manual send

### Phase 8 — Settings & Polish
- Business profile (name, GSTIN, logo, address) used on invoice PDFs
- Invoice number prefix/reset rules
- App icon, splash screen, final testing pass on a real Android device

---

## 5. "No Error" Checklist Before Each Phase Is Considered Done

- All money math done in integers (paise), verified with a test case that has a repeating-decimal tax rate (e.g. 18% GST) to check no rounding drift
- Every list screen tested with 0 items, 1 item, and 50+ items (empty state and scroll performance)
- App force-closed and reopened after each phase — confirm SQLite data survives
- Backup exported, app data wiped, backup restored — confirm data matches exactly

---

## 6. What to Tell Claude Code, Phase by Phase

Don't paste this whole document as one prompt. Feed it one phase at a time:
> "Using this schema and folder structure [paste Section 2 + 3], set up Phase 0: Expo project init and empty tab navigation."

Then once that's verified working, move to Phase 1, and so on. This keeps each Claude Code session scoped and reviewable, and is the single biggest thing that prevents compounding errors in AI-assisted builds.
