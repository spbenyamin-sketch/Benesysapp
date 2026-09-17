// One party, said the same way everywhere.
//
// The counter picks a customer by name, but two Rajeshes are told apart by the
// phone number, the town, or the GST number on their bills — so every place
// that shows a party in a list shows those as well, in this order and this
// wording. Kept here rather than in each screen so the picker on the bill, the
// Parties tab and the reports can never drift apart.

import type { Party } from '@/db/schema';

type PartyLike = Pick<Party, 'name' | 'phone' | 'gstin' | 'address' | 'city' | 'state' | 'type'> &
  Partial<Pick<Party, 'voiceAlias'>>;

const clean = (value: string | null | undefined): string => (value ?? '').trim();

/** 'Customer' or 'Supplier', the way the shop reads it. */
export function partyKind(party: Pick<Party, 'type'>): string {
  return party.type === 'customer' ? 'Customer' : 'Supplier';
}

/** Street, town and state as one line, skipping whichever were left blank. */
export function partyPlace(party: Pick<Party, 'address' | 'city' | 'state'>): string {
  return [party.address, party.city, party.state].map(clean).filter(Boolean).join(', ');
}

/**
 * What goes under a party's name in a list: who they are and their mobile, then
 * where they are, then their GST number. Blanks are dropped, so a party with
 * nothing but a name still shows one tidy line.
 */
export function partyDetailLines(party: PartyLike): string[] {
  const gstin = clean(party.gstin);
  return [
    [partyKind(party), clean(party.phone)].filter(Boolean).join(' · '),
    partyPlace(party),
    gstin ? `GSTIN ${gstin}` : '',
  ].filter(Boolean);
}

/**
 * Everything about a party a search box should match. A supplier is as often
 * remembered by their town or their GST number as by the name on the file.
 */
export function partySearchText(party: PartyLike): string {
  return [party.name, party.phone, party.gstin, party.address, party.city, party.state, party.voiceAlias]
    .map(clean)
    .filter(Boolean)
    .join(' ');
}
