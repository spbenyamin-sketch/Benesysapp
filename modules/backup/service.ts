import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { db } from '@/db/client';
import {
  bankAccounts,
  expenses,
  invoiceItems,
  invoices,
  items,
  parties,
  payments,
  settings,
} from '@/db/schema';

// Full-database JSON backup. All 8 tables are dumped verbatim (ids and
// timestamps preserved) so a restore reproduces the DB exactly, including the
// foreign-key graph. Bump BACKUP_VERSION if the shape ever changes.
const BACKUP_VERSION = 1;

interface BackupFile {
  app: 'billing-app';
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function buildBackup(nowIso: string): Promise<BackupFile> {
  const [p, it, inv, invIt, pay, exp, bank, set] = await Promise.all([
    db.select().from(parties),
    db.select().from(items),
    db.select().from(invoices),
    db.select().from(invoiceItems),
    db.select().from(payments),
    db.select().from(expenses),
    db.select().from(bankAccounts),
    db.select().from(settings),
  ]);
  return {
    app: 'billing-app',
    version: BACKUP_VERSION,
    exportedAt: nowIso,
    tables: {
      parties: p,
      items: it,
      invoices: inv,
      invoice_items: invIt,
      payments: pay,
      expenses: exp,
      bank_accounts: bank,
      settings: set,
    },
  };
}

/** The whole database as JSON text — what gets written to a file or uploaded. */
export async function backupJson(nowIso: string): Promise<string> {
  return JSON.stringify(await buildBackup(nowIso), null, 2);
}

/**
 * Write a copy to cache and hand it to the Android share sheet, so the user can
 * put it wherever they like — Drive, WhatsApp, a memory card, their own mail.
 * Returns the file uri that was shared.
 */
export async function shareBackupFile(nowIso: string): Promise<string> {
  const json = await backupJson(nowIso);
  const stamp = nowIso.replace(/[:.]/g, '-');
  const file = new File(Paths.cache, `billing-backup-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save or send your backup',
      UTI: 'public.json',
    });
  }
  return file.uri;
}

export interface RestoreCounts {
  parties: number;
  items: number;
  invoices: number;
  payments: number;
}

/**
 * DESTRUCTIVE. Wipe every table and reload from a backup file, atomically.
 * Rows are deleted children-first and re-inserted parents-first so foreign keys
 * (which are enforced — see db/client.ts) stay valid throughout.
 */
export async function restoreBackup(uri: string): Promise<RestoreCounts> {
  const file = new File(uri);
  return restoreBackupFromJson(await file.text());
}

/** Same restore, from JSON text already in hand (a Drive download, say). */
export function restoreBackupFromJson(text: string): RestoreCounts {
  const data = JSON.parse(text) as BackupFile;

  if (data?.app !== 'billing-app' || !data.tables) {
    throw new Error('This file is not a billing-app backup.');
  }

  const t = data.tables;
  const rows = (name: string): any[] => (Array.isArray(t[name]) ? (t[name] as any[]) : []);

  db.transaction((tx) => {
    // Delete children before parents.
    tx.delete(invoiceItems).run();
    tx.delete(payments).run();
    tx.delete(invoices).run();
    tx.delete(expenses).run();
    tx.delete(bankAccounts).run();
    tx.delete(settings).run();
    tx.delete(items).run();
    tx.delete(parties).run();

    // Re-insert parents before children.
    const insertAll = (table: any, data: any[]) => {
      if (data.length) tx.insert(table).values(data).run();
    };
    insertAll(parties, rows('parties'));
    insertAll(items, rows('items'));
    insertAll(invoices, rows('invoices'));
    insertAll(invoiceItems, rows('invoice_items'));
    insertAll(payments, rows('payments'));
    insertAll(expenses, rows('expenses'));
    insertAll(bankAccounts, rows('bank_accounts'));
    insertAll(settings, rows('settings'));
  });

  return {
    parties: rows('parties').length,
    items: rows('items').length,
    invoices: rows('invoices').length,
    payments: rows('payments').length,
  };
}
