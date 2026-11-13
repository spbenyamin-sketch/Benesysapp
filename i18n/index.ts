// On-screen language. The English text IS the key: a screen writes
//   t('Save')                     -> 'சேமி' in Tamil, 'Save' in English
//   t('{n} bills', { n: 3 })       -> placeholders filled in either language
// A string with no Tamil entry yet simply shows in English, so a missed label
// is never a blank. Printed documents (invoice PDF, statements, Excel, Tally)
// stay English on purpose — they go to customers, accountants and GST.
//
// The language lives in module state, not in React context: I18nProvider keys
// the whole app on it, so a change remounts every screen and plain t() calls
// pick it up without each screen subscribing to anything.

import { TA } from './ta';

export type AppLang = 'en' | 'ta';

let current: AppLang = 'en';

export function getLang(): AppLang {
  return current;
}

/** Only I18nProvider should call this — it also remounts the tree. */
export function setLangInternal(lang: AppLang): void {
  current = lang;
}

export type Vars = Record<string, string | number>;

export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Translate an English UI string into the current language. */
export function t(english: string, vars?: Vars): string {
  const text = current === 'ta' ? (TA[english] ?? english) : english;
  return fill(text, vars);
}

export const APP_LANG_LABEL: Record<AppLang, string> = {
  en: 'English',
  ta: 'தமிழ்',
};
