import { SCREENS, type Screen } from './screens';

// Offline mode is one person on one phone — every screen is theirs. The web
// build answers this from the signed-in account instead (allowed.web.ts).

const ALL: Screen[] = [...SCREENS];

export function useAllowedScreens(): Screen[] {
  return ALL;
}
