import type { ReactNode } from 'react';

// Offline mode has one person, who may open everything. The web build turns a
// typed-in address away here instead (ScreenGuard.web.tsx).
export default function ScreenGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
