// One file per area so translators working in parallel never edit the same file.
// A key that appears in two files must carry the same Tamil — a test checks it.
import { catalog } from './catalog';
import { common } from './common';
import { invoices } from './invoices';
import { money } from './money';
import { tabs } from './tabs';

export const TA_AREAS: Record<string, Record<string, string>> = { common, tabs, invoices, catalog, money };

export const TA: Record<string, string> = Object.assign({}, ...Object.values(TA_AREAS));
