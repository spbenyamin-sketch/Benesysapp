// App-wide voice command context.
//
// One microphone, one parser, one place that knows how to navigate — every
// screen just registers a handler for the intents it cares about and gets the
// global commands (go to X, back, help) for free. Screens are stacked, so the
// focused screen always wins and a blurred screen can never steal a command.

import { useFocusEffect, useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getVoiceLang, getVoiceSpeak, setVoiceLang, setVoiceSpeak } from '@/modules/settings/service';
import { parseTranscript } from './parser';
import { openedScreen, t } from './phrases';
import {
  abortListening,
  isVoiceAvailable,
  requestVoicePermission,
  speak,
  startListening,
  stopListening,
  stopSpeaking,
  UNAVAILABLE_MESSAGE,
} from './recognizer';
import type { NavTarget, VoiceHandler, VoiceIntent, VoiceLang, VoiceStatus } from './types';

interface Registration {
  handler: VoiceHandler;
  hints?: string[];
}

interface VoiceContextValue {
  status: VoiceStatus;
  lang: VoiceLang;
  speakBack: boolean;
  helpOpen: boolean;
  changeLang: (lang: VoiceLang) => void;
  changeSpeakBack: (on: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  toggleListening: () => void;
  /** Show (and optionally speak) a line of feedback under the mic. */
  say: (message: string) => void;
  register: (reg: Registration) => void;
  unregister: (reg: Registration) => void;
}

const VoiceCtx = createContext<VoiceContextValue | null>(null);

/** Where each navigation target lives. Kept beside the parser's NavTarget union. */
const NAV_ROUTES: Record<NavTarget, { href: any; label: string; labelTa: string }> = {
  dashboard: { href: '/dashboard', label: 'Dashboard', labelTa: 'முகப்பு' },
  quickbill: { href: '/quickbill', label: 'Quick Bill', labelTa: 'பில் பக்கம்' },
  parties: { href: '/parties', label: 'Parties', labelTa: 'வாடிக்கையாளர்' },
  items: { href: '/items', label: 'Items', labelTa: 'பொருட்கள்' },
  reports: { href: '/reports', label: 'Reports', labelTa: 'அறிக்கை' },
  settings: { href: '/settings', label: 'Settings', labelTa: 'அமைப்புகள்' },
  newSale: { href: { pathname: '/invoice/new', params: { type: 'sale' } }, label: 'New sale', labelTa: 'புது விற்பனை' },
  newPurchase: { href: { pathname: '/invoice/new', params: { type: 'purchase' } }, label: 'New purchase', labelTa: 'புது கொள்முதல்' },
  newQuotation: { href: { pathname: '/invoice/new', params: { type: 'quotation' } }, label: 'New quotation', labelTa: 'மதிப்பீடு' },
  newChallan: { href: { pathname: '/invoice/new', params: { type: 'challan' } }, label: 'New challan', labelTa: 'சலான்' },
  newParty: { href: '/party/new', label: 'New party', labelTa: 'புது வாடிக்கையாளர்' },
  newItem: { href: '/item/new', label: 'New item', labelTa: 'புது பொருள்' },
  newPayment: { href: '/payment/new', label: 'New payment', labelTa: 'பணம் பெறுதல்' },
  reportSales: { href: '/report/sales', label: 'Sales report', labelTa: 'விற்பனை அறிக்கை' },
  reportOutstanding: { href: '/report/outstanding', label: 'Outstanding', labelTa: 'நிலுவை' },
  reportStock: { href: '/report/stock', label: 'Stock report', labelTa: 'ஸ்டாக் அறிக்கை' },
  reportGst: { href: '/report/gst', label: 'GST report', labelTa: 'ஜிஎஸ்டி அறிக்கை' },
};

const IDLE: VoiceStatus = {
  available: isVoiceAvailable,
  listening: false,
  transcript: '',
  message: '',
  error: null,
};

export function VoiceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<VoiceStatus>(IDLE);
  const [lang, setLang] = useState<VoiceLang>('ta-IN');
  const [speakBack, setSpeakBack] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);

  const stack = useRef<Registration[]>([]);
  const disposeRef = useRef<(() => void) | null>(null);
  // Mirrors of state the native callbacks need — those closures are created once
  // and would otherwise capture stale values.
  const listeningRef = useRef(false);
  const langRef = useRef<VoiceLang>('ta-IN');
  const speakRef = useRef(true);

  useEffect(() => {
    let active = true;
    Promise.all([getVoiceLang(), getVoiceSpeak()]).then(([l, s]) => {
      if (!active) return;
      setLang(l);
      setSpeakBack(s);
      langRef.current = l;
      speakRef.current = s;
    });
    return () => {
      active = false;
    };
  }, []);

  const say = useCallback((message: string) => {
    setStatus((s) => ({ ...s, message }));
    if (speakRef.current) speak(message, langRef.current);
  }, []);

  const register = useCallback((reg: Registration) => {
    stack.current = [...stack.current.filter((r) => r !== reg), reg];
  }, []);

  const unregister = useCallback((reg: Registration) => {
    stack.current = stack.current.filter((r) => r !== reg);
  }, []);

  // ── Global fallback: anything the focused screen didn't consume ─────────────
  const handleGlobal = useCallback(
    (intent: VoiceIntent): string | null => {
      const l = langRef.current;
      switch (intent.kind) {
        case 'navigate': {
          const route = NAV_ROUTES[intent.target];
          router.push(route.href);
          return openedScreen(l === 'ta-IN' ? route.labelTa : route.label, l);
        }
        case 'back':
          if (router.canGoBack()) {
            router.back();
            return l === 'ta-IN' ? 'பின்னால போனாச்சு' : 'Went back';
          }
          router.push('/dashboard');
          return openedScreen(l === 'ta-IN' ? 'முகப்பு' : 'Dashboard', l);
        case 'help':
          setHelpOpen(true);
          return l === 'ta-IN' ? 'கமாண்ட் பட்டியல்' : 'Command list';
        case 'unknown':
          return t('notUnderstood', l);
        default:
          return t('notHere', l);
      }
    },
    [router],
  );

  const dispatch = useCallback(
    (transcript: string) => {
      const intents = parseTranscript(transcript);
      let lastMessage = '';
      for (const intent of intents) {
        // Newest registration first: a screen may register several handlers
        // (e.g. the screen itself plus an embedded export button), and only
        // FOCUSED screens are in the stack at all.
        let result: boolean | string | void = undefined;
        for (let i = stack.current.length - 1; i >= 0 && !result; i--) {
          try {
            result = stack.current[i].handler(intent);
          } catch (e) {
            result = (e as Error)?.message ?? 'Error';
          }
        }
        if (typeof result === 'string') lastMessage = result;
        else if (result !== true) {
          const globalMsg = handleGlobal(intent);
          if (globalMsg) lastMessage = globalMsg;
        }
      }
      if (lastMessage) say(lastMessage);
    },
    [handleGlobal, say],
  );

  const stop = useCallback(() => {
    listeningRef.current = false;
    stopListening();
    disposeRef.current?.();
    disposeRef.current = null;
    setStatus((s) => ({ ...s, listening: false, transcript: '' }));
  }, []);

  const start = useCallback(async () => {
    if (!isVoiceAvailable) {
      setStatus((s) => ({ ...s, error: UNAVAILABLE_MESSAGE, message: UNAVAILABLE_MESSAGE }));
      return;
    }
    const granted = await requestVoicePermission();
    if (!granted) {
      const msg =
        langRef.current === 'ta-IN'
          ? 'மைக் அனுமதி தேவை — Settings-ல கொடுங்க'
          : 'Microphone permission is required';
      setStatus((s) => ({ ...s, error: msg, message: msg }));
      return;
    }

    stopSpeaking(); // don't let our own confirmation feed back into the mic
    listeningRef.current = true;
    setStatus((s) => ({ ...s, listening: true, transcript: '', message: '', error: null }));

    const hints = [...new Set(stack.current.flatMap((r) => r.hints ?? []))];
    disposeRef.current = startListening(
      { lang: langRef.current, continuous: true, contextualStrings: hints },
      {
        onPartial: (text) => setStatus((s) => ({ ...s, transcript: text })),
        onFinal: (text) => {
          setStatus((s) => ({ ...s, transcript: text }));
          dispatch(text);
        },
        onError: (code, message) => {
          // "no-match"/"speech-timeout" just mean a quiet moment — keep the mic open.
          if (code === 'no-speech' || code === 'no-match' || code === 'speech-timeout') return;
          listeningRef.current = false;
          setStatus((s) => ({ ...s, listening: false, error: message, message }));
        },
        onEnd: () => {
          if (!listeningRef.current) setStatus((s) => ({ ...s, listening: false }));
        },
      },
    );
  }, [dispatch]);

  const toggleListening = useCallback(() => {
    if (listeningRef.current) stop();
    else void start();
  }, [start, stop]);

  const changeLang = useCallback(
    (next: VoiceLang) => {
      const wasListening = listeningRef.current;
      if (wasListening) stop();
      setLang(next);
      langRef.current = next;
      void setVoiceLang(next);
      if (wasListening) void start();
    },
    [start, stop],
  );

  const changeSpeakBack = useCallback((on: boolean) => {
    setSpeakBack(on);
    speakRef.current = on;
    if (!on) stopSpeaking();
    void setVoiceSpeak(on);
  }, []);

  // Never leave the microphone hot if the app tears down.
  useEffect(
    () => () => {
      listeningRef.current = false;
      abortListening();
      disposeRef.current?.();
    },
    [],
  );

  const value = useMemo<VoiceContextValue>(
    () => ({
      status,
      lang,
      speakBack,
      helpOpen,
      changeLang,
      changeSpeakBack,
      setHelpOpen,
      toggleListening,
      say,
      register,
      unregister,
    }),
    [status, lang, speakBack, helpOpen, changeLang, changeSpeakBack, toggleListening, say, register, unregister],
  );

  return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceCtx);
  if (!ctx) throw new Error('useVoice must be used inside <VoiceProvider>');
  return ctx;
}

/**
 * Register this screen's voice commands for as long as it is focused.
 *
 * @param handler  return `true` (or a confirmation string) when the intent was
 *                 consumed; anything else falls through to the global commands.
 * @param hints    item/party names to feed the recogniser for better accuracy.
 */
export function useVoiceCommands(handler: VoiceHandler, hints?: string[]): void {
  const ctx = useContext(VoiceCtx);
  const reg = useRef<Registration>({ handler });

  // Keep the registered entry pointing at the latest closure without changing
  // its identity (the identity is what register/unregister track).
  useEffect(() => {
    reg.current.handler = handler;
    reg.current.hints = hints;
  });

  useFocusEffect(
    useCallback(() => {
      const entry = reg.current;
      ctx?.register(entry);
      return () => ctx?.unregister(entry);
    }, [ctx]),
  );
}

/** Convenience for screens that only need to push feedback (no commands). */
export function useVoiceSay(): (message: string) => void {
  const ctx = useContext(VoiceCtx);
  return ctx?.say ?? (() => {});
}
