// Tamil for the "tabs" area. Key = the exact English string passed to t().
// Keep placeholders like {n} identical in the Tamil text.
export const tabs: Record<string, string> = {
  // ── Dashboard ──────────────────────────────────────────────────────────────
  '+ New Sale': '+ புது விற்பனை',
  '+ New Purchase': '+ புது கொள்முதல்',
  '− Expense': '− செலவு',
  'Expense List': 'செலவு பட்டியல்',
  "Today's sales": 'இன்றைய விற்பனை',
  '⚠ Your bills are only on this phone': '⚠ உங்கள் பில்கள் இந்த போனில் மட்டும் தான் உள்ளன',
  'If the phone is lost or the app is removed, they are gone. Sign in with Google in Settings to keep a copy in your Drive ›':
    'போன் தொலைந்தாலோ ஆப் நீக்கப்பட்டாலோ எல்லாம் போய்விடும். அமைப்புகளில் Google-ல் உள்நுழைந்து Drive-ல் ஒரு காப்பி வைத்துக்கொள்ளுங்கள் ›',
  '1 item to reorder ›': '1 பொருள் மீண்டும் வாங்க வேண்டும் ›',
  '{n} items to reorder ›': '{n} பொருட்கள் மீண்டும் வாங்க வேண்டும் ›',
  Recent: 'சமீபத்தியவை',
  'All bills ›': 'எல்லா பில்களும் ›',
  'No invoices yet.\nTap “New Sale” to create your first.':
    'இன்னும் பில் இல்லை.\nமுதல் பில் போட “புது விற்பனை” தட்டுங்கள்.',
  // Bill type tags on the recent list
  Quote: 'விலைப்புள்ளி',
  Return: 'ரிட்டர்ன்',
  'Pur. return': 'கொள். ரிட்டர்ன்',

  // ── Items ──────────────────────────────────────────────────────────────────
  'No item has this barcode': 'இந்த பார்கோடில் பொருள் இல்லை',
  'Add a new item for {code}?': '{code}-க்கு புது பொருள் சேர்க்கவா?',
  'Not now': 'இப்போ வேண்டாம்',
  'Search items by name': 'பெயரால் பொருளைத் தேடு',
  'Scan barcode': 'பார்கோடு ஸ்கேன்',
  'No items yet.\nTap + to add your first item.': 'இன்னும் பொருள் இல்லை.\nமுதல் பொருளைச் சேர்க்க + தட்டுங்கள்.',
  'Out of stock': 'ஸ்டாக் இல்லை',
  'Running low': 'ஸ்டாக் குறைவு',
  'in stock': 'ஸ்டாக்கில் உள்ளது',

  // ── Parties ────────────────────────────────────────────────────────────────
  'No parties yet.\nTap + to add your first party.': 'இன்னும் நபர் இல்லை.\nமுதல் நபரைச் சேர்க்க + தட்டுங்கள்.',

  // ── Quick Bill ─────────────────────────────────────────────────────────────
  'Nothing matches “{q}”.': '“{q}” எதுவும் பொருந்தவில்லை.',
  'Added {name}.': '{name} சேர்த்தாச்சு.',
  'Clear the bill?': 'பில்லை அழிக்கவா?',
  'All selected items will be removed.': 'தேர்ந்தெடுத்த எல்லா பொருட்களும் நீக்கப்படும்.',
  'Could not bill': 'பில் போட முடியவில்லை',
  'Search and press Enter — or tap 🎙 and say “ரெண்டு டீ”': 'தேடி Enter அழுத்துங்க — அல்லது 🎙 தட்டி “ரெண்டு டீ” சொல்லுங்க',
  'GST incl.': 'GST உட்பட',
  'GST extra': 'GST தனி',
  'No items yet.\nAdd items in the Items tab first.': 'இன்னும் பொருள் இல்லை.\nமுதலில் பொருட்கள் பக்கத்தில் சேர்க்கவும்.',
  '1 item · view': '1 பொருள் · பார்',
  '{n} items · view': '{n} பொருட்கள் · பார்',
  Cart: 'கார்ட்',
  'Clear all': 'எல்லாம் அழி',
  'Subtotal {sub} · Tax {tax}': 'கூட்டுத்தொகை {sub} · வரி {tax}',
  'Bill & print — {amount}': 'பில் & பிரிண்ட் — {amount}',
  'Tax extra (exclusive)': 'வரி தனி (விலைக்கு மேல்)',
  'Tax included in rate': 'வரி விலைக்குள்',

  // ── Reports list ───────────────────────────────────────────────────────────
  'Day Book': 'தினசரி கணக்கு',
  'Everything that happened on one day': 'ஒரு நாளில் நடந்த எல்லாம்',
  'Sale Report': 'விற்பனை அறிக்கை',
  'Sales over a date range': 'தேதி வரம்பில் விற்பனை',
  'Item-wise Sales': 'பொருள் வாரி விற்பனை',
  'What sells, by quantity and value': 'எது விற்கிறது — அளவும் மதிப்பும்',
  'Purchase Report': 'கொள்முதல் அறிக்கை',
  'What was bought, and from whom': 'என்ன வாங்கினோம், யாரிடம்',
  'Profit Report': 'லாப அறிக்கை',
  'Sales minus cost and expenses, item-wise': 'விற்பனை கழித்தல் அடக்கவிலை & செலவு, பொருள் வாரி',
  'Party Outstanding': 'நபர் நிலுவை',
  'Who owes you, who you owe': 'யார் தர வேண்டும், யாருக்கு தர வேண்டும்',
  Aging: 'நிலுவை வயது',
  'How long money has been owed — to you, or by you': 'பணம் எவ்வளவு நாளாக நிலுவையில் — உங்களுக்கு அல்லது உங்களால்',
  'Stock Summary': 'ஸ்டாக் சுருக்கம்',
  'On-hand quantity and value': 'கையிருப்பு அளவும் மதிப்பும்',
  'GST Summary': 'GST சுருக்கம்',
  'Output vs input tax, and the GSTR-1 file for your CA': 'விற்பனை வரி vs கொள்முதல் வரி, உங்கள் CA-க்கு GSTR-1 கோப்பு',
  'Tally Export': 'Tally ஏற்றுமதி',
  'One file your accountant imports straight into Tally': 'உங்கள் கணக்காளர் நேரடியாக Tally-ல் ஏற்றும் ஒரே கோப்பு',
  'Cash & Bank': 'ரொக்கம் & வங்கி',
  'What each cash box and account holds': 'ஒவ்வொரு கல்லா பெட்டியிலும் கணக்கிலும் உள்ள தொகை',
  'Payment History': 'பண வரலாறு',
  'Every payment in and out': 'வந்த, போன எல்லா பணமும்',
  Expenses: 'செலவுகள்',
  'Rent, power, wages and other overheads': 'வாடகை, கரண்ட், சம்பளம் மற்றும் பிற செலவுகள்',

  // ── Settings ───────────────────────────────────────────────────────────────
  'App language': 'ஆப் மொழி',
  'Changes the words on screen. Printed bills and reports stay in English.':
    'திரையில் உள்ள சொற்களை மாற்றும். பிரிண்ட் பில்களும் அறிக்கைகளும் ஆங்கிலத்திலேயே இருக்கும்.',
  'The shop’s profile, bill printing, GST and numbering can be changed by an owner only.':
    'கடை விவரம், பில் பிரிண்ட், GST, பில் எண் — இவற்றை உரிமையாளர் மட்டுமே மாற்ற முடியும்.',
  'Signed in': 'உள்நுழைந்துள்ளீர்கள்',
  'This shop’s online books': 'இந்த கடையின் ஆன்லைன் கணக்கு',
  'This phone’s books': 'இந்த போனின் கணக்கு',
  'Business profile': 'கடை விவரம்',
  'Shown on the invoice PDFs you share.': 'நீங்கள் அனுப்பும் பில் PDF-ல் வரும்.',
  'Business name': 'கடை பெயர்',
  'My Business': 'என் கடை',
  'Business address': 'கடை முகவரி',
  'Your own state. A bill to the same state prints CGST + SGST; anywhere else prints IGST.':
    'உங்கள் மாநிலம். அதே மாநிலத்துக்கு பில் என்றால் CGST + SGST; வேறு மாநிலம் என்றால் IGST.',
  'Contact number': 'தொடர்பு எண்',
  'Invoice prefix (sales)': 'பில் முன்னொட்டு (விற்பனை)',
  'Sale invoices are numbered like PREFIX/2026-27/001. Leave blank for “INV”.':
    'விற்பனை பில் எண் PREFIX/2026-27/001 போல வரும். காலியாக விட்டால் “INV”.',
  'Start sale numbers from': 'விற்பனை எண் இதிலிருந்து தொடங்கு',
  'Moving from another app? Enter your next bill number (e.g. 501) and this year’s sales carry on from there. Numbering starts again at 001 next April.':
    'வேறு ஆப்பிலிருந்து வருகிறீர்களா? அடுத்த பில் எண்ணை (எ.கா. 501) போடுங்கள், இந்த ஆண்டு விற்பனை அங்கிருந்து தொடரும். அடுத்த ஏப்ரலில் மீண்டும் 001-ல் தொடங்கும்.',
  Logo: 'லோகோ',
  Signature: 'கையொப்பம்',
  'Terms on the bill': 'பில்லில் நிபந்தனைகள்',
  'Goods once sold will not be taken back.': 'விற்ற பொருள் திரும்ப பெறப்படாது.',
  'UPI id': 'UPI ஐடி',
  'Printed on the bill as a scan-to-pay code, with the amount already in it. Leave blank for no code.':
    'தொகையுடன் ஸ்கேன் செய்து பணம் கட்டும் QR பில்லில் வரும். வேண்டாம் என்றால் காலியாக விடுங்கள்.',
  'Save profile': 'விவரம் சேமி',
  Saved: 'சேமித்தது',
  'Business profile updated. It will appear on invoice PDFs.': 'கடை விவரம் சேமிக்கப்பட்டது. பில் PDF-ல் வரும்.',
  'Could not use that image': 'அந்த படத்தை பயன்படுத்த முடியவில்லை',
  'GST entry method': 'GST போடும் முறை',
  'The default for new bills. Counter shops usually price with GST already inside the rate; B2B invoicing usually adds it on top. You can still flip it on any single invoice.':
    'புது பில்களுக்கான இயல்பு முறை. கவுண்டர் கடைகளில் பொதுவாக விலையிலேயே GST இருக்கும்; B2B பில்களில் மேலே சேர்ப்பார்கள். எந்த பில்லிலும் தனியாக மாற்றலாம்.',
  'Example: ₹118 rate at 18% → taxable ₹100 + GST ₹18. Customer pays ₹118.':
    'உதாரணம்: ₹118 விலை, 18% → வரிக்குரிய ₹100 + GST ₹18. வாடிக்கையாளர் ₹118 கட்டுவார்.',
  'Example: ₹100 rate at 18% → GST ₹18. Customer pays ₹118.':
    'உதாரணம்: ₹100 விலை, 18% → GST ₹18. வாடிக்கையாளர் ₹118 கட்டுவார்.',
  'Paper size': 'பேப்பர் அளவு',
  'A4 sheet': 'A4 தாள்',
  '58mm thermal': '58mm தெர்மல்',
  '80mm thermal': '80mm தெர்மல்',
  'Choose the roll your counter printer takes — 58mm is the small one, 80mm the wider. Every Print and Share button then uses it; A4 stays the full tax invoice sheet.':
    'உங்கள் கவுண்டர் பிரிண்டரின் ரோல் அளவைத் தேர்வு செய்யுங்கள் — 58mm சிறியது, 80mm அகலமானது. எல்லா பிரிண்ட், ஷேர் பட்டன்களும் இதையே பயன்படுத்தும்; A4 முழு வரி பில் தாள்.',
  'Voice commands': 'குரல் கட்டளை',
  '🎙  Mic button on': '🎙  மைக் பட்டன் ஆன்',
  '🚫  Mic button hidden': '🚫  மைக் பட்டன் மறைவு',
  'The floating mic is off every screen. Turn it back on here whenever you want it.':
    'மைக் எல்லா திரையிலிருந்தும் மறைந்துள்ளது. வேண்டும்போது இங்கே மீண்டும் ஆன் செய்யுங்கள்.',
  'Tap the 🎙 button on any screen and speak. Say “உதவி” / “help” for the full list.':
    'எந்த திரையிலும் 🎙 தட்டி பேசுங்கள். முழு பட்டியலுக்கு “உதவி” என்று சொல்லுங்கள்.',
  'Not available in Expo Go — the microphone needs the development build. See VOICE-SETUP.md.':
    'Expo Go-ல் கிடைக்காது — மைக்குக்கு development build தேவை. VOICE-SETUP.md பாருங்கள்.',
  '🔊  Speaks confirmations': '🔊  பதில் பேசும்',
  '🔇  Silent confirmations': '🔇  அமைதியாக',
  'What can I say?': 'என்ன சொல்லலாம்?',
  Licence: 'லைசென்ஸ்',
  'This copy is tied to this phone. Send the System ID to your vendor to renew.':
    'இந்த காப்பி இந்த போனுக்கு மட்டும். புதுப்பிக்க System ID-ஐ விற்பனையாளருக்கு அனுப்புங்கள்.',
  'Signed in to this shop’s online books.': 'இந்த கடையின் ஆன்லைன் கணக்கில் உள்நுழைந்துள்ளீர்கள்.',
  'Account & lock': 'கணக்கு & பூட்டு',
  'Stored only on this phone — restoring a backup never changes your login.':
    'இந்த போனில் மட்டும் சேமிக்கப்படுகிறது — பேக்அப் ரீஸ்டோர் செய்தாலும் உங்கள் லாகின் மாறாது.',
  '🔒  App lock on — {kind}': '🔒  ஆப் பூட்டு ஆன் — {kind}',
  '🔓  App lock off': '🔓  ஆப் பூட்டு ஆஃப்',
  'Face unlock': 'முக அடையாளம்',
  Fingerprint: 'கைரேகை',
  'Screen lock': 'ஸ்கிரீன் லாக்',
  'Asks for your phone’s fingerprint/PIN when the app opens and each time you come back to it.':
    'ஆப் திறக்கும்போதும் மீண்டும் வரும்போதும் போனின் கைரேகை/PIN கேட்கும்.',
  'Set a fingerprint, PIN or pattern on your phone first to use this.':
    'இதைப் பயன்படுத்த முதலில் போனில் கைரேகை, PIN அல்லது பேட்டர்ன் வையுங்கள்.',
  'No screen lock set': 'ஸ்கிரீன் லாக் இல்லை',
  'Set a fingerprint, PIN or pattern in your phone Settings first, then enable this.':
    'முதலில் போன் அமைப்புகளில் கைரேகை, PIN அல்லது பேட்டர்ன் வையுங்கள், பிறகு இதை ஆன் செய்யுங்கள்.',
  'Automatic backup': 'தானியங்கி பேக்அப்',
  '✓  Automatic backup on': '✓  தானியங்கி பேக்அப் ஆன்',
  'Automatic backup off': 'தானியங்கி பேக்அப் ஆஃப்',
  'How many times a day?': 'ஒரு நாளில் எத்தனை முறை?',
  'Once a day': 'நாளுக்கு ஒரு முறை',
  'Twice a day (12 hrs)': 'நாளுக்கு 2 முறை (12 மணி)',
  '4 times a day (6 hrs)': 'நாளுக்கு 4 முறை (6 மணி)',
  '6 times a day (4 hrs)': 'நாளுக்கு 6 முறை (4 மணி)',
  '12 times a day (2 hrs)': 'நாளுக்கு 12 முறை (2 மணி)',
  'Every hour': 'ஒவ்வொரு மணி நேரமும்',
  'Each run saves a snapshot on the phone (last 10 kept) and uploads it to Google Drive when an account is connected below.':
    'ஒவ்வொரு முறையும் போனில் ஒரு காப்பி சேமிக்கும் (கடைசி 10 வைக்கப்படும்); கீழே Google கணக்கு இணைத்திருந்தால் Drive-க்கும் ஏற்றும்.',
  'Last backup: {when}': 'கடைசி பேக்அப்: {when}',
  'No automatic backup has run yet.': 'இன்னும் தானியங்கி பேக்அப் நடக்கவில்லை.',
  'Android stops apps in the background, so a due backup runs the next time you open the app (and while it stays open).':
    'Android பின்னணியில் ஆப்களை நிறுத்தும், அதனால் நிலுவை பேக்அப் அடுத்த முறை ஆப் திறக்கும்போது நடக்கும் (திறந்திருக்கும் வரை).',
  '✓  Ask to back up when closing': '✓  மூடும்போது பேக்அப் கேள்',
  'Do not ask when closing': 'மூடும்போது கேட்க வேண்டாம்',
  'Pressing back to close the app asks whether to back up first, so a day’s billing is never left only on the phone overnight.':
    'பின் பட்டனால் ஆப் மூடும்போது முதலில் பேக்அப் வேண்டுமா என்று கேட்கும் — அன்றைய பில்கள் இரவு முழுக்க போனில் மட்டும் இருக்காது.',
  'Back up now': 'இப்போ பேக்அப்',
  'Backup done': 'பேக்அப் முடிந்தது',
  'Backup failed': 'பேக்அப் தோல்வி',
  'Google Drive backup': 'Google Drive பேக்அப்',
  'Like WhatsApp: sign in once and every backup goes to your own Google Drive. After a reinstall, sign in with the same account and your data comes straight back.':
    'WhatsApp போல: ஒரு முறை உள்நுழைந்தால் எல்லா பேக்அப்பும் உங்கள் Google Drive-க்கு போகும். மீண்டும் நிறுவிய பின் அதே கணக்கில் உள்நுழைந்தால் தரவு திரும்ப வரும்.',
  'Google account connected': 'Google கணக்கு இணைந்தது',
  'Backups live in a “Benesys Billing Backups” folder in that account. The app can only see the files it made there — nothing else in your Drive.':
    'பேக்அப்கள் அந்த கணக்கில் “Benesys Billing Backups” ஃபோல்டரில் இருக்கும். ஆப் தான் உருவாக்கிய கோப்புகளை மட்டுமே பார்க்கும் — Drive-ல் வேறு எதையும் அல்ல.',
  'Back up to Drive now': 'இப்போ Drive-க்கு பேக்அப்',
  'Restore from Drive': 'Drive-லிருந்து ரீஸ்டோர்',
  'Disconnect this Google account': 'இந்த Google கணக்கை துண்டி',
  '⚠ Right now every backup is only on this phone. If the phone is lost, broken or the app is uninstalled, your bills go with it. Sign in once to keep a copy in Drive.':
    '⚠ இப்போது எல்லா பேக்அப்பும் இந்த போனில் மட்டுமே. போன் தொலைந்தாலோ, உடைந்தாலோ, ஆப் நீக்கப்பட்டாலோ பில்களும் போய்விடும். Drive-ல் காப்பி வைக்க ஒரு முறை உள்நுழையுங்கள்.',
  'Sign in with Google': 'Google-ல் உள்நுழை',
  'Nothing leaves the phone until you sign in.': 'நீங்கள் உள்நுழையும் வரை எதுவும் போனை விட்டு போகாது.',
  'Needs a one-time Google client ID — see DRIVE-SETUP.md, then paste it below.':
    'ஒரு முறை Google client ID தேவை — DRIVE-SETUP.md பார்த்து கீழே ஒட்டுங்கள்.',
  'Hide Google client ID': 'Google client ID மறை',
  'Google client ID (advanced)': 'Google client ID (மேம்பட்டது)',
  'From your own Google Cloud project (Android client, package com.benesys.billingapp). Steps are in DRIVE-SETUP.md. Not a secret — Android clients have none.':
    'உங்கள் சொந்த Google Cloud project-லிருந்து (Android client, package com.benesys.billingapp). படிகள் DRIVE-SETUP.md-ல் உள்ளன. இது ரகசியம் அல்ல.',
  'Google Drive connected': 'Google Drive இணைந்தது',
  'Backups will go to {email}. Sign in with this same account after a reinstall to get your data back.':
    'பேக்அப்கள் {email}-க்கு போகும். மீண்டும் நிறுவிய பின் தரவு திரும்ப பெற இதே கணக்கில் உள்நுழையுங்கள்.',
  'Could not connect': 'இணைக்க முடியவில்லை',
  'Disconnect Google Drive?': 'Google Drive-ஐ துண்டிக்கவா?',
  'Backups already in Drive stay there. New backups will only be kept on this phone.':
    'Drive-ல் உள்ள பேக்அப்கள் அங்கேயே இருக்கும். புது பேக்அப்கள் இந்த போனில் மட்டும் இருக்கும்.',
  Disconnect: 'துண்டி',
  Uploaded: 'ஏற்றப்பட்டது',
  '{name} is in your Google Drive.': '{name} உங்கள் Google Drive-ல் உள்ளது.',
  'Upload failed': 'ஏற்றுதல் தோல்வி',
  'Local backup & restore': 'போனில் பேக்அப் & ரீஸ்டோர்',
  'Save a JSON copy of everything wherever you like — a memory card, Drive, WhatsApp to yourself. Restore replaces everything from such a file.':
    'எல்லாவற்றின் JSON காப்பியை விரும்பிய இடத்தில் சேமியுங்கள் — மெமரி கார்டு, Drive, உங்களுக்கே WhatsApp. ரீஸ்டோர் அந்த கோப்பிலிருந்து எல்லாவற்றையும் மாற்றும்.',
  'Save backup file': 'பேக்அப் கோப்பு சேமி',
  'Restore from file': 'கோப்பிலிருந்து ரீஸ்டோர்',
  'Restore and overwrite?': 'ரீஸ்டோர் செய்து மாற்றவா?',
  'This will DELETE all current data and replace it with "{file}". This cannot be undone.':
    'இப்போதுள்ள எல்லா தரவும் நீக்கப்பட்டு "{file}" கொண்டு மாற்றப்படும். இதை திரும்ப பெற முடியாது.',
  Restored: 'ரீஸ்டோர் ஆனது',
  '{parties} parties, {items} items, {invoices} invoices, {payments} payments loaded.':
    '{parties} நபர்கள், {items} பொருட்கள், {invoices} பில்கள், {payments} பணப் பதிவுகள் ஏற்றப்பட்டன.',
  'Restore failed': 'ரீஸ்டோர் தோல்வி',
  'Sign out?': 'வெளியேறவா?',
  'You will need your password to get back in.': 'மீண்டும் உள்ளே வர கடவுச்சொல் தேவை.',
  'Sign out? You will need your password to get back in.': 'வெளியேறவா? மீண்டும் உள்ளே வர கடவுச்சொல் தேவை.',
  'Signed out': 'வெளியேறியது',
  'Close and reopen the app to sign in again.': 'மீண்டும் உள்நுழைய ஆப்பை மூடி திறங்கள்.',

  // ── Sign in / lock (AuthGate) ──────────────────────────────────────────────
  'Billing App is locked': 'Billing App பூட்டப்பட்டுள்ளது',
  'Unlock cancelled or not recognised.': 'திறப்பது ரத்தானது அல்லது அடையாளம் தெரியவில்லை.',
  Unlock: 'திற',
  'Passwords do not match.': 'கடவுச்சொற்கள் பொருந்தவில்லை.',
  'No account on this device yet.': 'இந்த போனில் இன்னும் கணக்கு இல்லை.',
  'Restore your data?': 'உங்கள் தரவை ரீஸ்டோர் செய்யவா?',
  'If you used this app before and backed up to Google Drive, sign in with that same Google account and everything comes back.':
    'முன்பு இந்த ஆப்பை பயன்படுத்தி Google Drive-ல் பேக்அப் எடுத்திருந்தால், அதே Google கணக்கில் உள்நுழைந்தால் எல்லாம் திரும்ப வரும்.',
  'Start fresh': 'புதிதாகத் தொடங்கு',
  'Set a new password': 'புது கடவுச்சொல் வை',
  'Create your account': 'உங்கள் கணக்கை உருவாக்கு',
  'Welcome back': 'மீண்டும் வருக',
  'Nobody can email you a reset — nothing leaves this phone. Instead the phone itself will ask for your fingerprint, PIN or pattern, and then you choose a new password.':
    'யாரும் ரீசெட் ஈமெயில் அனுப்ப முடியாது — எதுவும் இந்த போனை விட்டு போவதில்லை. பதிலாக போனே கைரேகை, PIN அல்லது பேட்டர்ன் கேட்கும், பிறகு புது கடவுச்சொல் தேர்வு செய்யலாம்.',
  'Your login stays on this phone — there is no server. Your data can be backed up to your own Google Drive.':
    'உங்கள் லாகின் இந்த போனில் மட்டும் — சர்வர் இல்லை. தரவை உங்கள் Google Drive-ல் பேக்அப் செய்யலாம்.',
  'Sign in to open your shop data.': 'கடை தரவைத் திறக்க உள்நுழையுங்கள்.',
  'Username or email': 'பயனர் பெயர் அல்லது ஈமெயில்',
  'New password': 'புது கடவுச்சொல்',
  'Confirm password': 'கடவுச்சொல் உறுதி செய்',
  '🔒  Check phone lock & save': '🔒  போன் பூட்டு சரிபார்த்து சேமி',
  'Create account': 'கணக்கு உருவாக்கு',
  'Back to sign in': 'உள்நுழைவுக்கு திரும்பு',
  'Forgot your password?': 'கடவுச்சொல் மறந்துவிட்டதா?',
  'Nothing leaves this phone, so nobody can email you a reset. If you forget it, the phone’s own fingerprint or PIN can set a new one — so keep a screen lock on this phone, and write the password down somewhere safe anyway.':
    'எதுவும் இந்த போனை விட்டு போவதில்லை, அதனால் ரீசெட் ஈமெயில் வராது. மறந்தால் போனின் கைரேகை அல்லது PIN மூலம் புதியது வைக்கலாம் — அதனால் போனில் ஸ்கிரீன் லாக் வையுங்கள், கடவுச்சொல்லை பாதுகாப்பான இடத்தில் எழுதியும் வையுங்கள்.',
  '☁  Restore from Google Drive': '☁  Google Drive-லிருந்து ரீஸ்டோர்',
  'Already have an account? Sign in': 'ஏற்கனவே கணக்கு உள்ளதா? உள்நுழை',
  'Create a new account instead': 'புது கணக்கு உருவாக்கு',
  'Your data is back.': 'உங்கள் தரவு திரும்ப வந்தது.',
  'Your data is back. Create an account here to open it.': 'உங்கள் தரவு திரும்ப வந்தது. திறக்க இங்கே கணக்கு உருவாக்குங்கள்.',

  // ── Online mode sign in (AuthGate.web) ─────────────────────────────────────
  'Cannot reach the server': 'சர்வரை அணுக முடியவில்லை',
  'Make sure start-web.bat is running on the shop computer.': 'கடை கம்ப்யூட்டரில் start-web.bat ஓடுகிறதா என்று பாருங்கள்.',
  'Shop name is required.': 'கடை பெயர் தேவை.',
  'Register your shop': 'உங்கள் கடையைப் பதிவு செய்',
  'Creates the shop on this server with you as its owner. Add your staff from Settings afterwards.':
    'இந்த சர்வரில் உங்களை உரிமையாளராகக் கொண்டு கடையை உருவாக்கும். பிறகு அமைப்புகளில் ஊழியர்களைச் சேர்க்கலாம்.',
  'Shop name': 'கடை பெயர்',
  'Register shop': 'கடை பதிவு',
  'Staff: ask the shop owner — they set it in Settings → People.':
    'ஊழியர்: கடை உரிமையாளரிடம் கேளுங்கள் — அவர் அமைப்புகள் → நபர்கள்-ல் மாற்றுவார்.',
  'Owner: on the computer that runs the books, double-click': 'உரிமையாளர்: கணக்கு ஓடும் கம்ப்யூட்டரில் இதை இரு முறை கிளிக் செய்யுங்கள்:',
  '(next to start-web.bat). It asks which account and what the new password should be.':
    '(start-web.bat அருகில்). எந்த கணக்கு, புது கடவுச்சொல் என்ன என்று கேட்கும்.',
  'New shop? Register it here': 'புது கடையா? இங்கே பதிவு செய்',

  // ── Close-the-app backup ───────────────────────────────────────────────────
  'Stay in the app': 'ஆப்பிலேயே இரு',
  'Close anyway': 'பரவாயில்லை, மூடு',
  'Backed up on the phone only': 'போனில் மட்டும் பேக்அப் ஆனது',
  'Close Billing App?': 'Billing App-ஐ மூடவா?',
  'Do you want to back up everything before closing?': 'மூடும் முன் எல்லாவற்றையும் பேக்அப் எடுக்கவா?',
  'Back up & close': 'பேக்அப் எடுத்து மூடு',
  'Backing up before closing…': 'மூடும் முன் பேக்அப் எடுக்கிறது…',

  // ── Small shared components ────────────────────────────────────────────────
  'Hold the barcode inside the box': 'பார்கோடை பெட்டிக்குள் பிடியுங்கள்',
  'The camera is switched off': 'கேமரா ஆஃப் ஆக உள்ளது',
  'Opening the camera…': 'கேமரா திறக்கிறது…',
  "Scanning needs the camera. Turn it on for Billing App in your phone's Settings, or just type the item name instead.":
    'ஸ்கேன் செய்ய கேமரா தேவை. போன் அமைப்புகளில் Billing App-க்கு அனுமதி கொடுங்கள், அல்லது பொருள் பெயரை டைப் செய்யுங்கள்.',
  Books: 'கணக்கு',
  'In books': 'கணக்கில்',
  'Not in books': 'கணக்கில் இல்லை',
  'Stays out of the Tally export and the GST return. Your own reports still count it.':
    'Tally ஏற்றுமதியிலும் GST ரிட்டர்னிலும் வராது. உங்கள் சொந்த அறிக்கைகளில் கணக்கில் வரும்.',
  '⬇  Export to Excel': '⬇  Excel-க்கு ஏற்றுமதி',
  'Nothing to choose from yet.': 'தேர்வு செய்ய இன்னும் எதுவும் இல்லை.',
  'Search or type a new value': 'தேடு அல்லது புதியதை டைப் செய்',
  'Use “{value}”': '“{value}” பயன்படுத்து',

  // ── Online mode: screen guard, people, server backup ──────────────────────
  'Not your screen': 'உங்களுக்கான திரை அல்ல',
  '{screen} is switched off for your account. Ask the shop owner if you need it.':
    'உங்கள் கணக்குக்கு {screen} ஆஃப் செய்யப்பட்டுள்ளது. தேவையென்றால் கடை உரிமையாளரிடம் கேளுங்கள்.',
  'Go to {screen}': '{screen}-க்கு போ',
  'Go to Settings': 'அமைப்புகளுக்கு போ',
  'Server backup': 'சர்வர் பேக்அப்',
  'The server copies all the books into a backup file every day it is switched on, and keeps the last 30. To put one back, double-click restore-backup.bat on the shop computer.':
    'சர்வர் ஆன் ஆகும் ஒவ்வொரு நாளும் எல்லா கணக்கையும் பேக்அப் கோப்பில் சேமித்து, கடைசி 30-ஐ வைக்கும். ரீஸ்டோர் செய்ய கடை கம்ப்யூட்டரில் restore-backup.bat-ஐ இரு முறை கிளிக் செய்யுங்கள்.',
  'No backup has been taken yet.': 'இன்னும் பேக்அப் எடுக்கவில்லை.',
  'The last backup failed ({when}):': 'கடைசி பேக்அப் தோல்வி ({when}):',
  'Saved in {dir}': '{dir}-ல் சேமிக்கப்பட்டது',
  'all screens': 'எல்லா திரைகளும்',
  'no screens': 'திரை இல்லை',
  '{n} of {total} screens': '{total}-ல் {n} திரைகள்',
  'People — who can sign in': 'நபர்கள் — யார் உள்நுழையலாம்',
  'Everyone here bills into the same books. Staff do the billing; owners can also manage this list. Switching someone off, or giving them a new password, signs them out everywhere.':
    'இங்கே எல்லோரும் ஒரே கணக்கில் பில் போடுவார்கள். ஊழியர்கள் பில் போடுவார்கள்; உரிமையாளர்கள் இந்த பட்டியலையும் நிர்வகிக்கலாம். ஒருவரை ஆஃப் செய்தாலோ புது கடவுச்சொல் கொடுத்தாலோ எல்லா இடத்திலும் வெளியேற்றப்படுவார்.',
  'Add a person': 'ஒருவரைச் சேர்',
  'Screens they can open': 'திறக்கக்கூடிய திரைகள்',
  'Settings stays open to everyone — it is where they sign out and change their own password.':
    'அமைப்புகள் எல்லோருக்கும் திறந்திருக்கும் — அங்கே தான் வெளியேறவும் கடவுச்சொல் மாற்றவும் முடியும்.',
  "Today’s totals, dues and low stock": 'இன்றைய மொத்தம், நிலுவை, குறைந்த ஸ்டாக்',
  'Billing, invoices and payments': 'பில், இன்வாய்ஸ், பணம்',
  'Customers, suppliers and their ledgers': 'வாடிக்கையாளர், சப்ளையர், அவர்களின் கணக்கு',
  'Stock list, prices and adjustments': 'ஸ்டாக் பட்டியல், விலை, மாற்றங்கள்',
  'Sales, profit, GST and every other report': 'விற்பனை, லாபம், GST மற்றும் எல்லா அறிக்கைகளும்',
  '(you)': '(நீங்கள்)',
  Owner: 'உரிமையாளர்',
  Staff: 'ஊழியர்',
  'switched off': 'ஆஃப்',
  'Display name': 'காட்டும் பெயர்',
  'Name on the bill': 'பில்லில் வரும் பெயர்',
  'Save name': 'பெயர் சேமி',
  'Set password': 'கடவுச்சொல் வை',
  'An owner opens every screen — that is what owner means.': 'உரிமையாளர் எல்லா திரையையும் திறக்கலாம்.',
  'Save screens': 'திரைகளைச் சேமி',
  'You cannot take away your own owner access or switch yourself off — ask another owner.':
    'உங்கள் சொந்த உரிமையாளர் அனுமதியை எடுக்கவோ உங்களையே ஆஃப் செய்யவோ முடியாது — வேறு உரிமையாளரிடம் கேளுங்கள்.',
  'Make staff': 'ஊழியராக்கு',
  'Make owner': 'உரிமையாளராக்கு',
  'Switch off': 'ஆஃப் செய்',
  'Switch back on': 'மீண்டும் ஆன் செய்',
  'They sign in with this username and password. Tell it to them — nobody can read it back later, it can only be set again.':
    'இந்த பயனர் பெயர், கடவுச்சொல் மூலம் உள்நுழைவார்கள். அவர்களிடம் சொல்லுங்கள் — பிறகு யாரும் பார்க்க முடியாது, மீண்டும் வைக்க மட்டுமே முடியும்.',
  'at least 8 characters': 'குறைந்தது 8 எழுத்துகள்',
  '✓  Owner — can also manage people': '✓  உரிமையாளர் — நபர்களையும் நிர்வகிக்கலாம்',
  'Staff — billing only': 'ஊழியர் — பில் மட்டும்',

  // ── Licence (gate + Settings card) ─────────────────────────────────────────
  'Activate Billing App': 'Billing App-ஐ ஆக்டிவேட் செய்',
  "Send the System ID below to {vendor}. You'll get a licence back — paste it in the box below and tap Activate.":
    'கீழே உள்ள System ID-ஐ {vendor}-க்கு அனுப்புங்கள். லைசென்ஸ் வரும் — கீழே உள்ள பெட்டியில் ஒட்டி ஆக்டிவேட் தட்டுங்கள்.',
  'Licence expired': 'லைசென்ஸ் காலாவதி',
  'Your licence has run out. Send the System ID to {vendor} for a renewal, then paste it below — your shop data is untouched and comes straight back.':
    'உங்கள் லைசென்ஸ் முடிந்துவிட்டது. புதுப்பிக்க System ID-ஐ {vendor}-க்கு அனுப்பி, வந்ததை கீழே ஒட்டுங்கள் — கடை தரவு அப்படியே இருக்கும்.',
  'Free trial over': 'இலவச சோதனை முடிந்தது',
  'Your 7-day free trial has ended. Send the System ID below to {vendor} for a licence, then paste it below — everything you entered during the trial is kept.':
    'உங்கள் 7 நாள் இலவச சோதனை முடிந்தது. லைசென்ஸுக்கு கீழே உள்ள System ID-ஐ {vendor}-க்கு அனுப்பி, வந்ததை கீழே ஒட்டுங்கள் — சோதனையில் போட்ட எல்லாம் அப்படியே இருக்கும்.',
  "Phone's date was changed": 'போனின் தேதி மாற்றப்பட்டது',
  'The date on this phone is earlier than the last time the app ran. Set the date back to today and reopen the app.':
    'இந்த போனின் தேதி கடைசியாக ஆப் ஓடிய நாளை விட முந்தையது. இன்றைய தேதியை வைத்து ஆப்பை மீண்டும் திறங்கள்.',
  'That licence was not accepted.': 'அந்த லைசென்ஸ் ஏற்கப்படவில்லை.',
  'System ID': 'System ID',
  'Send System ID': 'System ID அனுப்பு',
  'Paste the licence {vendor} sent you': '{vendor} அனுப்பிய லைசென்ஸை ஒட்டுங்கள்',
  'Hold on the message in WhatsApp → Copy, then hold in the box above → Paste.':
    'WhatsApp-ல் மெசேஜை அழுத்திப் பிடித்து → Copy, பிறகு மேலே உள்ள பெட்டியில் அழுத்திப் பிடித்து → Paste.',
  Activate: 'ஆக்டிவேட்',
  'Import licence file instead': 'பதிலாக லைசென்ஸ் கோப்பை ஏற்று',
  'If {vendor} sent a file rather than a message, save it to Downloads first, then tap Import.':
    '{vendor} மெசேஜுக்கு பதிலாக கோப்பு அனுப்பியிருந்தால், முதலில் Downloads-ல் சேமித்து பிறகு ஏற்று தட்டுங்கள்.',
  'Free trial · 1 day left': 'இலவச சோதனை · 1 நாள் மீதம்',
  'Free trial · {n} days left': 'இலவச சோதனை · {n} நாள் மீதம்',
  'Enter licence': 'லைசென்ஸ் போடு',
  'Activate this shop': 'இந்த கடையை ஆக்டிவேட் செய்',
  "Send the Server ID below to {vendor}. You'll get a licence back over WhatsApp — paste it here and the shop opens.":
    'கீழே உள்ள Server ID-ஐ {vendor}-க்கு அனுப்புங்கள். WhatsApp-ல் லைசென்ஸ் வரும் — இங்கே ஒட்டினால் கடை திறக்கும்.',
  "The free trial has 1 day left. Send the Server ID below to {vendor} — you'll get a licence back over WhatsApp. Paste it here.":
    'இலவச சோதனைக்கு 1 நாள் மீதம். கீழே உள்ள Server ID-ஐ {vendor}-க்கு அனுப்புங்கள் — WhatsApp-ல் லைசென்ஸ் வரும். இங்கே ஒட்டுங்கள்.',
  "The free trial has {n} days left. Send the Server ID below to {vendor} — you'll get a licence back over WhatsApp. Paste it here.":
    'இலவச சோதனைக்கு {n} நாள் மீதம். கீழே உள்ள Server ID-ஐ {vendor}-க்கு அனுப்புங்கள் — WhatsApp-ல் லைசென்ஸ் வரும். இங்கே ஒட்டுங்கள்.',
  'The 7-day free trial has ended. Send the Server ID below to {vendor} for a licence, then paste it here — everything entered during the trial is kept.':
    '7 நாள் இலவச சோதனை முடிந்தது. லைசென்ஸுக்கு கீழே உள்ள Server ID-ஐ {vendor}-க்கு அனுப்பி இங்கே ஒட்டுங்கள் — சோதனையில் போட்ட எல்லாம் அப்படியே இருக்கும்.',
  "This shop's licence ran out on {date}. Send the Server ID to {vendor} for a renewal, then paste it here — your books are untouched and come straight back.":
    'இந்த கடையின் லைசென்ஸ் {date} அன்று முடிந்தது. புதுப்பிக்க Server ID-ஐ {vendor}-க்கு அனுப்பி இங்கே ஒட்டுங்கள் — கணக்குகள் அப்படியே இருக்கும்.',
  "This computer's date was changed": 'இந்த கம்ப்யூட்டரின் தேதி மாற்றப்பட்டது',
  'The date on this computer is earlier than the last time the shop was opened. Set it back to today, then try again.':
    'இந்த கம்ப்யூட்டரின் தேதி கடைசியாக கடை திறந்த நாளை விட முந்தையது. இன்றைய தேதியை வைத்து மீண்டும் முயலுங்கள்.',
  'Could not copy. Select the Server ID above and copy it by hand.': 'காப்பி செய்ய முடியவில்லை. மேலே உள்ள Server ID-ஐ தேர்வு செய்து கையால் காப்பி செய்யுங்கள்.',
  'Server ID': 'Server ID',
  Copied: 'காப்பி ஆனது',
  'Copy Server ID': 'Server ID காப்பி',
  'Choose a licence file instead': 'பதிலாக லைசென்ஸ் கோப்பைத் தேர்வு செய்',
  'Only the shop owner can install the licence. Sign out and let them sign in on this computer.':
    'கடை உரிமையாளர் மட்டுமே லைசென்ஸ் போட முடியும். வெளியேறி அவரை இந்த கம்ப்யூட்டரில் உள்நுழைய விடுங்கள்.',
  'Back to the shop': 'கடைக்கு திரும்பு',
  'Licence not accepted': 'லைசென்ஸ் ஏற்கப்படவில்லை',
  'That licence is not valid for this phone.': 'அந்த லைசென்ஸ் இந்த போனுக்கு செல்லாது.',
  'Licence updated': 'லைசென்ஸ் புதுப்பிக்கப்பட்டது',
  'Valid until {date}.': '{date} வரை செல்லும்.',
  'Could not read that licence': 'அந்த லைசென்ஸைப் படிக்க முடியவில்லை',
  'Could not read that file': 'அந்த கோப்பைப் படிக்க முடியவில்லை',
  'Free trial': 'இலவச சோதனை',
  expired: 'காலாவதி',
  '1 day left': '1 நாள் மீதம்',
  '{n} days left': '{n} நாள் மீதம்',
  'Not activated': 'ஆக்டிவேட் ஆகவில்லை',
  'Issued to': 'யாருக்கு',
  'Ask your vendor for a licence before the trial ends — the app stops opening after the last day. Your data is kept.':
    'சோதனை முடியும் முன் விற்பனையாளரிடம் லைசென்ஸ் கேளுங்கள் — கடைசி நாளுக்குப் பிறகு ஆப் திறக்காது. தரவு அப்படியே இருக்கும்.',
  'Ask your vendor for a renewal file before this runs out — the app stops opening on the expiry date.':
    'இது முடியும் முன் விற்பனையாளரிடம் புதுப்பிப்பு கோப்பு கேளுங்கள் — காலாவதி தேதியில் ஆப் திறக்காது.',
  'Paste the renewal your vendor sent': 'விற்பனையாளர் அனுப்பிய புதுப்பிப்பை ஒட்டுங்கள்',
  'Paste licence': 'லைசென்ஸ் ஒட்டு',
  'Import licence file': 'லைசென்ஸ் கோப்பு ஏற்று',

  // ── Drive restore sheet ────────────────────────────────────────────────────
  'Restore this backup?': 'இந்த பேக்அப்பை ரீஸ்டோர் செய்யவா?',
  'Everything currently in the app will be DELETED and replaced with "{file}" from {when}. This cannot be undone.':
    'ஆப்பில் இப்போதுள்ள எல்லாம் நீக்கப்பட்டு {when} அன்றைய "{file}" கொண்டு மாற்றப்படும். இதை திரும்ப பெற முடியாது.',
  'Restored from Drive': 'Drive-லிருந்து ரீஸ்டோர் ஆனது',
  'Restore from Google Drive': 'Google Drive-லிருந்து ரீஸ்டோர்',
  'Sign in with the Google account you backed up to, and your data comes back.':
    'பேக்அப் எடுத்த Google கணக்கில் உள்நுழைந்தால் தரவு திரும்ப வரும்.',
  'No backups in this Google account yet. If you used a different account, close this and connect that one.':
    'இந்த Google கணக்கில் இன்னும் பேக்அப் இல்லை. வேறு கணக்கு பயன்படுத்தியிருந்தால், இதை மூடி அதை இணையுங்கள்.',
  newest: 'புதியது',
};
