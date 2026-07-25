// Spoken/printed confirmations, in the user's chosen language. Kept apart from
// the parser so wording changes never risk breaking command recognition.

import type { VoiceLang } from './types';

type Phrase = Record<VoiceLang, string>;

const P = {
  listening: { 'ta-IN': 'சொல்லுங்க…', 'en-IN': 'Listening…' },
  notUnderstood: { 'ta-IN': 'புரியல, மறுபடி சொல்லுங்க', 'en-IN': "Didn't catch that" },
  noMatch: { 'ta-IN': 'அந்த பொருள் கிடைக்கல', 'en-IN': 'No such item' },
  noParty: { 'ta-IN': 'அந்த வாடிக்கையாளர் கிடைக்கல', 'en-IN': 'No such customer' },
  cartEmpty: { 'ta-IN': 'கார்ட் காலியா இருக்கு', 'en-IN': 'Cart is empty' },
  cleared: { 'ta-IN': 'எல்லாம் நீக்கிட்டேன்', 'en-IN': 'Cleared' },
  billed: { 'ta-IN': 'பில் போட்டாச்சு', 'en-IN': 'Bill created' },
  saved: { 'ta-IN': 'சேமிச்சாச்சு', 'en-IN': 'Saved' },
  printing: { 'ta-IN': 'பிரிண்ட் ஆகுது', 'en-IN': 'Printing' },
  sharing: { 'ta-IN': 'அனுப்புறேன்', 'en-IN': 'Sharing' },
  exporting: { 'ta-IN': 'எக்செல் தயாராகுது', 'en-IN': 'Preparing Excel' },
  notHere: { 'ta-IN': 'இந்த பக்கத்துல அது முடியாது', 'en-IN': "Can't do that on this screen" },
  micOff: { 'ta-IN': 'மைக் நிறுத்தப்பட்டது', 'en-IN': 'Mic off' },
  taxIncl: { 'ta-IN': 'வரி உள்ளடக்கியது', 'en-IN': 'Tax included in rate' },
  taxExcl: { 'ta-IN': 'வரி தனியா', 'en-IN': 'Tax added on top' },
} satisfies Record<string, Phrase>;

export type PhraseKey = keyof typeof P;

export function t(key: PhraseKey, lang: VoiceLang): string {
  return P[key][lang];
}

/** "2 டீ சேர்த்தாச்சு" / "Added 2 tea". */
export function addedLine(qty: number, name: string, lang: VoiceLang): string {
  return lang === 'ta-IN' ? `${qty} ${name} சேர்த்தாச்சு` : `Added ${qty} ${name}`;
}

export function removedLine(name: string, lang: VoiceLang): string {
  return lang === 'ta-IN' ? `${name} நீக்கிட்டேன்` : `Removed ${name}`;
}

export function setQtyLine(qty: number, name: string, lang: VoiceLang): string {
  return lang === 'ta-IN' ? `${name} ${qty} ஆக்கிட்டேன்` : `${name} set to ${qty}`;
}

/** Money read out loud — "இருநூத்தி நாப்பது ரூபாய்" is overkill, digits are clearer. */
export function totalLine(rupees: string, lang: VoiceLang): string {
  return lang === 'ta-IN' ? `மொத்தம் ${rupees}` : `Total ${rupees}`;
}

export function openedScreen(label: string, lang: VoiceLang): string {
  return lang === 'ta-IN' ? `${label} திறந்தாச்சு` : `Opened ${label}`;
}

export function fieldSet(label: string, value: string, lang: VoiceLang): string {
  return lang === 'ta-IN' ? `${label} ${value}` : `${label} ${value}`;
}
