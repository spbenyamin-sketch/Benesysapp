// Phone: the language is a row in the shop's own settings table (the phone IS
// the shop, so one device-wide choice is right).
import { getSetting, setSetting } from '@/modules/settings/service';
import type { AppLang } from './index';

const KEY = 'app_lang';

export async function loadLang(): Promise<AppLang> {
  return (await getSetting(KEY)) === 'ta' ? 'ta' : 'en';
}

export async function saveLang(lang: AppLang): Promise<void> {
  await setSetting(KEY, lang);
}
