// Thin wrapper around the native speech modules.
//
// IMPORTANT: `expo-speech-recognition` is NOT bundled in Expo Go — it needs a
// development build. So it is loaded with a guarded `require` instead of a
// static import: in Expo Go the require throws, we catch it, and the whole app
// keeps working with `available === false` (the mic button just explains why).
// Everything below is plain functions — no React — so it can be reused from
// anywhere and unit-tested by faking the module.

import type { ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';
import type { VoiceLang } from './types';

type Sub = { remove(): void };

interface SpeechModule {
  start(options: ExpoSpeechRecognitionOptions): void;
  stop(): void;
  abort(): void;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  getStateAsync(): Promise<'inactive' | 'starting' | 'recognizing' | 'stopping'>;
  supportsOnDeviceRecognition(): boolean;
  getSupportedLocales(options: {
    androidRecognitionServicePackage?: string;
  }): Promise<{ locales: string[]; installedLocales: string[] }>;
  addListener(event: string, listener: (ev: any) => void): Sub;
}

function loadSpeech(): SpeechModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech-recognition');
    return (mod?.ExpoSpeechRecognitionModule as SpeechModule) ?? null;
  } catch {
    return null; // Expo Go, or the native module isn't linked yet
  }
}

function loadTts(): { speak(text: string, opts?: any): void; stop(): void } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-speech');
  } catch {
    return null;
  }
}

const Speech = loadSpeech();
const Tts = loadTts();

/** False in Expo Go — voice needs the development build (see VOICE-SETUP.md). */
export const isVoiceAvailable = Speech !== null;

export const UNAVAILABLE_MESSAGE =
  'Voice needs the development build (Expo Go has no microphone access). See VOICE-SETUP.md.';

export async function requestVoicePermission(): Promise<boolean> {
  if (!Speech) return false;
  try {
    const res = await Speech.requestPermissionsAsync();
    return !!res?.granted;
  } catch {
    return false;
  }
}

/** True when the chosen language can run fully offline on this device. */
export async function supportsOffline(lang: VoiceLang): Promise<boolean> {
  if (!Speech) return false;
  try {
    if (!Speech.supportsOnDeviceRecognition()) return false;
    const { installedLocales } = await Speech.getSupportedLocales({});
    return installedLocales.some((l) => l.replace('_', '-').toLowerCase() === lang.toLowerCase());
  } catch {
    return false;
  }
}

export interface ListenHandlers {
  onStart?: () => void;
  /** Live text while the user is still speaking. */
  onPartial?: (text: string) => void;
  /** A completed utterance — this is what gets parsed into commands. */
  onFinal?: (text: string) => void;
  onError?: (code: string, message: string) => void;
  onEnd?: () => void;
}

export interface ListenOptions {
  lang: VoiceLang;
  /** Keep the mic open for command-after-command dictation (POS billing). */
  continuous?: boolean;
  /** Item/party names fed to the recogniser as hints — big accuracy win. */
  contextualStrings?: string[];
  /** Prefer on-device recognition (works with no internet). */
  offline?: boolean;
}

/**
 * Start listening. Returns a disposer that removes the listeners AND stops the
 * recogniser, so a screen unmounting can never leave a hot mic behind.
 */
export function startListening(opts: ListenOptions, handlers: ListenHandlers): () => void {
  if (!Speech) {
    handlers.onError?.('not-available', UNAVAILABLE_MESSAGE);
    return () => {};
  }

  const subs: Sub[] = [];
  subs.push(Speech.addListener('start', () => handlers.onStart?.()));
  subs.push(
    Speech.addListener('result', (ev: { results?: { transcript: string }[]; isFinal?: boolean }) => {
      const text = ev?.results?.[0]?.transcript ?? '';
      if (!text) return;
      if (ev.isFinal) handlers.onFinal?.(text);
      else handlers.onPartial?.(text);
    }),
  );
  subs.push(
    Speech.addListener('error', (ev: { error?: string; message?: string }) =>
      handlers.onError?.(ev?.error ?? 'error', ev?.message ?? 'Speech recognition failed'),
    ),
  );
  subs.push(Speech.addListener('end', () => handlers.onEnd?.()));

  try {
    Speech.start({
      lang: opts.lang,
      interimResults: true,
      continuous: opts.continuous ?? false,
      requiresOnDeviceRecognition: opts.offline ?? false,
      addsPunctuation: false,
      // The recogniser is far more likely to return "வெங்காயம்" correctly when
      // it knows the shop's actual catalogue up front.
      contextualStrings: opts.contextualStrings?.slice(0, 100),
      androidIntentOptions: {
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1200,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1200,
      },
    } as ExpoSpeechRecognitionOptions);
  } catch (e) {
    handlers.onError?.('start-failed', (e as Error)?.message ?? String(e));
  }

  return () => {
    for (const s of subs) {
      try {
        s.remove();
      } catch {
        /* already removed */
      }
    }
    try {
      Speech.abort();
    } catch {
      /* not running */
    }
  };
}

/** Ask for a final result and close the mic. */
export function stopListening(): void {
  try {
    Speech?.stop();
  } catch {
    /* not running */
  }
}

/** Drop the session without waiting for a result. */
export function abortListening(): void {
  try {
    Speech?.abort();
  } catch {
    /* not running */
  }
}

// ── Talk back ────────────────────────────────────────────────────────────────
/** Speak a confirmation ("ரெண்டு டீ சேர்க்கப்பட்டது") in the active language. */
export function speak(text: string, lang: VoiceLang): void {
  if (!Tts || !text) return;
  try {
    Tts.speak(text, { language: lang, rate: 1.0, pitch: 1.0 });
  } catch {
    /* TTS is a nicety — never let it break a command */
  }
}

export function stopSpeaking(): void {
  try {
    Tts?.stop();
  } catch {
    /* nothing playing */
  }
}
