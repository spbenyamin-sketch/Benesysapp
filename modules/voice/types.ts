// Shared vocabulary for the voice layer. Screens never see raw transcripts —
// they receive already-parsed `VoiceIntent`s, so Tamil/English/mixed speech and
// all the messy synonyms are handled in exactly one place (parser.ts + lexicon.ts).

/** Recognition locale. Android's speech recognizer is single-locale per session. */
export type VoiceLang = 'ta-IN' | 'en-IN';

export const VOICE_LANG_LABEL: Record<VoiceLang, string> = {
  'ta-IN': 'தமிழ்',
  'en-IN': 'English',
};

/** Screens/tabs the user can jump to by voice from anywhere. */
export type NavTarget =
  | 'dashboard'
  | 'quickbill'
  | 'parties'
  | 'items'
  | 'reports'
  | 'settings'
  | 'newSale'
  | 'newPurchase'
  | 'newQuotation'
  | 'newChallan'
  | 'newParty'
  | 'newItem'
  | 'newPayment'
  | 'expenses'
  | 'newExpense'
  | 'reportSales'
  | 'reportOutstanding'
  | 'reportStock'
  | 'reportGst';

/** Named fields a form screen can be asked to fill by voice. */
export type VoiceField =
  | 'name'
  | 'phone'
  | 'amount'
  | 'rate'
  | 'purchase'
  | 'qty'
  | 'stock'
  | 'discount'
  | 'tax'
  | 'city'
  | 'state'
  | 'address'
  | 'gstin'
  | 'hsn'
  | 'unit'
  | 'category'
  | 'prefix'
  | 'email'
  | 'alias'
  | 'date'
  | 'notes';

/**
 * Buttons — not fields — that a screen exposes: "எடிட்", "டெலிட்", "பேக்அப்",
 * "லாக் ஆன்"… Each screen consumes the ones it actually has on screen, so the
 * same word does the right thing in each place ("delete" = this invoice on the
 * invoice screen, = empty the cart on Quick Bill).
 */
export type VoiceAction =
  | 'edit'
  | 'delete'
  | 'adjustStock'
  | 'markCustomer'
  | 'markSupplier'
  | 'backup'
  | 'restore'
  | 'signOut'
  | 'lockOn'
  | 'lockOff'
  | 'autoBackupOn'
  | 'autoBackupOff'
  | 'speakOn'
  | 'speakOff'
  | 'langTamil'
  | 'langEnglish';

export type VoiceIntent =
  /** "ரெண்டு டீ" / "add 2 tea" — add qty of an item to the current cart/invoice. */
  | { kind: 'addLine'; itemQuery: string; qty: number; rate?: number }
  /** "டீ நீக்கு" / "remove tea" — remove (or decrement by qty) a line. */
  | { kind: 'removeLine'; itemQuery: string; qty?: number }
  /** "டீ ஐந்து ஆக்கு" / "set tea to 5" — overwrite the qty of a line. */
  | { kind: 'setQty'; itemQuery: string; qty: number }
  /** "கிளியர்" / "clear" — empty the cart / reset the form. */
  | { kind: 'clear' }
  /** "பில் போடு" / "save" — submit the current screen's primary action. */
  | { kind: 'submit' }
  /** "பிரிண்ட்" / "print". */
  | { kind: 'print' }
  /** "ஷேர்" / "share". */
  | { kind: 'share' }
  /** "மொத்தம் என்ன" / "what's the total" — speak the running total back. */
  | { kind: 'total' }
  /** "ராஜேஷ் தேடு" / "search rajesh". */
  | { kind: 'search'; query: string }
  /** "ராஜேஷ் கஸ்டமர்" — pick a party on a form / open a party from a list. */
  | { kind: 'selectParty'; query: string }
  /** "ரேட் நூறு" / "amount 500" — fill one named field. */
  | { kind: 'setField'; field: VoiceField; value: string }
  /** "பேமெண்ட் மோடு ஜிபே" — cash/upi/card/bank. */
  | { kind: 'setPaymentMode'; mode: 'cash' | 'upi' | 'card' | 'bank' }
  /** "டாக்ஸ் உள்ளே" / "tax included" — switch the invoice tax mode. */
  | { kind: 'setTaxMode'; mode: 'inclusive' | 'exclusive' }
  /** "எக்செல்" / "export excel". */
  | { kind: 'exportExcel' }
  /** "எடிட்" / "டெலிட்" / "பேக்அப்" — press a button on the current screen. */
  | { kind: 'action'; action: VoiceAction }
  /** "முகப்பு" / "go to items" — jump to another screen. */
  | { kind: 'navigate'; target: NavTarget }
  /** "பின்னால" / "back". */
  | { kind: 'back' }
  /** "என்ன சொல்லலாம்" / "help" — show the command cheatsheet. */
  | { kind: 'help' }
  /** Nothing matched — the provider reports it back to the user. */
  | { kind: 'unknown'; transcript: string };

/**
 * A screen's command handler. Return `true` if the screen consumed the intent.
 * Anything falsy falls through to the global handler (navigation, back, help),
 * so every screen gets the app-wide commands for free.
 * The optional string return is spoken/shown as the confirmation instead of the
 * generic one — e.g. "2 tea added, total 40 rupees".
 */
export type VoiceHandler = (intent: VoiceIntent) => boolean | string | void;

export interface VoiceStatus {
  /** Native speech module present (false in Expo Go — needs the dev build). */
  available: boolean;
  listening: boolean;
  /** Live (interim) or last final transcript, for the on-screen bubble. */
  transcript: string;
  /** Last confirmation/error line shown under the mic. */
  message: string;
  error: string | null;
}
