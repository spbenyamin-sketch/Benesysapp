import { partyDetailLines, partyPlace, partySearchText } from '@/modules/parties/describe';
import type { Party } from '@/db/schema';

const party = (over: Partial<Party> = {}): Party =>
  ({
    id: 1,
    name: 'Rajesh Stores',
    phone: '9876543210',
    gstin: '33ABCDE1234F1Z5',
    address: '12 Bazaar Street',
    city: 'Madurai',
    state: 'Tamil Nadu',
    type: 'customer',
    openingBalance: 0,
    voiceAlias: 'ராஜேஷ்',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as Party;

describe('partyDetailLines', () => {
  it('says who, where and the GST number', () => {
    expect(partyDetailLines(party())).toEqual([
      'Customer · 9876543210',
      '12 Bazaar Street, Madurai, Tamil Nadu',
      'GSTIN 33ABCDE1234F1Z5',
    ]);
  });

  it('drops whatever the shop never filled in', () => {
    expect(partyDetailLines(party({ phone: null, gstin: null, address: null }))).toEqual([
      'Customer',
      'Madurai, Tamil Nadu',
    ]);
  });

  // A party with nothing but a name is the common case on day one; it must
  // still produce one tidy line and no empty ones.
  it('leaves a bare party with a single line', () => {
    const bare = party({ phone: '', gstin: '  ', address: null, city: null, state: null, type: 'supplier' });
    expect(partyDetailLines(bare)).toEqual(['Supplier']);
  });
});

describe('partySearchText', () => {
  it('matches a party by town, GST number or spoken name', () => {
    const haystack = partySearchText(party()).toLowerCase();
    expect(haystack).toContain('madurai');
    expect(haystack).toContain('33abcde1234f1z5');
    expect(haystack).toContain('ராஜேஷ்');
  });
});

describe('partyPlace', () => {
  it('is empty when the shop knows no address at all', () => {
    expect(partyPlace(party({ address: null, city: null, state: null }))).toBe('');
  });
});
