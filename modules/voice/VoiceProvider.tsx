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
import { isFailureMessage, openedScreen, t } from './phrases';
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
  // The two voice settings that must work from ANY screen. They live on the
  // provider, so the global handler reaches them through a ref (the setters are
  // declared further down and would otherwise be a circular dependency).
  const settingsRef = useRef({
    setLang: (_l: VoiceLang) => {},
    setSpeak: (_on: boolean) => {},
  });
  // Mirrors of state the native callbacks need — those closures are created once
  // and would otherwise capture stale values.
  const listeningRef = useRef(false);
  const langRef = useRef<VoiceLang>('ta-IN');
  const speakRef = useRef(true);
  // The phone's own voice is loud enough to be recognised as a command
  // ("சேர்த்தாச்சு" → an item search). Everything heard while we are talking,
  // plus a short tail, is thrown away.
  const speakingUntilRef = useRef(0);
  // Android returns the same final result twice on some devices; and a restart
  // can replay the last utterance. Identical text inside this window is ignored.
  const lastFinalRef = useRef({ text: '', at: 0 });
  // Restart bookkeeping — see restartSoon().
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartsRef = useRef<number[]>([]);
  const startRef = useRef<() => void>(() => {});

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
    if (!speakRef.current) return;
    // Deafen ourselves for as long as we are talking (+400ms of echo tail).
    // Without this the mic hears the confirmation and tries to obey it.
    speakingUntilRef.current = Date.now() + 8000; // generous ceiling; onDone shortens it
    speak(message, langRef.current, () => {
      speakingUntilRef.current = Date.now() + 400;
    });
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
        case 'action':
          // Voice language / speak-back work everywhere; every other action
          // belongs to a screen and only reaches here when that screen has no
          // such button.
          switch (intent.action) {
            case 'langTamil':
              settingsRef.current.setLang('ta-IN');
              return 'தமிழ்';
            case 'langEnglish':
              settingsRef.current.setLang('en-IN');
              return 'English';
            case 'speakOn':
              settingsRef.current.setSpeak(true);
              return l === 'ta-IN' ? 'பதில் சொல்லும்' : 'Speaking replies';
            case 'speakOff':
              settingsRef.current.setSpeak(false);
              return l === 'ta-IN' ? 'அமைதியா இருக்கும்' : 'Silent replies';
            default:
              return t('notHere', l);
          }
        case 'unknown':
          return t('notUnderstood', l);
        default:
          return t('notHere', l);
      }
    },
    [router],
  );

  /** Run one candidate transcript through the handler stack. */
  const runTranscript = useCallback(
    (transcript: string): { message: string; ok: boolean } => {
      const intents = parseTranscript(transcript);
      let lastMessage = '';
      let ok = false;
      for (const intent of intents) {
        if (intent.kind === 'unknown') {
          lastMessage = t('notUnderstood', langRef.current);
          continue;
        }
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
        if (typeof result === 'string') {
          lastMessage = result;
          if (!isFailureMessage(result)) ok = true;
        } else if (result === true) {
          ok = true;
        } else {
          const globalMsg = handleGlobal(intent);
          if (globalMsg) {
            lastMessage = globalMsg;
            if (!isFailureMessage(globalMsg)) ok = true;
          }
        }
      }
      return { message: lastMessage, ok };
    },
    [handleGlobal],
  );

  /**
   * One utterance → commands. The recogniser's best guess is tried first; if it
   * matched nothing (no such item, didn't understand), its other guesses for the
   * same audio are tried in order. "ஒரு டீ" often comes back as "ஒரு தீ" first
   * and correctly second — that used to be a dead command.
   */
  const dispatch = useCallback(
    (transcript: string, alternatives: string[] = []) => {
      let { message, ok } = runTranscript(transcript);
      if (!ok) {
        for (const alt of alternatives) {
          if (!alt || alt === transcript) continue;
          const retry = runTranscript(alt);
          if (retry.ok) {
            message = retry.message;
            setStatus((s) => ({ ...s, transcript: alt }));
            break;
          }
        }
      }
      if (message) say(message);
    },
    [runTranscript, say],
  );

  const stop = useCallback(() => {
    listeningRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    restartsRef.current = [];
    stopListening();
    disposeRef.current?.();
    disposeRef.current = null;
    setStatus((s) => ({ ...s, listening: false, transcript: '' }));
  }, []);

  /**
   * Android's recogniser closes the session after every final result (and after
   * a silence timeout) even with `continuous: true`. Without this the mic button
   * still LOOKED on while nothing was being heard — the single biggest cause of
   * "voice stopped working after one command". Restarts are rate-limited so a
   * recogniser that keeps dying instantly can't spin.
   */
  const restartSoon = useCallback((delay = 350) => {
    if (!listeningRef.current || restartTimerRef.current) return;
    const now = Date.now();
    restartsRef.current = [...restartsRef.current.filter((at) => now - at < 10_000), now];
    if (restartsRef.current.length > 8) {
      listeningRef.current = false;
      restartsRef.current = [];
      setStatus((s) => ({ ...s, listening: false }));
      return;
    }
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (listeningRef.current) startRef.current();
    }, delay);
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

    listeningRef.current = true;
    setStatus((s) => ({ ...s, listening: true, transcript: '', message: '', error: null }));

    // Previous session's listeners must go before a new one is opened, or a
    // restart would stack a second set of handlers on the same events.
    disposeRef.current?.();
    disposeRef.current = null;

    const hints = [...new Set(stack.current.flatMap((r) => r.hints ?? []))];
    disposeRef.current = startListening(
      { lang: langRef.current, continuous: true, contextualStrings: hints },
      {
        onPartial: (text) => {
          if (Date.now() < speakingUntilRef.current) return; // that's us talking
          setStatus((s) => ({ ...s, transcript: text }));
        },
        onFinal: (text, alternatives) => {
          if (Date.now() < speakingUntilRef.current) return;
          const now = Date.now();
          const last = lastFinalRef.current;
          if (last.text === text && now - last.at < 2500) return; // duplicate result
          lastFinalRef.current = { text, at: now };
          setStatus((s) => ({ ...s, transcript: text }));
          dispatch(text, alternatives);
        },
        onError: (code, message) => {
          // A quiet moment, or a busy recogniser — recoverable, so keep the mic
          // conceptually on and let onEnd bring the session back.
          if (
            code === 'no-speech' ||
            code === 'no-match' ||
            code === 'speech-timeout' ||
            code === 'busy' ||
            code === 'aborted'
          ) {
            return;
          }
          listeningRef.current = false;
          setStatus((s) => ({ ...s, listening: false, error: message, message }));
        },
        onEnd: () => {
          // Still meant to be listening? The recogniser closed on its own —
          // reopen it (see restartSoon).
          if (listeningRef.current) restartSoon();
          else setStatus((s) => ({ ...s, listening: false }));
        },
      },
    );
  }, [dispatch, restartSoon]);

  // restartSoon() reaches `start` through this ref (they refer to each other).
  useEffect(() => {
    startRef.current = () => void start();
  }, [start]);

  const toggleListening = useCallback(() => {
    if (listeningRef.current) {
      stop();
      return;
    }
    // Only a deliberate tap cuts off talk-back; an automatic restart must not
    // truncate the confirmation it is speaking.
    stopSpeaking();
    speakingUntilRef.current = 0;
    void start();
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

  // Hand the global handler the latest setters (see settingsRef above).
  useEffect(() => {
    settingsRef.current = { setLang: changeLang, setSpeak: changeSpeakBack };
  }, [changeLang, changeSpeakBack]);

  // Never leave the microphone hot if the app tears down.
  useEffect(
    () => () => {
      listeningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
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
