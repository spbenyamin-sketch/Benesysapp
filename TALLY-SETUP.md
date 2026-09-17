# Tally export — for the shop and its accountant

The app can hand your accountant one file that goes straight into Tally. No
re-typing, no Excel in between.

**Reports → Tally Export** → pick the dates → **Export Tally XML**. On a phone it
opens the share sheet (WhatsApp it to the accountant); in the browser it
downloads.

`tally-sample.xml` next to this file is one real export — a bill with a discount
and a round-off, a part payment against it, and an electricity bill — so the
accountant can see the shape before the shop sends its first month.

---

## What the accountant does

1. Open Tally and load the company.
2. **Gateway of Tally → Import → Vouchers** (Tally Prime).
   On Tally ERP 9: **Gateway of Tally → Import of Data → Vouchers**.
3. Choose the `.xml` file the shop sent.

The ledgers the file needs — each party, the sales and purchase accounts, the
GST duty ledgers, the expense heads, the cash and bank accounts — are created on
the way in. Nothing has to be typed first.

**Import a period once.** Importing the same month twice may create the vouchers
twice; check on a copy of the company first (below).

---

## Before the first import — five minutes, once

Do this on a **copy** of the company, not the live books.

- **F11 → Accounting Features → Use debit and credit notes: Yes.** Without it,
  sale and purchase returns are refused.
- **Bill-wise details: Yes**, on the company and on the party ledgers. This is
  what lets a receipt knock the right bill off a customer's outstanding.
- **Voucher numbering.** If Sales and Purchase are set to *Automatic*, Tally
  renumbers what it imports and the shop's own bill numbers disappear from the
  voucher number. Set those voucher types to **Manual** or *Automatic (Manual
  Override)* to keep them. (The shop's number is also written into the
  reference field either way.)
- **Ledger names.** Tally matches by the exact name. The file writes:

  | What | Name it uses |
  |---|---|
  | Sales, per GST rate | `Sales @ 18%`, `Sales @ 5%`, … under *Sales Accounts* |
  | Purchases, per rate | `Purchase @ 18%`, … under *Purchase Accounts* |
  | GST on sales | `Output CGST`, `Output SGST`, `Output IGST` under *Duties & Taxes* |
  | GST on purchases and expenses | `Input CGST`, `Input SGST`, `Input IGST` |
  | Bill discount | `Discount Allowed` / `Discount Received` |
  | Rounding | `Round Off` |
  | Overheads | the expense category itself — `Rent`, `Electricity`, … under *Indirect Expenses* |
  | Cash and bank | the account's own name, or `Cash` / `Bank` when the shop did not record one |
  | Parties | the party's name, under *Sundry Debtors* or *Sundry Creditors* |

  If the company already uses different names, the import makes second ledgers
  alongside them. Tell the shop what names you use before the first import.

---

## What is in the file, and what is not

**In:** sales, purchases, credit notes, debit notes, receipts, payments and
expenses — the ones the shop marked as *in the books*.

**Not in:**

- Anything the shop marked **“not in books”** (see below).
- **Quotations and delivery challans.** Neither is an accounting entry, and a
  challan becomes a bill when the shop converts it.
- **Opening balances**, for either parties or the company. Yours stay as they are.
- **Stock.** The vouchers are accounting entries: the bill total goes to a sales
  ledger and the GST to its duty ledgers. Item names, quantities and HSN codes
  are not sent, so nothing has to match an item master in your company.
- Cess, reverse charge, TDS/TCS, e-invoice IRN and e-way bill numbers — the app
  does not record them.
- **The supplier's own bill number on a purchase.** The app numbers purchases
  itself, so GSTR-2B matching in Tally will not find the supplier's number.

Every voucher balances to the paise, including bills with a discount or a
round-off: the bill discount is taken after tax, so it posts to `Discount
Allowed` rather than being spread across the GST slabs.

---

## “In books” and “not in books”

Every bill, payment and expense in the app carries one switch, on the form:

> **Books:** [ In books ] [ Not in books ]

**In books** is the default, and everything recorded before this existed counts
as in the books. A row marked otherwise:

- still appears in the shop's own reports, with the Sale and Purchase reports
  showing one extra line naming how much of the total is not in the books;
- is **left out of the Tally file**;
- is **left out of the GST Summary and the GSTR-1 file**, because a return is
  filed on the books the shop keeps. The GST screen says how many documents that
  leaves out and what they are worth.

---

## If something goes wrong

| What Tally says | What it usually means |
|---|---|
| "Debit and credit notes not enabled" | F11 → accounting features, above |
| Vouchers imported but ledgers missing | Re-export with **Create the ledgers…** ticked |
| Party balances look doubled | The period was imported twice — restore the copy and import once |
| Ledgers created with unfamiliar names | The names above do not match this company's; rename them in Tally or tell the shop |
| Nothing imports, no error | The file covered a range with nothing marked *in books* — the export screen shows the count before you send it |

Tally writes an import log (`Tally.imp` in the Tally folder) — it names the
voucher it stopped on, which is the fastest way to find the one bill at fault.
