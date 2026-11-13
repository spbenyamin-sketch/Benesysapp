// Web (Online mode): each browser keeps its own choice, so a staff member can
// read Tamil while the owner's PC stays English — and staff can change it even
// though shop settings are owner-only on the server.
import type { AppLang } from './index';

const KEY = 'benesys.lang';

export async function loadLang(): Promise<AppLang> {
  try {
    return globalThis.localStorage?.getItem(KEY) === 'ta' ? 'ta' : 'en';
  } catch {
    return 'en';
  }
}

export async function saveLang(lang: AppLang): Promise<void> {
  try {
    globalThis.localStorage?.setItem(KEY, lang);
  } catch {
    // Private window: the choice lasts until the page is reloaded.
  }
}
