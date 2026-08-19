// react-native is stubbed out: everything worth testing here happens before the
// link is opened. A wrong number or a rude sentence is the failure that would
// actually reach a customer.
jest.mock('react-native', () => ({ Linking: { openURL: jest.fn() } }));

import {
  reminderMessage,
  whatsappAppUrl,
  whatsappPhone,
  whatsappWebUrl,
} from '@/modules/parties/reminder';

describe('whatsappPhone', () => {
  it('accepts the shapes a shopkeeper actually types', () => {
    expect(whatsappPhone('9876543210')).toBe('919876543210');
    expect(whatsappPhone('98765 43210')).toBe('919876543210');
    expect(whatsappPhone('+91 98765-43210')).toBe('919876543210');
    expect(whatsappPhone('098765 43210')).toBe('919876543210');
    expect(whatsappPhone('919876543210')).toBe('919876543210');
  });

  it('refuses anything too short to dial', () => {
    expect(whatsappPhone('')).toBeNull();
    expect(whatsappPhone(null)).toBeNull();
    expect(whatsappPhone(undefined)).toBeNull();
    expect(whatsappPhone('12345')).toBeNull();
    expect(whatsappPhone('no phone')).toBeNull();
  });

  it('leaves a number that already carries another country code alone', () => {
    expect(whatsappPhone('+971 50 123 4567')).toBe('971501234567');
  });
});

describe('reminderMessage', () => {
  const base = { partyName: 'Rajesh', balance: 250000, businessName: 'Benesys Stores' };

  it('names the shop, the customer and the amount', () => {
    const msg = reminderMessage({ ...base, lang: 'en-IN' });
    expect(msg).toContain('Rajesh');
    expect(msg).toContain('Benesys Stores');
    expect(msg).toContain('₹2,500.00');
  });

  it('writes in Tamil when that is the language in use', () => {
    const msg = reminderMessage({ ...base, lang: 'ta-IN' });
    expect(msg).toContain('வணக்கம்');
    expect(msg).toContain('₹2,500.00');
  });

  it('mentions the age only once the money has gone stale', () => {
    expect(reminderMessage({ ...base, lang: 'en-IN', oldestDays: 12 })).not.toContain('12');
    expect(reminderMessage({ ...base, lang: 'en-IN', oldestDays: 75 })).toContain('75 days');
  });

  it('states a balance the shop owes back without a minus sign', () => {
    // The screen decides whether to offer a reminder at all; the wording must
    // never come out as "-₹500 is outstanding".
    expect(reminderMessage({ ...base, balance: -50000, lang: 'en-IN' })).toContain('₹500.00');
  });
});

describe('whatsapp links', () => {
  it('escapes the message so a newline or an & cannot break the link', () => {
    const url = whatsappAppUrl('919876543210', 'Hello\nRaj & Co');
    expect(url).toBe('whatsapp://send?phone=919876543210&text=Hello%0ARaj%20%26%20Co');
  });

  it('falls back to a link a browser can open', () => {
    expect(whatsappWebUrl('919876543210', 'Hi')).toBe('https://wa.me/919876543210?text=Hi');
  });
});
