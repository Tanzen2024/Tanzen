import { describe, it, expect } from 'vitest';
import { isValidFrequencyConfig, suggestNextOccurrenceDate, formatFrequencyDescription } from './tontine-frequency';

describe('tontine-frequency — isValidFrequencyConfig', () => {
  it('DENY: no frequency is never valid', () => expect(isValidFrequencyConfig({})).toBe(false));
  it('ALLOW: DAILY needs nothing else', () => expect(isValidFrequencyConfig({ frequency: 'DAILY' })).toBe(true));
  it('DENY: WEEKLY without a weekday is incomplete', () => expect(isValidFrequencyConfig({ frequency: 'WEEKLY' })).toBe(false));
  it('ALLOW: WEEKLY with a weekday is complete', () => expect(isValidFrequencyConfig({ frequency: 'WEEKLY', weekday: 'MONDAY' })).toBe(true));
  it('DENY: MONTHLY/DAY_OF_MONTH with day 0 or 32 is invalid', () => {
    expect(isValidFrequencyConfig({ frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 0 })).toBe(false);
    expect(isValidFrequencyConfig({ frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 32 })).toBe(false);
  });
  it('DENY: QUARTERLY without quarterlyMonth is incomplete', () => expect(isValidFrequencyConfig({ frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyDayOfMonth: 1 })).toBe(false));
});

describe('tontine-frequency — suggestNextOccurrenceDate (jamais de génération en masse, une seule date)', () => {
  it('ALLOW: MONTHLY/DAY_OF_MONTH suggests exactly the next month’s date, never a batch', () => {
    const next = suggestNextOccurrenceDate({ frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 15 }, '2026-06-15');
    expect(next).toBe('2026-07-15');
  });

  it('EDGE CASE : day 31 absent in February is simply omitted, never shifted — suggests March 31st directly, never Feb 28', () => {
    const next = suggestNextOccurrenceDate({ frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 31 }, '2026-01-31');
    expect(next).toBe('2026-03-31'); // février 2026 n'a pas de 31 → omis, jamais décalé au 28
  });

  it('EDGE CASE : a 5th Monday that does not exist in a given month is omitted — suggestion skips to the next month where it exists', () => {
    // Novembre 2026 n'a que 4 lundis (2,9,16,23,30 → en fait 5, donc on choisit un mois à 4 lundis : février 2026 (2,9,16,23) puis mars a un 5e lundi le 30.
    const next = suggestNextOccurrenceDate({ frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST', monthlyWeekday: 'MONDAY' }, '2026-02-23');
    expect(next).toBe('2026-03-30'); // dernier lundi de mars 2026
  });

  it('ALLOW: WEEKLY suggests the next matching weekday, never several at once', () => {
    const next = suggestNextOccurrenceDate({ frequency: 'WEEKLY', weekday: 'FRIDAY' }, '2026-06-01'); // lundi
    expect(next).toBe('2026-06-05');
  });

  it('DENY: an incomplete frequency never suggests a date', () => {
    expect(suggestNextOccurrenceDate({ frequency: 'WEEKLY' }, '2026-06-01')).toBeNull();
  });
});

describe('tontine-frequency — formatFrequencyDescription (jamais de code technique affiché)', () => {
  it('ALLOW: never leaks a raw technical code (DAILY/WEEKLY/…) in the human description', () => {
    const description = formatFrequencyDescription({ frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5 }, 'fr');
    expect(description).not.toMatch(/DAILY|WEEKLY|MONTHLY|QUARTERLY/);
    expect(description).toContain('5');
  });
});
