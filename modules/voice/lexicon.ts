// Tamil + English (+ romanised "Tanglish") word lists for the voice parser.
//
// Why one flat lexicon instead of per-language parsers: Android's recogniser is
// set to ONE locale per session, but real shop speech is mixed — a Tamil session
// happily returns "2 டீ", "டூ டீ" or "two tea". So every keyword list below
// carries Tamil script + romanised Tamil + English spellings together, and the
// parser matches against all of them regardless of the selected language.
//
// Everything here is lowercase; normalise() in parser.ts lowercases the input.

// ── Numbers ──────────────────────────────────────────────────────────────────
// Value maps for a small additive/multiplicative number reader:
//   units/teens/tens add up, scales (hundred/thousand) multiply what came before.

export const NUM_WORDS: Record<string, number> = {
  // Tamil units
  'ஒன்று': 1, 'ஒண்ணு': 1, 'ஒன்னு': 1, 'ஒரு': 1, 'ஓர்': 1, 'ஒன்': 1,
  'இரண்டு': 2, 'ரெண்டு': 2, 'இரு': 2, 'ரெண்ட': 2,
  'மூன்று': 3, 'மூணு': 3, 'மூன': 3,
  'நான்கு': 4, 'நாலு': 4, 'நாங்கு': 4,
  'ஐந்து': 5, 'அஞ்சு': 5, 'அய்ந்து': 5,
  'ஆறு': 6,
  'ஏழு': 7,
  'எட்டு': 8,
  'ஒன்பது': 9, 'ஒம்பது': 9, 'ஒன்பத': 9,
  'பத்து': 10,
  // Tamil says the hundreds as single words, not "five hundred"
  'இருநூறு': 200, 'இருநூற்று': 200,
  'முந்நூறு': 300, 'முந்நூற்று': 300,
  'நானூறு': 400, 'நானூற்று': 400,
  'ஐநூறு': 500, 'ஐநூற்று': 500, 'அஞ்சுநூறு': 500,
  'அறுநூறு': 600, 'அறுநூற்று': 600,
  'எழுநூறு': 700, 'எழுநூற்று': 700,
  'எண்ணூறு': 800, 'எண்ணூற்று': 800,
  'தொள்ளாயிரம்': 900,
  'ஐயாயிரம்': 5000, 'பத்தாயிரம்': 10000,
  irunooru: 200, ainooru: 500, anjunooru: 500,
  // Tamil teens
  'பதினொன்று': 11, 'பதினொண்ணு': 11,
  'பன்னிரண்டு': 12, 'பன்னெண்டு': 12,
  'பதிமூன்று': 13, 'பதிமூணு': 13,
  'பதினான்கு': 14, 'பதினாலு': 14,
  'பதினைந்து': 15, 'பதினஞ்சு': 15,
  'பதினாறு': 16,
  'பதினேழு': 17,
  'பதினெட்டு': 18,
  'பத்தொன்பது': 19, 'பத்தொம்பது': 19,
  // Tamil tens (standalone + the "-tti" combining forms: இருபத்தி ஐந்து = 25)
  'இருபது': 20, 'இருபத்தி': 20, 'இருவது': 20,
  'முப்பது': 30, 'முப்பத்தி': 30,
  'நாற்பது': 40, 'நாற்பத்தி': 40, 'நாப்பது': 40,
  'ஐம்பது': 50, 'ஐம்பத்தி': 50, 'அம்பது': 50,
  'அறுபது': 60, 'அறுபத்தி': 60,
  'எழுபது': 70, 'எழுபத்தி': 70,
  'எண்பது': 80, 'எண்பத்தி': 80,
  'தொண்ணூறு': 90, 'தொண்ணூற்றி': 90, 'தொன்னூறு': 90,

  // Romanised Tamil
  onnu: 1, onru: 1, oru: 1, oor: 1,
  rendu: 2, irandu: 2, rend: 2,
  moonu: 3, moondru: 3, muunu: 3,
  naalu: 4, nangu: 4, naanku: 4,
  anju: 5, ainthu: 5, ainduh: 5,
  aaru: 6, aru: 6,
  ezhu: 7, elu: 7,
  ettu: 8,
  onbathu: 9, onbadhu: 9,
  pathu: 10, paththu: 10,
  irubathu: 20, irupathu: 20,
  muppathu: 30,
  narpathu: 40,
  aimbathu: 50,
  arupathu: 60,
  ezhupathu: 70,
  enbathu: 80,
  thonnooru: 90,

  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
  a: 1, an: 1, couple: 2, dozen: 12,
};

/** Multipliers: "two hundred fifty" / "ரெண்டு நூறு" → 250. */
export const NUM_SCALES: Record<string, number> = {
  'நூறு': 100, 'நூற்று': 100, 'நூற்றி': 100,
  'ஆயிரம்': 1000, 'ஆயிரத்து': 1000,
  'லட்சம்': 100000, 'இலட்சம்': 100000,
  nooru: 100, nuru: 100,
  aayiram: 1000, ayiram: 1000,
  latcham: 100000, laksham: 100000, lakh: 100000, lakhs: 100000,
  hundred: 100, thousand: 1000, k: 1000, crore: 10000000,
};

/** Fractions that can stand alone ("அரை கிலோ" = 0.5 kg) or follow a number. */
export const NUM_FRACTIONS: Record<string, number> = {
  'அரை': 0.5, 'கால்': 0.25, 'முக்கால்': 0.75,
  arai: 0.5, kaal: 0.25, mukkaal: 0.75,
  half: 0.5, quarter: 0.25,
};

/** Whole+fraction words spoken as one token: ஒன்றரை = 1.5. */
export const NUM_COMPOUND: Record<string, number> = {
  'ஒன்றரை': 1.5, 'ஒண்ணரை': 1.5, 'ஒன்னரை': 1.5, 'ஒரையரை': 1.5,
  'இரண்டரை': 2.5, 'ரெண்டரை': 2.5,
  'மூன்றரை': 3.5, 'மூணரை': 3.5,
  'நான்கரை': 4.5, 'நாலரை': 4.5,
  'ஐந்தரை': 5.5, 'அஞ்சரை': 5.5,
  'ஆறரை': 6.5, 'ஏழரை': 7.5, 'எட்டரை': 8.5, 'ஒன்பதரை': 9.5, 'பத்தரை': 10.5,
  onnara: 1.5, onnarai: 1.5, rendara: 2.5, rendarai: 2.5, irandarai: 2.5,
  moonara: 3.5, moonarai: 3.5, naalara: 4.5, naalarai: 4.5,
  anjara: 5.5, anjarai: 5.5, ararai: 6.5, ezharai: 7.5, ettarai: 8.5,
  patharai: 10.5,
};

/** Spoken decimal point: "ஒன்று புள்ளி ஐந்து" / "one point five" → 1.5. */
export const POINT_WORDS = ['புள்ளி', 'பாய்ண்ட்', 'point', 'dot', 'decimal'];

/**
 * Fraction glyphs, and the "1 1/2" spelling Google's recogniser uses for a
 * spoken "one and a half" — both mapped to decimals before parsing. Left alone,
 * "1 1/2 கிலோ" tokenises to 1, 1 and 2, which the number reader adds up to 4.
 */
export const FRACTION_GLYPHS: Record<string, string> = {
  '½': '0.5', '¼': '0.25', '¾': '0.75', '⅓': '0.333', '⅔': '0.667',
};

/** Tamil digit glyphs, mapped to ASCII before parsing. */
export const TAMIL_DIGITS: Record<string, string> = {
  '௦': '0', '௧': '1', '௨': '2', '௩': '3', '௪': '4',
  '௫': '5', '௬': '6', '௭': '7', '௮': '8', '௯': '9',
};

// ── Keyword groups ───────────────────────────────────────────────────────────
// Each list is checked with whole-word matching first, then substring (Tamil
// agglutinates suffixes onto stems, so "பில்லு"/"பில்ல" must still hit "பில்").

export const KW = {
  add: ['சேர்', 'சேர்க்க', 'சேருங்க', 'சேர்த்து', 'போடு', 'போடுங்க', 'ஆட்', 'எடு',
        'ser', 'sernga', 'podu', 'potu', 'add', 'adhu', 'plus', 'put'],
  remove: ['நீக்கு', 'நீக்குங்க', 'கழி', 'எடுத்துடு', 'குறை', 'ரிமூவ்', 'டெலிட்', 'வேண்டாம்',
           'neeku', 'kalai', 'kurai', 'remove', 'delete', 'minus', 'reduce', 'cancel'],
  set: ['ஆக்கு', 'ஆக்குங்க', 'செட்', 'மாத்து', 'மாற்று',
        'aakku', 'maathu', 'set', 'change', 'make'],
  clear: ['அழி', 'கிளியர்', 'எல்லாம்நீக்கு', 'ரத்து', 'காலி',
          'azhi', 'clear', 'reset', 'empty', 'clearall'],
  // "போடு" (put/make) is the verb that turns "பில்" into a command — it also
  // appears in `add`, which is fine: a bare "பில் போடு" is matched as a pure
  // submit first, while "ரெண்டு டீ போடு" never qualifies as pure and falls
  // through to the add rule.
  submit: ['பில்', 'பில்லு', 'பில்போடு', 'போடு', 'போடுங்க', 'போட்டுடு', 'சேமி', 'சேவ்',
           'முடி', 'முடிச்சு', 'ஓகே', 'சரி',
           'podu', 'potu', 'bill', 'billu', 'save', 'submit', 'done', 'finish', 'charge',
           'confirm', 'ok'],
  print: ['அச்சிடு', 'பிரிண்ட்', 'பிரிண்ட்போடு', 'அச்சு',
          'achidu', 'print', 'printout'],
  share: ['பகிர்', 'ஷேர்', 'அனுப்பு', 'வாட்ஸ்அப்',
          'share', 'send', 'whatsapp', 'pdf'],
  total: ['மொத்தம்', 'டோட்டல்', 'எவ்வளவு', 'எத்தனை', 'சம்மரி',
          'motham', 'total', 'howmuch', 'sum', 'amount?'],
  search: ['தேடு', 'தேடுங்க', 'சர்ச்', 'கண்டுபிடி',
           'thedu', 'search', 'find', 'look'],
  open: ['திற', 'திறங்க', 'ஓபன்', 'காட்டு', 'பாரு',
         'thira', 'kaattu', 'open', 'show', 'view', 'goto'],
  // "return" is NOT here: it now means a sale return, which is a document, not
  // a way of leaving the screen.
  back: ['பின்', 'பின்னால', 'திரும்பு', 'பேக்', 'முந்தைய',
         'pinnala', 'thirumbu', 'back', 'previous'],
  help: ['உதவி', 'ஹெல்ப்', 'கமாண்ட்', 'என்னசொல்லலாம்',
         'udhavi', 'help', 'commands', 'whatcanisay'],
  excel: ['எக்செல்', 'எக்ஸெல்', 'எக்ஸ்போர்ட்', 'excel', 'export', 'xlsx', 'spreadsheet'],
  newWord: ['புது', 'புதிய', 'நியூ', 'pudhu', 'puthiya', 'new', 'create', 'start'],
  taxIn: ['உள்ளடக்கிய', 'உள்ளே', 'இன்க்ளூசிவ்', 'சேர்த்து',
          'inclusive', 'including', 'includetax', 'taxincluded', 'incl'],
  taxOut: ['தனியாக', 'வெளியே', 'எக்ஸ்குளூசிவ்', 'கூடுதல்', 'எக்ஸ்ட்ரா',
           'exclusive', 'excluding', 'extra', 'plustax', 'excl'],
  tax: ['வரி', 'ஜிஎஸ்டி', 'டாக்ஸ்', 'ஜி.எஸ்.டி', 'vari', 'gst', 'tax'],
} as const;

/** Currency / quantity noise words dropped before item-name matching. */
export const FILLER = [
  'ரூபாய்', 'ரூவா', 'ரூ', 'ரூபா', 'rupees', 'rupee', 'rs', 'inr',
  'கிலோ', 'கிராம்', 'லிட்டர்', 'மில்லி', 'பாக்கெட்', 'பீஸ்', 'எண்ணிக்கை', 'நபர்',
  'kg', 'kgs', 'kilo', 'gram', 'grams', 'litre', 'liter', 'ltr', 'ml', 'packet', 'pack',
  'piece', 'pieces', 'pcs', 'nos', 'no', 'plate', 'cup', 'box', 'bottle',
  'பிளேட்', 'கப்', 'பாட்டில்', 'டப்பா',
  'மற்றும்', 'அப்புறம்', 'பிறகு', 'கொஞ்சம்', 'ஒரு', 'the', 'and', 'then', 'also',
  'please', 'ok', 'ஓகே', 'to', 'for', 'of', 'at', 'க்கு', 'ஆக',
];

// ── Navigation targets ───────────────────────────────────────────────────────
// Order matters: the parser takes the FIRST list whose keyword appears, so the
// more specific "new sale" entries must precede the plain page names.

import type { NavTarget } from './types';

export const NAV_WORDS: { target: NavTarget; words: string[] }[] = [
  // Before newSale: "விற்பனை ரிட்டர்ன்" carries a sale word too, and the longest
  // match wins, so the return entry has to be in the running for it.
  { target: 'newSaleReturn', words: ['விற்பனைரிட்டர்ன்', 'ரிட்டர்ன்', 'திரும்பபெறு', 'திருப்பிவாங்கு', 'கிரெடிட்நோட்', 'salereturn', 'creditnote', 'return', 'returns', 'goodsreturn', 'sarakkuthirumbal'] },
  { target: 'newSale', words: ['புதுவிற்பனை', 'விற்பனைபில்', 'சேல்ஸ்பில்', 'விற்பனை', 'சேல்ஸ்', 'newsale', 'salesinvoice', 'newinvoice', 'saleinvoice', 'sale', 'sales', 'vithpanai', 'virpanai'] },
  { target: 'newPurchase', words: ['புதுகொள்முதல்', 'கொள்முதல்பில்', 'கொள்முதல்', 'பர்ச்சேஸ்', 'newpurchase', 'purchasebill', 'purchaseinvoice', 'purchase', 'kolmudhal'] },
  { target: 'newQuotation', words: ['மதிப்பீடு', 'கோட்டேஷன்', 'quotation', 'quote', 'estimate'] },
  { target: 'newChallan', words: ['சலான்', 'டெலிவரி', 'challan', 'delivery', 'deliverynote'] },
  { target: 'newPayment', words: ['பணம்பெறு', 'பேமெண்ட்', 'ரசீது', 'payment', 'receipt', 'collect', 'paid'] },
  // The parser keeps the LONGEST matched word, so "புதுசெலவு" opens the form
  // while a bare "செலவு" opens the list.
  { target: 'newExpense', words: ['புதுசெலவு', 'செலவுசேர்', 'newexpense', 'addexpense', 'expenseadd'] },
  { target: 'expenses', words: ['செலவு', 'செலவுகள்', 'கர்ச்சு', 'எக்ஸ்பென்ஸ்', 'selavu', 'expense', 'expenses', 'spending', 'overhead'] },
  { target: 'newParty', words: ['புதுவாடிக்கையாளர்', 'புதுகஸ்டமர்', 'newparty', 'newcustomer', 'addcustomer', 'newsupplier'] },
  { target: 'newItem', words: ['புதுபொருள்', 'புதுஐட்டம்', 'newitem', 'additem', 'newproduct'] },
  { target: 'reportSales', words: ['விற்பனைஅறிக்கை', 'salesreport'] },
  // The whole document list. "பில்" alone still means "make the bill" (it is a
  // submit word), so only the plural/list forms land here.
  { target: 'invoices', words: ['பில்பட்டியல்', 'எல்லாபில்', 'பில்கள்', 'இன்வாய்ஸ்', 'billlist', 'allbills', 'invoices', 'transactions', 'bills'] },
  // "லாபம்" alone is the whole question a shopkeeper asks, so it needs no
  // report/page word to count as navigation.
  { target: 'reportProfit', words: ['லாபம்', 'லாபநஷ்டம்', 'ப்ராஃபிட்', 'laabam', 'labam', 'profit', 'profitloss', 'profitreport', 'earning', 'earnings', 'margin'] },
  { target: 'reportOutstanding', words: ['பாக்கி', 'நிலுவை', 'outstanding', 'receivable', 'duereport'] },
  { target: 'reportStock', words: ['ஸ்டாக்அறிக்கை', 'இருப்பு', 'stockreport', 'inventory'] },
  { target: 'reportGst', words: ['ஜிஎஸ்டிஅறிக்கை', 'gstreport', 'gstsummary'] },
  { target: 'quickbill', words: ['பில்பக்கம்', 'குயிக்பில்', 'கவுண்டர்', 'quickbill', 'billing', 'pos', 'counter'] },
  { target: 'dashboard', words: ['முகப்பு', 'டாஷ்போர்டு', 'ஹோம்', 'mugappu', 'dashboard', 'home', 'main'] },
  { target: 'parties', words: ['வாடிக்கையாளர்', 'கஸ்டமர்', 'பார்ட்டி', 'சப்ளையர்', 'customer', 'customers', 'party', 'parties', 'supplier', 'suppliers'] },
  { target: 'items', words: ['பொருள்', 'பொருட்கள்', 'ஐட்டம்', 'சரக்கு', 'ஸ்டாக்', 'porul', 'item', 'items', 'product', 'products', 'stock'] },
  { target: 'reports', words: ['அறிக்கை', 'ரிப்போர்ட்', 'கணக்கு', 'arikkai', 'report', 'reports', 'analytics'] },
  { target: 'settings', words: ['அமைப்பு', 'அமைப்புகள்', 'செட்டிங்ஸ்', 'amaippu', 'settings', 'setting', 'config'] },
];

// ── Named form fields ────────────────────────────────────────────────────────
// Order matters: the parser takes the FIRST entry whose keyword appears, so
// "ஜிஎஸ்டி நம்பர்" must be read as GSTIN before "நம்பர்" is read as a phone.
import type { VoiceAction, VoiceField } from './types';

export const FIELD_WORDS: { field: VoiceField; words: string[] }[] = [
  { field: 'gstin', words: ['ஜிஎஸ்டின்', 'ஜிஎஸ்டிநம்பர்', 'gstin', 'gstnumber', 'gstno'] },
  { field: 'hsn', words: ['எச்எஸ்என்', 'ஹெச்எஸ்என்', 'hsn', 'sac', 'hsncode', 'saccode'] },
  { field: 'phone', words: ['போன்', 'மொபைல்', 'நம்பர்', 'கைபேசி', 'phone', 'mobile', 'number', 'contact'] },
  { field: 'email', words: ['ஈமெயில்', 'இமெயில்', 'மெயில்', 'email', 'mail', 'gmail'] },
  { field: 'name', words: ['பெயர்', 'நேம்', 'peyar', 'name'] },
  { field: 'alias', words: ['குரல்பெயர்', 'வாய்ஸ்பெயர்', 'voicename', 'alias', 'nickname'] },
  { field: 'purchase', words: ['கொள்முதல்விலை', 'கொள்முதல்', 'வாங்கியவிலை', 'purchaseprice', 'purchaserate', 'costprice', 'buyingprice', 'purchase'] },
  { field: 'rate', words: ['ரேட்', 'விலை', 'வெலை', 'price', 'rate', 'cost', 'mrp'] },
  { field: 'stock', words: ['இருப்பு', 'ஸ்டாக்', 'ஓப்பனிங்', 'stock', 'opening', 'openingstock', 'inventory'] },
  { field: 'qty', words: ['அளவு', 'எண்ணிக்கை', 'குவாண்டிட்டி', 'qty', 'quantity'] },
  { field: 'unit', words: ['யூனிட்', 'அலகு', 'unit', 'uom', 'measure'] },
  { field: 'category', words: ['வகை', 'கேட்டகிரி', 'category', 'group'] },
  { field: 'discount', words: ['தள்ளுபடி', 'டிஸ்கவுண்ட்', 'கழிவு', 'discount', 'off'] },
  { field: 'amount', words: ['தொகை', 'அமௌண்ட்', 'பணம்', 'amount', 'value'] },
  { field: 'address', words: ['முகவரி', 'அட்ரஸ்', 'விலாசம்', 'address', 'vilasam'] },
  { field: 'city', words: ['ஊர்', 'நகரம்', 'சிட்டி', 'city', 'town', 'place'] },
  { field: 'state', words: ['மாநிலம்', 'ஸ்டேட்', 'state'] },
  { field: 'prefix', words: ['ப்ரிபிக்ஸ்', 'பிரிபிக்ஸ்', 'prefix', 'invoiceprefix', 'billprefix'] },
  { field: 'date', words: ['தேதி', 'டேட்', 'thethi', 'date'] },
  { field: 'notes', words: ['குறிப்பு', 'நோட்ஸ்', 'note', 'notes', 'remark', 'remarks'] },
];

/** Fields whose value is spoken text, not a number. */
export const TEXT_FIELDS: VoiceField[] = ['name', 'city', 'state', 'address', 'category', 'unit', 'alias', 'notes'];

/** Fields spoken as a code — keep the digits, drop the spaces, upper-case it. */
export const CODE_FIELDS: VoiceField[] = ['gstin', 'hsn', 'prefix'];

// ── Who the bill is for ──────────────────────────────────────────────────────
/** Words that mean "the customer/supplier on this form", e.g. "பார்ட்டி ராஜேஷ்". */
export const PARTY_WORDS = [
  'வாடிக்கையாளர்', 'கஸ்டமர்', 'பார்ட்டி', 'சப்ளையர்', 'வியாபாரி', 'கடைக்காரர்',
  'customer', 'client', 'party', 'supplier', 'vendor', 'buyer', 'seller',
  'vaadikaiyalar', 'kastamar', 'partyname',
];

/** Words for choosing/entering a value — stripped before the spoken name. */
export const PICK_WORDS = ['இடு', 'இடுங்க', 'தேர்ந்தெடு', 'செலக்ட்', 'idu', 'select', 'choose', 'pick', 'enter', 'type'];

// ── Screen buttons ───────────────────────────────────────────────────────────
// `pure` entries fire only when the whole clause is that word (+ filler), so
// "நீக்கு" alone deletes the record while "டீ நீக்கு" still removes a line.
// `with` entries need a second keyword too ("லாக் ஆன்", "backup off").

export const ON_WORDS = ['ஆன்', 'போடு', 'போடுங்க', 'வை', 'ஆரம்பி', 'வேணும்', 'on', 'enable', 'start', 'yes'];
export const OFF_WORDS = ['ஆஃப்', 'ஆப்', 'நிறுத்து', 'வேண்டாம்', 'off', 'disable', 'stop', 'no', 'mute'];

/** "பேக்அப்" starts with "பேக்"/"back" — these keep it from meaning "go back". */
export const BACKUP_WORDS = ['பேக்அப்', 'பேக்கப்', 'ஆட்டோபேக்அப்', 'backup', 'backupnow', 'autobackup', 'automaticbackup'];

export const ACTION_WORDS: { action: VoiceAction; words: string[]; with?: string[]; pure?: boolean }[] = [
  { action: 'autoBackupOff', words: ['ஆட்டோபேக்அப்', 'தானியங்கிபேக்அப்', 'autobackup', 'automaticbackup'], with: OFF_WORDS },
  { action: 'autoBackupOn', words: ['ஆட்டோபேக்அப்', 'தானியங்கிபேக்அப்', 'autobackup', 'automaticbackup'], with: ON_WORDS },
  { action: 'restore', words: ['ரீஸ்டோர்', 'மீட்டெடு', 'restore', 'recover', 'import'] },
  { action: 'backup', words: ['பேக்அப்', 'பேக்கப்', 'நகல்', 'backup', 'backupnow'] },
  { action: 'signOut', words: ['சைன்அவுட்', 'லாக்அவுட்', 'வெளியேறு', 'signout', 'logout', 'sign'] },
  { action: 'lockOff', words: ['லாக்', 'பூட்டு', 'lock', 'applock'], with: OFF_WORDS },
  { action: 'lockOn', words: ['லாக்', 'பூட்டு', 'lock', 'applock'], with: ON_WORDS },
  { action: 'speakOff', words: ['பேசு', 'ஸ்பீக்', 'ஒலி', 'சத்தம்', 'speak', 'speech', 'sound', 'voice'], with: OFF_WORDS },
  { action: 'speakOn', words: ['பேசு', 'ஸ்பீக்', 'ஒலி', 'சத்தம்', 'speak', 'speech', 'sound', 'voice'], with: ON_WORDS },
  { action: 'langTamil', words: ['தமிழ்', 'தமிழ்ல', 'tamil', 'tamizh'] },
  { action: 'langEnglish', words: ['ஆங்கிலம்', 'இங்கிலீஷ்', 'english', 'anglam'] },
  { action: 'markSupplier', words: ['சப்ளையர்', 'supplier', 'vendor'], with: ['ஆக்கு', 'ஆக', 'மாத்து', 'aakku', 'set', 'make', 'change', 'mark'] },
  { action: 'markCustomer', words: ['கஸ்டமர்', 'வாடிக்கையாளர்', 'customer', 'buyer'], with: ['ஆக்கு', 'ஆக', 'மாத்து', 'aakku', 'set', 'make', 'change', 'mark'] },
  { action: 'adjustStock', words: ['ஸ்டாக்மாத்து', 'இருப்புமாத்து', 'அட்ஜஸ்ட்', 'stockadjust', 'adjuststock', 'adjust'] },
  { action: 'edit', words: ['திருத்து', 'எடிட்', 'மாத்து', 'மாற்று', 'edit', 'modify', 'rename', 'thiruthu'], pure: true },
  { action: 'delete', words: ['டெலிட்', 'நீக்கு', 'நீக்குங்க', 'அழிச்சுடு', 'delete', 'remove'], pure: true },
];

export const PAYMENT_MODE_WORDS: { mode: 'cash' | 'upi' | 'card' | 'bank'; words: string[] }[] = [
  { mode: 'upi', words: ['யுபிஐ', 'ஜிபே', 'போன்பே', 'பேடிஎம்', 'ஸ்கேன்', 'upi', 'gpay', 'googlepay', 'phonepe', 'paytm', 'scan', 'qr'] },
  // A bare "credit" is NOT here: "credit note" is a sale return, and a shop that
  // means the card says "card" or "credit card" (joined, so both still match).
  { mode: 'card', words: ['கார்டு', 'கிரெடிட்கார்டு', 'டெபிட்கார்டு', 'டெபிட்', 'ஸ்வைப்', 'card', 'creditcard', 'debitcard', 'debit', 'swipe'] },
  { mode: 'bank', words: ['வங்கி', 'பேங்க்', 'டிரான்ஸ்ஃபர்', 'நெப்ட்', 'bank', 'transfer', 'neft', 'imps', 'rtgs', 'cheque', 'check'] },
  { mode: 'cash', words: ['ரொக்கம்', 'கேஷ்', 'பணமாக', 'cash', 'rokkam'] },
];

/** Splits one utterance into separate commands: "ரெண்டு டீ, மூணு காபி". */
export const SEPARATORS = [
  ',', '،', ';', '.', ' மற்றும் ', ' அப்புறம் ', ' பிறகு ', ' and ', ' then ', ' plus ',
];
