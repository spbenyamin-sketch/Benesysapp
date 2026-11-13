import { createContext, Fragment, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { setLangInternal, type AppLang } from './index';
import { loadLang, saveLang } from './store';

const LangContext = createContext<{ lang: AppLang; setLang: (l: AppLang) => void }>({
  lang: 'en',
  setLang: () => {},
});

/** Current language + a setter that saves it and redraws the app. */
export function useAppLang() {
  return useContext(LangContext);
}

/**
 * Loads the saved language before drawing anything, so even the licence and
 * login screens come up in it. Renders nothing for the instant that takes.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLang | null>(null);

  useEffect(() => {
    let alive = true;
    loadLang()
      .catch((): AppLang => 'en')
      .then((l) => {
        if (!alive) return;
        setLangInternal(l);
        setLangState(l);
      });
    return () => {
      alive = false;
    };
  }, []);

  const setLang = useCallback((l: AppLang) => {
    setLangInternal(l);
    setLangState(l);
    saveLang(l).catch(() => {});
  }, []);

  if (lang == null) return null;
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

/**
 * Remounts what it wraps when the language changes, so plain t() calls in every
 * screen re-read it. It sits INSIDE AuthGate in app/_layout.tsx: remounting the
 * gate itself would throw the user back to the login screen.
 */
export function LangRemount({ children }: { children: ReactNode }) {
  const { lang } = useAppLang();
  return <Fragment key={lang}>{children}</Fragment>;
}
