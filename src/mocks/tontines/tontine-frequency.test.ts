import { describe, it, expect } from 'vitest';
import {
  generateOccurrenceDates, formatFrequencyDescription, validateFrequency, isValidFrequencyConfig,
  applyWeekday, applyMonthlyRule, applyMonthlyDayOfMonth, applyMonthlyOrdinal, applyMonthlyWeekday,
  applyQuarterlyRule, applyQuarterlyMonth, applyQuarterlyDayOfMonth, applyQuarterlyOrdinal, applyQuarterlyWeekday,
  __testing, type FrequencyConfig,
} from './tontine-frequency';

/** Stub minimal — retourne la clé elle-même plutôt qu'un texte traduit, pour ne pas coupler ces tests à la copie FR/EN. */
const t = (_section: 'tontines', key: string) => key;

describe('generateOccurrenceDates — DAILY', () => {
  it('generates every day in the period, inclusive of both ends', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-01-05' }, { frequency: 'DAILY' });
    expect(dates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']);
  });

  it('a single-day period produces exactly one date', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-03-10', endDate: '2026-03-10' }, { frequency: 'DAILY' });
    expect(dates).toEqual(['2026-03-10']);
  });
});

describe('generateOccurrenceDates — WEEKLY', () => {
  it('lundi — only Mondays in the period', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-01-31' }, { frequency: 'WEEKLY', weekday: 'MONDAY' });
    expect(dates).toEqual(['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']);
  });

  it('mercredi — matches the worked example from the mandate', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-01-31' }, { frequency: 'WEEKLY', weekday: 'WEDNESDAY' });
    expect(dates).toEqual(['2026-01-07', '2026-01-14', '2026-01-21', '2026-01-28']);
  });

  it('dimanche — only Sundays', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-02-01', endDate: '2026-02-28' }, { frequency: 'WEEKLY', weekday: 'SUNDAY' });
    expect(dates).toEqual(['2026-02-01', '2026-02-08', '2026-02-15', '2026-02-22']);
  });

  it('missing weekday configuration produces no dates rather than guessing', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-01-31' }, { frequency: 'WEEKLY' });
    expect(dates).toEqual([]);
  });
});

describe('generateOccurrenceDates — MONTHLY (DAY_OF_MONTH)', () => {
  it('day 15 of every month across a full year', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-12-31' }, { frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 15 });
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe('2026-01-15');
    expect(dates[11]).toBe('2026-12-15');
  });

  it('day 1 of every month', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-03-31' }, { frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 });
    expect(dates).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('day 31 is simply absent in months shorter than 31 days — never shifted', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-04-30' }, { frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 31 });
    // janvier(31) présent, février(28, année non bissextile) absent, mars(31) présent, avril(30) absent
    expect(dates).toEqual(['2026-01-31', '2026-03-31']);
  });

  it('leap year: day 29 of February exists only when the year is a leap year', () => {
    const leap = generateOccurrenceDates({ startDate: '2028-02-01', endDate: '2028-02-29' }, { frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 29 });
    expect(leap).toEqual(['2028-02-29']);
    const nonLeap = generateOccurrenceDates({ startDate: '2026-02-01', endDate: '2026-02-28' }, { frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 29 });
    expect(nonLeap).toEqual([]);
  });
});

describe('generateOccurrenceDates — MONTHLY (NTH_WEEKDAY)', () => {
  it('the last Thursday of every month (worked example)', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-03-31' }, { frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST', monthlyWeekday: 'THURSDAY' });
    expect(dates).toEqual(['2026-01-29', '2026-02-26', '2026-03-26']);
  });

  it('the first Monday of every month', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-03-31' }, { frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'FIRST', monthlyWeekday: 'MONDAY' });
    expect(dates).toEqual(['2026-01-05', '2026-02-02', '2026-03-02']);
  });

  it('a 5th occurrence that does not exist in a given month is simply omitted (via the internal helper, no UI ordinal goes this far)', () => {
    // Février 2026 (28 jours, commence un dimanche) ne possède que 4 lundis.
    const day = __testing.nthWeekdayOfMonth(2026, 2, 1 /* lundi */, 5);
    expect(day).toBeNull();
  });

  describe('sans ordinal (mandat correction UX §6) — chaque occurrence du jour, dans chaque mois de la période', () => {
    it('MONTHLY + WEEKDAY + THURSDAY (no monthlyOrdinal) produces every Thursday of every month in the period, matching WEEKLY for the same weekday', () => {
      const period = { startDate: '2026-01-01', endDate: '2026-03-31' };
      const monthly = generateOccurrenceDates(period, { frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyWeekday: 'THURSDAY' });
      const weekly = generateOccurrenceDates(period, { frequency: 'WEEKLY', weekday: 'THURSDAY' });
      expect(monthly).toEqual(weekly);
      expect(monthly.length).toBeGreaterThan(3); // plusieurs jeudis par mois, pas un seul par mois comme avec un ordinal
    });

    it('without monthlyWeekday, produces no dates rather than guessing', () => {
      const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-01-31' }, { frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY' });
      expect(dates).toEqual([]);
    });

    it('with an explicit monthlyOrdinal, the legacy single-date-per-month behaviour is preserved unchanged (compatibility §9)', () => {
      const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-03-31' }, { frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST', monthlyWeekday: 'THURSDAY' });
      expect(dates).toEqual(['2026-01-29', '2026-02-26', '2026-03-26']);
    });
  });
});

describe('generateOccurrenceDates — QUARTERLY (DAY_OF_MONTH)', () => {
  it('the 3rd of the second month of every quarter (worked example)', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-12-31' }, { frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 2, quarterlyDayOfMonth: 3 });
    expect(dates).toEqual(['2026-02-03', '2026-05-03', '2026-08-03', '2026-11-03']);
  });

  it('day 31 of the third month of the quarter — absent when that month is short (June has 30 days)', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-12-31' }, { frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 3, quarterlyDayOfMonth: 31 });
    // Q1 troisième mois = mars (31j, présent) ; Q2 = juin (30j, absent) ; Q3 = septembre (30j, absent) ; Q4 = décembre (31j, présent)
    expect(dates).toEqual(['2026-03-31', '2026-12-31']);
  });

  it('a quarter crossing a year boundary is handled correctly', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-11-01', endDate: '2027-02-28' }, { frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 2, quarterlyDayOfMonth: 3 });
    expect(dates).toEqual(['2026-11-03', '2027-02-03']);
  });
});

describe('generateOccurrenceDates — QUARTERLY (NTH_WEEKDAY)', () => {
  it('the first Sunday of the first month of every quarter (worked example)', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-12-31' }, { frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1, quarterlyOrdinal: 'FIRST', quarterlyWeekday: 'SUNDAY' });
    expect(dates).toEqual(['2026-01-04', '2026-04-05', '2026-07-05', '2026-10-04']);
  });

  it('the first Sunday of the second month of every quarter (must not be hardcoded to the first month only)', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-12-31' }, { frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 2, quarterlyOrdinal: 'FIRST', quarterlyWeekday: 'SUNDAY' });
    expect(dates).toEqual(['2026-02-01', '2026-05-03', '2026-08-02', '2026-11-01']);
  });
});

describe('generateOccurrenceDates — cas limites généraux', () => {
  const config: FrequencyConfig = { frequency: 'DAILY' };

  it('an invalid period (endDate before startDate) yields no dates', () => {
    expect(generateOccurrenceDates({ startDate: '2026-05-10', endDate: '2026-05-01' }, config)).toEqual([]);
  });

  it('an empty startDate/endDate yields no dates', () => {
    expect(generateOccurrenceDates({ startDate: '', endDate: '' }, config)).toEqual([]);
  });

  it('dates are always in chronological order', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-06-30' }, { frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 15 });
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it('never produces the same date twice', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2027-12-31' }, { frequency: 'WEEKLY', weekday: 'FRIDAY' });
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('a date exactly on startDate/endDate is included (inclusive bounds)', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-15', endDate: '2026-02-15' }, { frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 15 });
    expect(dates).toEqual(['2026-01-15', '2026-02-15']);
  });

  it('a date before startDate or after endDate is excluded even if it matches the rule', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-16', endDate: '2026-02-14' }, { frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 15 });
    expect(dates).toEqual([]);
  });
});

describe('formatFrequencyDescription', () => {
  it('DAILY → "Chaque jour" / "Every day"', () => {
    expect(formatFrequencyDescription({ frequency: 'DAILY' })).toBe('Chaque jour');
    expect(formatFrequencyDescription({ frequency: 'DAILY' }, 'en')).toBe('Every day');
  });

  it('WEEKLY mercredi → "Chaque mercredi"', () => {
    expect(formatFrequencyDescription({ frequency: 'WEEKLY', weekday: 'WEDNESDAY' })).toBe('Chaque mercredi');
    expect(formatFrequencyDescription({ frequency: 'WEEKLY', weekday: 'WEDNESDAY' }, 'en')).toBe('Every Wednesday');
  });

  it('MONTHLY day 15 → "Le 15 de chaque mois"', () => {
    expect(formatFrequencyDescription({ frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 15 })).toBe('Le 15 de chaque mois');
  });

  it('MONTHLY last Thursday (ordinal explicite, compatibilité §9) → "Le dernier jeudi de chaque mois"', () => {
    expect(formatFrequencyDescription({ frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST', monthlyWeekday: 'THURSDAY' })).toBe('Le dernier jeudi de chaque mois');
  });

  it('MONTHLY + WEEKDAY + THURSDAY (mandat correction UX, sans ordinal) → "Chaque jeudi", jamais dépendant d’un ordinal', () => {
    const config = { frequency: 'MONTHLY' as const, monthlyRule: 'NTH_WEEKDAY' as const, monthlyWeekday: 'THURSDAY' as const };
    expect(formatFrequencyDescription(config)).toBe('Chaque jeudi');
    expect(formatFrequencyDescription(config, 'en')).toBe('Every Thursday');
    expect('monthlyOrdinal' in config).toBe(false);
  });

  it('QUARTERLY first Sunday of first month → "Le premier dimanche du premier mois de chaque trimestre"', () => {
    expect(formatFrequencyDescription({ frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1, quarterlyOrdinal: 'FIRST', quarterlyWeekday: 'SUNDAY' })).toBe('Le premier dimanche du premier mois de chaque trimestre');
  });

  it('QUARTERLY day 3 of second month → "Le 3 du deuxième mois de chaque trimestre"', () => {
    expect(formatFrequencyDescription({ frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 2, quarterlyDayOfMonth: 3 })).toBe('Le 3 du deuxième mois de chaque trimestre');
  });

  it('an incomplete configuration never crashes and returns an explanatory (non-technical-code) string', () => {
    expect(formatFrequencyDescription({ frequency: 'WEEKLY' })).not.toContain('undefined');
    expect(formatFrequencyDescription({ frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY' })).not.toContain('undefined');
    expect(formatFrequencyDescription({ frequency: 'QUARTERLY' })).not.toContain('undefined');
  });

  it('never leaks the internal technical codes (DAILY/WEEKLY/MONTHLY/QUARTERLY) into the human description', () => {
    const codes = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'];
    const samples: FrequencyConfig[] = [
      { frequency: 'DAILY' },
      { frequency: 'WEEKLY', weekday: 'MONDAY' },
      { frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 1 },
      { frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 1, quarterlyDayOfMonth: 1 },
    ];
    for (const sample of samples) {
      const text = formatFrequencyDescription(sample);
      for (const code of codes) expect(text).not.toContain(code);
    }
  });
});

describe('MONTHLY state transitions — mandat cascade UX (pas de valeur résiduelle)', () => {
  it('switching DAY_OF_MONTH → WEEKDAY clears monthlyDayOfMonth; picking an ordinal then a weekday builds the cascade progressively', () => {
    const current: Partial<FrequencyConfig> = { frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 15 };
    const afterRuleChange = applyMonthlyRule(current, 'NTH_WEEKDAY');
    expect(afterRuleChange).toEqual({ frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY' });
    expect('monthlyDayOfMonth' in afterRuleChange).toBe(false);
    expect('monthlyOrdinal' in afterRuleChange).toBe(false);
    expect('monthlyWeekday' in afterRuleChange).toBe(false);

    const afterOrdinalPick = applyMonthlyOrdinal(afterRuleChange, 'LAST');
    expect(afterOrdinalPick).toEqual({ frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST' });
    expect('monthlyWeekday' in afterOrdinalPick).toBe(false); // le jour de semaine n'apparaît qu'après l'ordre, jamais avant.

    const afterWeekdayPick = applyMonthlyWeekday(afterOrdinalPick, 'SUNDAY');
    expect(afterWeekdayPick).toEqual({ frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST', monthlyWeekday: 'SUNDAY' });
  });

  it('changing the ordinal after a weekday was already picked resets the weekday (it depends on the ordinal)', () => {
    const withWeekday: Partial<FrequencyConfig> = { frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST', monthlyWeekday: 'SUNDAY' };
    const afterOrdinalChange = applyMonthlyOrdinal(withWeekday, 'FIRST');
    expect(afterOrdinalChange).toEqual({ frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'FIRST' });
    expect('monthlyWeekday' in afterOrdinalChange).toBe(false);
  });

  it('switching WEEKDAY → DAY_OF_MONTH clears monthlyWeekday and monthlyOrdinal entirely', () => {
    const current: Partial<FrequencyConfig> = { frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST', monthlyWeekday: 'SUNDAY' };
    const afterRuleChange = applyMonthlyRule(current, 'DAY_OF_MONTH');
    expect(afterRuleChange).toEqual({ frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH' });
    expect('monthlyWeekday' in afterRuleChange).toBe(false);
    expect('monthlyOrdinal' in afterRuleChange).toBe(false);
    const afterDayPick = applyMonthlyDayOfMonth(afterRuleChange, 15);
    expect(afterDayPick).toEqual({ frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 15 });
    expect('monthlyWeekday' in afterDayPick).toBe(false);
    expect('monthlyOrdinal' in afterDayPick).toBe(false);
  });
});

describe('QUARTERLY state transitions — mandat cascade UX (pas de valeur résiduelle)', () => {
  it('changing quarterlyRule preserves quarterlyMonth (champ commun aux deux branches) but drops everything branch-specific', () => {
    const current: Partial<FrequencyConfig> = { frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 2, quarterlyOrdinal: 'LAST', quarterlyWeekday: 'SUNDAY' };
    const afterRuleChange = applyQuarterlyRule(current, 'DAY_OF_MONTH');
    expect(afterRuleChange).toEqual({ frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 2 });
    expect('quarterlyOrdinal' in afterRuleChange).toBe(false);
    expect('quarterlyWeekday' in afterRuleChange).toBe(false);
    expect('quarterlyDayOfMonth' in afterRuleChange).toBe(false);
  });

  it('changing quarterlyMonth after ordinal/weekday/day were already picked resets all of them (they depend on the month)', () => {
    const withDay: Partial<FrequencyConfig> = { frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 2, quarterlyDayOfMonth: 3 };
    const afterMonthChange = applyQuarterlyMonth(withDay, 1);
    expect(afterMonthChange).toEqual({ frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 1 });
    expect('quarterlyDayOfMonth' in afterMonthChange).toBe(false);

    const withWeekday: Partial<FrequencyConfig> = { frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 2, quarterlyOrdinal: 'FIRST', quarterlyWeekday: 'SUNDAY' };
    const afterMonthChange2 = applyQuarterlyMonth(withWeekday, 3);
    expect(afterMonthChange2).toEqual({ frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 3 });
    expect('quarterlyOrdinal' in afterMonthChange2).toBe(false);
    expect('quarterlyWeekday' in afterMonthChange2).toBe(false);
  });

  it('builds the full DAY_OF_MONTH cascade progressively: month → day, preserving the month', () => {
    let config: Partial<FrequencyConfig> = { frequency: 'QUARTERLY' };
    config = applyQuarterlyRule(config, 'DAY_OF_MONTH');
    expect(config.quarterlyMonth).toBeUndefined();
    config = applyQuarterlyMonth(config, 2);
    expect(config.quarterlyDayOfMonth).toBeUndefined();
    config = applyQuarterlyDayOfMonth(config, 3);
    expect(config).toEqual({ frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 2, quarterlyDayOfMonth: 3 });
  });

  it('builds the full NTH_WEEKDAY cascade progressively: month → ordinal → weekday, each step preserving its parents', () => {
    let config: Partial<FrequencyConfig> = { frequency: 'QUARTERLY' };
    config = applyQuarterlyRule(config, 'NTH_WEEKDAY');
    expect(config.quarterlyMonth).toBeUndefined();
    config = applyQuarterlyMonth(config, 1);
    expect(config.quarterlyOrdinal).toBeUndefined();
    config = applyQuarterlyOrdinal(config, 'FIRST');
    expect(config.quarterlyWeekday).toBeUndefined();
    config = applyQuarterlyWeekday(config, 'SUNDAY');
    expect(config).toEqual({ frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1, quarterlyOrdinal: 'FIRST', quarterlyWeekday: 'SUNDAY' });
  });

  it('changing the ordinal after a weekday was already picked resets the weekday', () => {
    const withWeekday: Partial<FrequencyConfig> = { frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1, quarterlyOrdinal: 'FIRST', quarterlyWeekday: 'SUNDAY' };
    const afterOrdinalChange = applyQuarterlyOrdinal(withWeekday, 'LAST');
    expect(afterOrdinalChange).toEqual({ frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1, quarterlyOrdinal: 'LAST' });
    expect('quarterlyWeekday' in afterOrdinalChange).toBe(false);
  });
});

describe('applyWeekday (WEEKLY)', () => {
  it('sets the weekday, preserving only the frequency', () => {
    const config: Partial<FrequencyConfig> = { frequency: 'WEEKLY' };
    expect(applyWeekday(config, 'WEDNESDAY')).toEqual({ frequency: 'WEEKLY', weekday: 'WEDNESDAY' });
  });
});

describe('validateFrequency — configuration minimale requise par scénario (mandat cascade UX §10)', () => {
  it('1. DAILY is valid as soon as frequency = DAILY', () => {
    expect(validateFrequency(t, { frequency: 'DAILY' })).toBeUndefined();
  });

  it('2. WEEKLY requires weekday', () => {
    expect(validateFrequency(t, { frequency: 'WEEKLY' })).toBe('weekdayRequired');
    expect(validateFrequency(t, { frequency: 'WEEKLY', weekday: 'MONDAY' })).toBeUndefined();
  });

  it('3. MONTHLY + DAY_OF_MONTH requires monthlyDayOfMonth; is unaffected by ordinal/weekday being absent', () => {
    expect(validateFrequency(t, { frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH' })).toBe('dayOfMonthRequired');
    const valid: Partial<FrequencyConfig> = { frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 15 };
    expect(validateFrequency(t, valid)).toBeUndefined();
    expect('monthlyOrdinal' in valid).toBe(false);
    expect('monthlyWeekday' in valid).toBe(false);
  });

  it('4. MONTHLY + WEEKDAY requires monthlyOrdinal AND monthlyWeekday (réintroduit par ce mandat)', () => {
    expect(validateFrequency(t, { frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY' })).toBe('ordinalWeekdayRequired');
    expect(validateFrequency(t, { frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST' })).toBe('ordinalWeekdayRequired');
    expect(validateFrequency(t, { frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyWeekday: 'SUNDAY' })).toBe('ordinalWeekdayRequired');
    expect(validateFrequency(t, { frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST', monthlyWeekday: 'SUNDAY' })).toBeUndefined();
  });

  it('5. QUARTERLY + DAY_OF_MONTH requires quarterlyMonth AND quarterlyDayOfMonth; unaffected by ordinal/weekday absence', () => {
    expect(validateFrequency(t, { frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH' })).toBe('quarterMonthRequired');
    expect(validateFrequency(t, { frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 2 })).toBe('dayOfMonthRequired');
    const valid: Partial<FrequencyConfig> = { frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 2, quarterlyDayOfMonth: 3 };
    expect(validateFrequency(t, valid)).toBeUndefined();
    expect('quarterlyOrdinal' in valid).toBe(false);
    expect('quarterlyWeekday' in valid).toBe(false);
  });

  it('6. QUARTERLY + WEEKDAY requires quarterlyMonth, quarterlyOrdinal AND quarterlyWeekday', () => {
    expect(validateFrequency(t, { frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY' })).toBe('quarterMonthRequired');
    expect(validateFrequency(t, { frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1 })).toBe('ordinalWeekdayRequired');
    expect(validateFrequency(t, { frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1, quarterlyOrdinal: 'FIRST' })).toBe('ordinalWeekdayRequired');
    expect(validateFrequency(t, { frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1, quarterlyOrdinal: 'FIRST', quarterlyWeekday: 'SUNDAY' })).toBeUndefined();
  });

  it('9. an incomplete configuration is reported invalid at every intermediate cascade step (no premature "preview")', () => {
    expect(validateFrequency(t, {})).toBe('frequencyRequired');
    expect(validateFrequency(t, { frequency: 'MONTHLY' })).toBe('dayOfMonthRequired'); // pas de règle choisie → traité comme incomplet, jamais "valide par défaut"
    expect(validateFrequency(t, { frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1 })).toBe('ordinalWeekdayRequired');
  });

  it('10. a complete configuration is accepted by generateOccurrenceDates exactly as before (no behaviour change)', () => {
    const config: FrequencyConfig = { frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST', monthlyWeekday: 'THURSDAY' };
    expect(validateFrequency(t, config)).toBeUndefined();
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-03-31' }, config);
    expect(dates).toEqual(['2026-01-29', '2026-02-26', '2026-03-26']);
  });
});

describe('isValidFrequencyConfig — prédicat pur sans i18n pour le service (mandat « Fréquence obligatoire »)', () => {
  it('rejects an empty/missing frequency, exactly like validateFrequency', () => {
    expect(isValidFrequencyConfig({})).toBe(false);
    expect(isValidFrequencyConfig({ frequency: undefined })).toBe(false);
  });

  it('DAILY is valid as soon as frequency = DAILY', () => {
    expect(isValidFrequencyConfig({ frequency: 'DAILY' })).toBe(true);
  });

  it('WEEKLY requires weekday', () => {
    expect(isValidFrequencyConfig({ frequency: 'WEEKLY' })).toBe(false);
    expect(isValidFrequencyConfig({ frequency: 'WEEKLY', weekday: 'MONDAY' })).toBe(true);
  });

  it('MONTHLY + DAY_OF_MONTH requires a monthlyDayOfMonth within 1-31', () => {
    expect(isValidFrequencyConfig({ frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH' })).toBe(false);
    expect(isValidFrequencyConfig({ frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 32 })).toBe(false);
    expect(isValidFrequencyConfig({ frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 15 })).toBe(true);
  });

  it('MONTHLY + NTH_WEEKDAY requires monthlyOrdinal AND monthlyWeekday', () => {
    expect(isValidFrequencyConfig({ frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST' })).toBe(false);
    expect(isValidFrequencyConfig({ frequency: 'MONTHLY', monthlyRule: 'NTH_WEEKDAY', monthlyOrdinal: 'LAST', monthlyWeekday: 'SUNDAY' })).toBe(true);
  });

  it('QUARTERLY requires quarterlyMonth plus the day-of-month or ordinal/weekday pair depending on quarterlyRule', () => {
    expect(isValidFrequencyConfig({ frequency: 'QUARTERLY' })).toBe(false);
    expect(isValidFrequencyConfig({ frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 2 })).toBe(false);
    expect(isValidFrequencyConfig({ frequency: 'QUARTERLY', quarterlyRule: 'DAY_OF_MONTH', quarterlyMonth: 2, quarterlyDayOfMonth: 3 })).toBe(true);
    expect(isValidFrequencyConfig({ frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1, quarterlyOrdinal: 'FIRST' })).toBe(false);
    expect(isValidFrequencyConfig({ frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1, quarterlyOrdinal: 'FIRST', quarterlyWeekday: 'SUNDAY' })).toBe(true);
  });
});

describe('Test 5 — DAILY et WEEKLY ne sont pas régressés par la correction MONTHLY', () => {
  it('DAILY still generates every day of the period', () => {
    expect(generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-01-03' }, { frequency: 'DAILY' })).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('WEEKLY still generates the correct weekday, unaffected by the MONTHLY WEEKDAY change', () => {
    expect(generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-01-31' }, { frequency: 'WEEKLY', weekday: 'WEDNESDAY' })).toEqual(['2026-01-07', '2026-01-14', '2026-01-21', '2026-01-28']);
  });
});

describe('Test 6 — QUARTERLY (NTH_WEEKDAY avec ordinal) n’est pas régressé par la correction MONTHLY', () => {
  it('QUARTERLY still requires and uses quarterlyOrdinal — behaviour untouched', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-12-31' }, { frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1, quarterlyOrdinal: 'FIRST', quarterlyWeekday: 'SUNDAY' });
    expect(dates).toEqual(['2026-01-04', '2026-04-05', '2026-07-05', '2026-10-04']);
  });

  it('QUARTERLY without quarterlyOrdinal still yields no dates (unlike the new MONTHLY behaviour — the two rules were deliberately not unified)', () => {
    const dates = generateOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-12-31' }, { frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1, quarterlyWeekday: 'SUNDAY' });
    expect(dates).toEqual([]);
  });

  it('the description for a complete QUARTERLY NTH_WEEKDAY config is unchanged', () => {
    expect(formatFrequencyDescription({ frequency: 'QUARTERLY', quarterlyRule: 'NTH_WEEKDAY', quarterlyMonth: 1, quarterlyOrdinal: 'FIRST', quarterlyWeekday: 'SUNDAY' })).toBe('Le premier dimanche du premier mois de chaque trimestre');
  });
});
