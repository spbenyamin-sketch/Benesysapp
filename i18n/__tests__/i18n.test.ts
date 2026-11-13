import { fill, setLangInternal, t } from '@/i18n';
import { TA_AREAS } from '@/i18n/ta';

afterEach(() => setLangInternal('en'));

test('English shows the key itself, with placeholders filled', () => {
  expect(t('{n} bills', { n: 3 })).toBe('3 bills');
});

test('a string with no Tamil entry falls back to English', () => {
  setLangInternal('ta');
  expect(t('No such label 123')).toBe('No such label 123');
});

test('fill leaves unknown placeholders alone', () => {
  expect(fill('{a} {b}', { a: 1 })).toBe('1 {b}');
});

test('no key is translated two different ways in two area files', () => {
  const seen = new Map<string, [string, string]>();
  const clashes: string[] = [];
  for (const [area, dict] of Object.entries(TA_AREAS)) {
    for (const [k, v] of Object.entries(dict)) {
      const prev = seen.get(k);
      if (prev && prev[1] !== v) clashes.push(`"${k}": ${prev[0]}="${prev[1]}" vs ${area}="${v}"`);
      else seen.set(k, [area, v]);
    }
  }
  expect(clashes).toEqual([]);
});

test('every Tamil entry keeps the same placeholders as its English key', () => {
  const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
  const bad: string[] = [];
  for (const dict of Object.values(TA_AREAS)) {
    for (const [k, v] of Object.entries(dict)) if (ph(k) !== ph(v)) bad.push(k);
  }
  expect(bad).toEqual([]);
});

test('no Tamil entry is left empty', () => {
  for (const dict of Object.values(TA_AREAS)) {
    for (const [k, v] of Object.entries(dict)) expect([k, v.trim().length > 0]).toEqual([k, true]);
  }
});
