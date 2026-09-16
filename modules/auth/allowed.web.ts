import { useEffect, useState } from 'react';
import { getSession, onSessionChange } from '@/web/session';
import { allowedScreens, SCREENS, type Screen } from './screens';

// Online mode: the tabs this account was given. Signed out (the gate is showing)
// nothing is mounted that could ask, so all of them is the harmless answer.

function current(): Screen[] {
  const session = getSession();
  return session ? allowedScreens(session.user) : [...SCREENS];
}

export function useAllowedScreens(): Screen[] {
  const [screens, setScreens] = useState(current);
  // Signing in or out, and the refresh checkSession does on every page load.
  useEffect(() => onSessionChange(() => setScreens(current())), []);
  return screens;
}
