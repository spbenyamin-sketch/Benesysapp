// The "what can I say?" cheatsheet, shown by the mic's ? button and by the
// "help" / "உதவி" voice command itself.

export interface HelpGroup {
  title: string;
  titleTa: string;
  examples: { ta: string; en: string; does: string; doesTa: string }[];
}

export const HELP: HelpGroup[] = [
  {
    title: 'Billing (Quick Bill / invoice)',
    titleTa: 'பில் போடுதல்',
    examples: [
      { ta: 'ரெண்டு டீ', en: 'two tea', does: 'Adds 2 tea to the cart', doesTa: '2 டீ கார்ட்ல சேரும்' },
      { ta: 'மூணு காபி, ஒரு வடை', en: 'three coffee and one vada', does: 'Adds both lines at once', doesTa: 'ரெண்டு வரியும் சேரும்' },
      { ta: 'டீ நீக்கு', en: 'remove tea', does: 'Removes that line', doesTa: 'அந்த வரி நீங்கும்' },
      { ta: 'டீ ஐந்து ஆக்கு', en: 'set tea to five', does: 'Sets that line’s quantity', doesTa: 'அளவை மாத்தும்' },
      { ta: 'மொத்தம்', en: 'total', does: 'Speaks the running total', doesTa: 'மொத்தத்தை சொல்லும்' },
      { ta: 'பில் போடு', en: 'bill', does: 'Saves the bill', doesTa: 'பில் சேமிக்கும்' },
      { ta: 'கிளியர்', en: 'clear', does: 'Empties the cart', doesTa: 'கார்ட் காலியாகும்' },
    ],
  },
  {
    title: 'Numbers & quantities',
    titleTa: 'எண்கள்',
    examples: [
      { ta: 'இருபத்தி ஐந்து', en: 'twenty five', does: '25', doesTa: '25' },
      { ta: 'நூற்று ஐம்பது', en: 'one fifty', does: '150', doesTa: '150' },
      { ta: 'அரை கிலோ சர்க்கரை', en: 'half kg sugar', does: '0.5 × sugar', doesTa: '0.5 கிலோ' },
      { ta: 'ஒன்றரை', en: 'one and half', does: '1.5', doesTa: '1.5' },
    ],
  },
  {
    title: 'Forms (party / item / payment)',
    titleTa: 'படிவங்கள்',
    examples: [
      { ta: 'பெயர் ராஜேஷ்', en: 'name rajesh', does: 'Fills the name field', doesTa: 'பெயர் நிரப்பும்' },
      { ta: 'போன் ஒன்பது எட்டு...', en: 'phone 98765 43210', does: 'Fills the phone number', doesTa: 'போன் நம்பர்' },
      { ta: 'ரேட் நூறு', en: 'rate hundred', does: 'Sets the price', doesTa: 'விலை' },
      { ta: 'தள்ளுபடி ஐம்பது', en: 'discount fifty', does: 'Sets the discount', doesTa: 'தள்ளுபடி' },
      { ta: 'பார்ட்டி ராஜேஷ்', en: 'customer rajesh', does: 'Picks that customer on the bill', doesTa: 'அந்த வாடிக்கையாளரை தேர்வு' },
      { ta: 'ராஜேஷ் தேடு', en: 'search rajesh', does: 'Searches / picks the party', doesTa: 'தேடும்' },
      { ta: 'ஜிஎஸ்டின் 33ஏபி…', en: 'gstin 33AB…', does: 'Fills the GST number', doesTa: 'ஜிஎஸ்டி நம்பர்' },
      { ta: 'யூனிட் கிலோ', en: 'unit kg', does: 'Picks the unit', doesTa: 'அலகு' },
      { ta: 'இருப்பு ஐம்பது', en: 'stock fifty', does: 'Sets the opening stock', doesTa: 'தொடக்க இருப்பு' },
      { ta: 'சப்ளையர் ஆக்கு', en: 'make supplier', does: 'Switches customer ⇄ supplier', doesTa: 'வகை மாறும்' },
      { ta: 'ஜிபே', en: 'gpay', does: 'Sets payment mode to UPI', doesTa: 'பணம் செலுத்தும் முறை' },
      { ta: 'சேமி', en: 'save', does: 'Saves the form', doesTa: 'சேமிக்கும்' },
    ],
  },
  {
    title: 'Buttons on the screen',
    titleTa: 'திரையில் இருக்கும் பட்டன்கள்',
    examples: [
      { ta: 'எடிட்', en: 'edit', does: 'Opens the edit form', doesTa: 'திருத்தும் படிவம்' },
      { ta: 'டெலிட்', en: 'delete', does: 'Deletes this record (asks first)', doesTa: 'இதை நீக்கும்' },
      { ta: 'ஸ்டாக் மாத்து', en: 'adjust stock', does: 'Opens stock adjustment', doesTa: 'இருப்பு மாத்தும்' },
      { ta: 'பேமெண்ட்', en: 'payment', does: 'Records a payment for this party', doesTa: 'பணம் பதிவு' },
      { ta: 'பேக்அப்', en: 'backup', does: 'Backs up now (Settings)', doesTa: 'இப்போ பேக்அப்' },
      { ta: 'லாக் ஆன்', en: 'lock on', does: 'Turns the app lock on/off', doesTa: 'பூட்டு ஆன்/ஆஃப்' },
      { ta: 'சத்தம் வேண்டாம்', en: 'sound off', does: 'Stops spoken replies', doesTa: 'பதில் பேசாது' },
      { ta: 'இங்கிலீஷ்', en: 'tamil', does: 'Switches the voice language', doesTa: 'மொழி மாறும்' },
    ],
  },
  {
    title: 'GST',
    titleTa: 'ஜிஎஸ்டி',
    examples: [
      { ta: 'வரி உள்ளே', en: 'tax inclusive', does: 'Rate already includes GST', doesTa: 'ரேட்ல வரி உள்ளடக்கம்' },
      { ta: 'வரி தனியா', en: 'tax exclusive', does: 'GST added on top', doesTa: 'வரி தனியா சேரும்' },
    ],
  },
  {
    title: 'Move around (works on every screen)',
    titleTa: 'எல்லா பக்கத்திலும்',
    examples: [
      { ta: 'முகப்பு', en: 'dashboard', does: 'Dashboard', doesTa: 'முகப்பு' },
      { ta: 'பொருட்கள்', en: 'items', does: 'Items tab', doesTa: 'பொருட்கள்' },
      { ta: 'வாடிக்கையாளர்', en: 'parties', does: 'Parties tab', doesTa: 'வாடிக்கையாளர்' },
      { ta: 'புது விற்பனை', en: 'new sale', does: 'New sale invoice', doesTa: 'புது விற்பனை பில்' },
      { ta: 'ரிட்டர்ன்', en: 'return', does: 'Sale return (on a bill, fills it in)', doesTa: 'விற்பனை ரிட்டர்ன்' },
      { ta: 'பில் பட்டியல்', en: 'all bills', does: 'Every bill, with search', doesTa: 'எல்லா பில், தேடலோட' },
      { ta: 'நிலுவை', en: 'outstanding', does: 'Outstanding report', doesTa: 'நிலுவை அறிக்கை' },
      { ta: 'லாபம்', en: 'profit', does: 'Profit report', doesTa: 'லாப அறிக்கை' },
      { ta: 'செலவு', en: 'expenses', does: 'Expense list', doesTa: 'செலவு பட்டியல்' },
      { ta: 'புது செலவு', en: 'new expense', does: 'Records an expense', doesTa: 'செலவு பதிவு' },
      { ta: 'பின்னால', en: 'back', does: 'Goes back', doesTa: 'பின்னால' },
    ],
  },
  {
    title: 'Invoice & reports',
    titleTa: 'பில் & அறிக்கை',
    examples: [
      { ta: 'பிரிண்ட்', en: 'print', does: 'Opens the print dialog', doesTa: 'பிரிண்ட்' },
      { ta: 'ஷேர்', en: 'share', does: 'Shares the PDF', doesTa: 'PDF அனுப்பும்' },
      { ta: 'எக்செல்', en: 'excel', does: 'Exports the report to Excel', doesTa: 'எக்செல் ஏற்றுமதி' },
      { ta: 'மொத்தம்', en: 'total', does: 'Reads the report summary aloud', doesTa: 'அறிக்கை சுருக்கத்தை சொல்லும்' },
    ],
  },
];
