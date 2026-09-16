import type { ReactNode } from 'react';

// The licence file is bound to a phone's hardware id, which a browser doesn't
// have. The web app is Online mode, where the licence will belong to the shop on
// the server instead — so there is nothing to check here yet.
export default function LicenseGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
