// Spoken quantities, in every shape the recogniser hands them over.
//
// A weighed item is the hardest thing a shop says out loud: "one and a half
// kilo chicken" arrives as Tamil words, romanised words, "1 1/2", "1½" or
// "1.5" depending on the session language and the phone — and the item name
// lands before or after the quantity with equal likelihood. All of it has to
// come out as one addLine of 1.5.

import { parseTranscript } from '../parser';

const qtyOf = (transcript: string) => {
  const intents = parseTranscript(transcript);
  expect(intents).toHaveLength(1);
  expect(intents[0].kind).toBe('addLine');
  return intents[0] as Extract<ReturnType<typeof parseTranscript>[number], { kind: 'addLine' }>;
};

describe('one and a half kilo of chicken', () => {
  const SPOKEN = [
    // The recogniser's own spellings of a spoken "one and a half".
    'chicken 1 1/2 kilo',
    '1 1/2 kilo chicken',
    'chicken 1½ kg',
    'chicken 1.5 kg',
    // Romanised Tamil.
    'chicken onnu arai kilo',
    'onnu arai kilo chicken',
    'chicken onnara kilo',
    'chicken onnarai kg',
    // Tamil script.
    'சிக்கன் ஒன்னு அரை கிலோ',
    'ஒன்னு அரை கிலோ சிக்கன்',
    'சிக்கன் ஒன்றரை கிலோ',
    'சிக்கன் ஒன்னரை கிலோ',
    'ஒன்றரை கிலோ சிக்கன்',
    'சிக்கன் 1 1/2 கிலோ',
    // English, including the "and" that used to split the sentence in two.
    'chicken one half kg',
    'one and a half kg chicken',
    'chicken one and half kilo',
    'chicken one point five kg',
    'சிக்கன் ஒன்று புள்ளி ஐந்து கிலோ',
  ];

  test.each(SPOKEN)('%s → 1.5 chicken', (spoken) => {
    const line = qtyOf(spoken);
    expect(line.qty).toBe(1.5);
    expect(line.itemQuery).toMatch(/^(chicken|சிக்கன்)$/);
  });
});

describe('other fractions', () => {
  const CASES: [string, number][] = [
    ['chicken arai kilo', 0.5],
    ['chicken ½ kg', 0.5],
    ['chicken 1/2 kg', 0.5],
    ['அரை கிலோ சிக்கன்', 0.5],
    ['chicken kaal kilo', 0.25],
    ['chicken 1/4 kg', 0.25],
    ['chicken mukkaal kilo', 0.75],
    ['chicken 3/4 kg', 0.75],
    ['chicken quarter kg', 0.25],
    ['chicken two and a half kg', 2.5],
    ['rendara kilo chicken', 2.5],
    ['chicken rendu arai kg', 2.5],
    ['சிக்கன் ரெண்டரை கிலோ', 2.5],
    ['chicken 2 kg', 2],
    ['chicken', 1],
  ];

  test.each(CASES)('%s → %s', (spoken, qty) => {
    expect(qtyOf(spoken).qty).toBe(qty);
  });
});

test('a rate spoken with the quantity stays a rate', () => {
  const line = qtyOf('chicken onnu arai kilo rate 300');
  expect(line.qty).toBe(1.5);
  expect(line.rate).toBe(300);
});

describe('sale return', () => {
  // "return" used to mean "go back". It is now a document, so the going-back
  // words have to keep working without it.
  test.each(['ரிட்டர்ன்', 'return', 'sale return', 'credit note', 'விற்பனை ரிட்டர்ன்'])(
    '%s opens the sale return',
    (spoken) => {
      expect(parseTranscript(spoken)).toEqual([{ kind: 'navigate', target: 'newSaleReturn' }]);
    },
  );

  test.each(['பின்னால', 'back', 'previous', 'திரும்பு'])('%s still goes back', (spoken) => {
    expect(parseTranscript(spoken)).toEqual([{ kind: 'back' }]);
  });
});

test('two items in one breath are still two lines', () => {
  expect(parseTranscript('rendu tea, onnu arai kilo chicken')).toEqual([
    { kind: 'addLine', itemQuery: 'tea', qty: 2, rate: undefined },
    { kind: 'addLine', itemQuery: 'chicken', qty: 1.5, rate: undefined },
  ]);
});
