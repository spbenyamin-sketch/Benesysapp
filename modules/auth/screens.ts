// Which parts of the app a person may open. Online mode only: the owner ticks
// them per staff member (Settings → People) and they travel with the account,
// so the same person sees the same screens on any computer in the shop.
//
// Settings is deliberately not in the list — everyone needs it to sign out and
// change their own password. Owners always see everything.

export const SCREENS = ['dashboard', 'quickbill', 'parties', 'items', 'reports'] as const;

export type Screen = (typeof SCREENS)[number];

export const SCREEN_LABEL: Record<Screen, string> = {
  dashboard: 'Dashboard',
  quickbill: 'Quick Bill',
  parties: 'Parties',
  items: 'Items',
  reports: 'Reports',
};

/** What each screen is for, so the owner ticking the boxes knows what it opens. */
export const SCREEN_HINT: Record<Screen, string> = {
  dashboard: 'Today’s totals, dues and low stock',
  quickbill: 'Billing, invoices and payments',
  parties: 'Customers, suppliers and their ledgers',
  items: 'Stock list, prices and adjustments',
  reports: 'Sales, profit, GST and every other report',
};

export function isScreen(value: unknown): value is Screen {
  return typeof value === 'string' && (SCREENS as readonly string[]).includes(value);
}

/**
 * The screens a person actually gets. An owner gets all of them, always — the
 * shop must never end up with nobody who can reach its own books. `null` is a
 * staff member nobody has restricted yet, which is also everything.
 */
export function allowedScreens(user: {
  role: 'owner' | 'staff';
  screens?: Screen[] | null;
}): Screen[] {
  if (user.role === 'owner' || user.screens == null) return [...SCREENS];
  return user.screens.filter(isScreen);
}

/**
 * Which screen a path belongs to, for the guard that turns a typed-in URL away.
 * A path no screen owns (Settings, the not-found page) is open to everyone.
 * Longest prefix first: `/item/edit/3` is Items, `/invoice/5` is Quick Bill.
 */
const PATH_SCREEN: ReadonlyArray<[string, Screen]> = [
  ['/dashboard', 'dashboard'],
  ['/quickbill', 'quickbill'],
  ['/invoice', 'quickbill'],
  ['/payment', 'quickbill'],
  ['/parties', 'parties'],
  ['/party', 'parties'],
  ['/items', 'items'],
  ['/item', 'items'],
  ['/reports', 'reports'],
  ['/report', 'reports'],
  // Bank accounts and expenses are money the owner watches, not counter work.
  ['/account', 'reports'],
  ['/expense', 'reports'],
];

export function screenOfPath(pathname: string): Screen | null {
  const match = PATH_SCREEN.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match ? match[1] : null;
}
