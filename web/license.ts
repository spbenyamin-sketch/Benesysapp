// Online mode's licence, as seen from the browser. The state itself lives on the
// server (server/src/auth/license.ts) — nothing here decides anything, it only
// asks and shows, which is why clearing the site data buys nobody an extra day.

import type { LicenseStatus } from '@/modules/license/status';
import { api } from '@/web/api';

export type { LicenseStatus };

/** Where this server stands, and the Server ID to send the vendor. Signed in only. */
export function getLicenseStatus(): Promise<LicenseStatus> {
  return api<LicenseStatus>('/api/license', { method: 'GET' });
}

/** Install the `.lic` the vendor sent. Owners only — the server enforces it. */
export function installLicense(license: string): Promise<LicenseStatus> {
  return api<LicenseStatus>('/api/license', { body: { license } });
}
