import { describe, it, expect } from 'vitest';
import {
  generateMeetingDates,
  isValidMeetingScheduleConfig,
  fiscalMeetingId,
  parseFiscalMeetingId,
  formatMeetingScheduleDescription,
  applyMeetingFrequency,
  applyMeetingRule,
  applyMeetingOrdinal,
  applyMeetingNthWeekday,
  type MeetingScheduleConfig,
} from './meeting-schedule';

const YEAR_2026 = { startDate: '2026-01-01', endDate: '2026-12-31' };

/**
 * Mandat « RÈGLE CENTRALE — DATES DE RÉUNION » §14 — génération des occurrences
 * pour les 6 fréquences, la règle « n-ième jour de semaine », la règle « dernier
 * jour de la période », et les combinaisons inexistantes (jamais décalées).
 */
describe('generateMeetingDates — fréquences', () => {
  it('JOURNALIÈRE — chaque jour de la plage, bornes incluses', () => {
    expect(generateMeetingDates({ startDate: '2026-03-01', endDate: '2026-03-05' }, { frequency: 'DAILY' }))
      .toEqual(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']);
  });

  it('HEBDOMADAIRE — uniquement le jour de semaine choisi', () => {
    expect(generateMeetingDates({ startDate: '2026-01-01', endDate: '2026-01-31' }, { frequency: 'WEEKLY', weekday: 'TUESDAY' }))
      .toEqual(['2026-01-06', '2026-01-13', '2026-01-20', '2026-01-27']);
  });

  it('MENSUELLE — jour du mois fixe', () => {
    const dates = generateMeetingDates(YEAR_2026, { frequency: 'MONTHLY', rule: 'DAY_OF_MONTH', dayOfMonth: 5 });
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe('2026-01-05');
    expect(dates[11]).toBe('2026-12-05');
  });

  it('MENSUELLE — « deuxième mardi de chaque mois » (exemple du mandat) → 12 occurrences', () => {
    const config: MeetingScheduleConfig = { frequency: 'MONTHLY', rule: 'NTH_WEEKDAY', ordinal: 'SECOND', nthWeekday: 'TUESDAY' };
    expect(generateMeetingDates(YEAR_2026, config)).toEqual([
      '2026-01-13', '2026-02-10', '2026-03-10', '2026-04-14',
      '2026-05-12', '2026-06-09', '2026-07-14', '2026-08-11',
      '2026-09-08', '2026-10-13', '2026-11-10', '2026-12-08',
    ]);
  });

  it('TRIMESTRIELLE — jour du mois d\'ancrage de chaque trimestre', () => {
    const config: MeetingScheduleConfig = { frequency: 'QUARTERLY', rule: 'DAY_OF_MONTH', anchorMonth: 1, dayOfMonth: 15 };
    expect(generateMeetingDates(YEAR_2026, config)).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']);
  });

  it('SEMESTRIELLE — deux occurrences par an', () => {
    const config: MeetingScheduleConfig = { frequency: 'SEMIANNUAL', rule: 'DAY_OF_MONTH', anchorMonth: 2, dayOfMonth: 20 };
    expect(generateMeetingDates(YEAR_2026, config)).toEqual(['2026-02-20', '2026-08-20']);
  });

  it('ANNUELLE — une seule occurrence par an', () => {
    const config: MeetingScheduleConfig = { frequency: 'ANNUAL', rule: 'DAY_OF_MONTH', anchorMonth: 7, dayOfMonth: 1 };
    expect(generateMeetingDates(YEAR_2026, config)).toEqual(['2026-07-01']);
  });

  it('ANNUELLE sur plusieurs exercices — une occurrence par année couverte', () => {
    const config: MeetingScheduleConfig = { frequency: 'ANNUAL', rule: 'DAY_OF_MONTH', anchorMonth: 3, dayOfMonth: 10 };
    expect(generateMeetingDates({ startDate: '2026-01-01', endDate: '2028-12-31' }, config))
      .toEqual(['2026-03-10', '2027-03-10', '2028-03-10']);
  });
});

describe('generateMeetingDates — règle « n-ième jour de semaine »', () => {
  it('deuxième mardi = exactement la 2ᵉ occurrence du mardi dans le mois', () => {
    const config: MeetingScheduleConfig = { frequency: 'MONTHLY', rule: 'NTH_WEEKDAY', ordinal: 'SECOND', nthWeekday: 'TUESDAY' };
    expect(generateMeetingDates({ startDate: '2026-04-01', endDate: '2026-04-30' }, config)).toEqual(['2026-04-14']);
  });

  it('dernier mardi du mois', () => {
    const config: MeetingScheduleConfig = { frequency: 'MONTHLY', rule: 'NTH_WEEKDAY', ordinal: 'LAST', nthWeekday: 'TUESDAY' };
    expect(generateMeetingDates({ startDate: '2026-01-01', endDate: '2026-01-31' }, config)).toEqual(['2026-01-27']);
  });

  it('ANNUELLE + premier lundi du mois d\'ancrage', () => {
    const config: MeetingScheduleConfig = { frequency: 'ANNUAL', rule: 'NTH_WEEKDAY', anchorMonth: 5, ordinal: 'FIRST', nthWeekday: 'MONDAY' };
    expect(generateMeetingDates(YEAR_2026, config)).toEqual(['2026-05-04']);
  });
});

describe('generateMeetingDates — règle « dernier jour de la période »', () => {
  it('MENSUELLE — dernier jour calendaire de chaque mois (février inclus)', () => {
    const dates = generateMeetingDates(YEAR_2026, { frequency: 'MONTHLY', rule: 'LAST_DAY_OF_PERIOD' });
    expect(dates).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
      '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31',
      '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31',
    ]);
  });

  it('TRIMESTRIELLE — dernier jour de chaque trimestre', () => {
    expect(generateMeetingDates(YEAR_2026, { frequency: 'QUARTERLY', rule: 'LAST_DAY_OF_PERIOD' }))
      .toEqual(['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31']);
  });

  it('SEMESTRIELLE — 30 juin et 31 décembre', () => {
    expect(generateMeetingDates(YEAR_2026, { frequency: 'SEMIANNUAL', rule: 'LAST_DAY_OF_PERIOD' }))
      .toEqual(['2026-06-30', '2026-12-31']);
  });

  it('ANNUELLE — 31 décembre', () => {
    expect(generateMeetingDates(YEAR_2026, { frequency: 'ANNUAL', rule: 'LAST_DAY_OF_PERIOD' })).toEqual(['2026-12-31']);
  });
});

describe('generateMeetingDates — combinaisons inexistantes et bornes', () => {
  it('jour 31 — les mois sans 31 sont omis, jamais décalés', () => {
    const dates = generateMeetingDates(YEAR_2026, { frequency: 'MONTHLY', rule: 'DAY_OF_MONTH', dayOfMonth: 31 });
    expect(dates).toEqual(['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31', '2026-08-31', '2026-10-31', '2026-12-31']);
  });

  it('jour 30 en février — omis, jamais reporté au 28', () => {
    const dates = generateMeetingDates({ startDate: '2026-02-01', endDate: '2026-02-28' }, { frequency: 'MONTHLY', rule: 'DAY_OF_MONTH', dayOfMonth: 30 });
    expect(dates).toEqual([]);
  });

  it('jamais de date hors [startDate, endDate]', () => {
    const config: MeetingScheduleConfig = { frequency: 'MONTHLY', rule: 'NTH_WEEKDAY', ordinal: 'SECOND', nthWeekday: 'TUESDAY' };
    const dates = generateMeetingDates({ startDate: '2026-03-15', endDate: '2026-06-01' }, config);
    expect(dates).toEqual(['2026-04-14', '2026-05-12']);
  });

  it('config incomplète → aucune date', () => {
    expect(generateMeetingDates(YEAR_2026, { frequency: 'WEEKLY' } as MeetingScheduleConfig)).toEqual([]);
    expect(generateMeetingDates(YEAR_2026, { frequency: 'MONTHLY' } as MeetingScheduleConfig)).toEqual([]);
  });

  it('plage inversée → aucune date', () => {
    expect(generateMeetingDates({ startDate: '2026-12-31', endDate: '2026-01-01' }, { frequency: 'DAILY' })).toEqual([]);
  });

  it('déterministe — même entrée, même sortie, sans doublon', () => {
    const config: MeetingScheduleConfig = { frequency: 'MONTHLY', rule: 'NTH_WEEKDAY', ordinal: 'SECOND', nthWeekday: 'TUESDAY' };
    const a = generateMeetingDates(YEAR_2026, config);
    const b = generateMeetingDates(YEAR_2026, config);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe('isValidMeetingScheduleConfig', () => {
  it('DAILY est toujours complète', () => {
    expect(isValidMeetingScheduleConfig({ frequency: 'DAILY' })).toBe(true);
  });
  it('WEEKLY exige un jour de semaine', () => {
    expect(isValidMeetingScheduleConfig({ frequency: 'WEEKLY' })).toBe(false);
    expect(isValidMeetingScheduleConfig({ frequency: 'WEEKLY', weekday: 'MONDAY' })).toBe(true);
  });
  it('MONTHLY exige une règle complète', () => {
    expect(isValidMeetingScheduleConfig({ frequency: 'MONTHLY' })).toBe(false);
    expect(isValidMeetingScheduleConfig({ frequency: 'MONTHLY', rule: 'DAY_OF_MONTH' })).toBe(false);
    expect(isValidMeetingScheduleConfig({ frequency: 'MONTHLY', rule: 'DAY_OF_MONTH', dayOfMonth: 5 })).toBe(true);
    expect(isValidMeetingScheduleConfig({ frequency: 'MONTHLY', rule: 'NTH_WEEKDAY', ordinal: 'SECOND', nthWeekday: 'TUESDAY' })).toBe(true);
  });
  it('QUARTERLY/SEMIANNUAL/ANNUAL exigent un mois d\'ancrage sauf LAST_DAY_OF_PERIOD', () => {
    expect(isValidMeetingScheduleConfig({ frequency: 'QUARTERLY', rule: 'DAY_OF_MONTH', dayOfMonth: 3 })).toBe(false);
    expect(isValidMeetingScheduleConfig({ frequency: 'QUARTERLY', rule: 'DAY_OF_MONTH', anchorMonth: 2, dayOfMonth: 3 })).toBe(true);
    expect(isValidMeetingScheduleConfig({ frequency: 'ANNUAL', rule: 'LAST_DAY_OF_PERIOD' })).toBe(true);
    expect(isValidMeetingScheduleConfig({ frequency: 'QUARTERLY', rule: 'DAY_OF_MONTH', anchorMonth: 4, dayOfMonth: 3 })).toBe(false);
  });
  it('undefined / null → invalide', () => {
    expect(isValidMeetingScheduleConfig(undefined)).toBe(false);
    expect(isValidMeetingScheduleConfig(null)).toBe(false);
  });
});

describe('fiscalMeetingId / parseFiscalMeetingId — encodage de l\'exercice', () => {
  it('aller-retour', () => {
    const id = fiscalMeetingId('FY-T001-2026', '2026-01-13');
    expect(id).toBe('MTG-FY-T001-2026-20260113');
    expect(parseFiscalMeetingId(id)).toEqual({ fiscalYearId: 'FY-T001-2026', date: '2026-01-13' });
  });
  it('id malformé → null', () => {
    expect(parseFiscalMeetingId('MT-004')).toBeNull();
    expect(parseFiscalMeetingId('MTG-FY-T001-2026-2026-01-13')).toBeNull();
    expect(parseFiscalMeetingId('')).toBeNull();
  });
});

describe('formatMeetingScheduleDescription / transitions', () => {
  it('décrit « le deuxième mardi de chaque mois »', () => {
    const config: MeetingScheduleConfig = { frequency: 'MONTHLY', rule: 'NTH_WEEKDAY', ordinal: 'SECOND', nthWeekday: 'TUESDAY' };
    expect(formatMeetingScheduleDescription(config, 'fr').toLowerCase()).toContain('deuxième mardi');
  });
  it('changer de fréquence purge les sous-champs devenus non pertinents', () => {
    let cfg = applyMeetingFrequency('MONTHLY');
    cfg = applyMeetingRule(cfg, 'NTH_WEEKDAY');
    cfg = applyMeetingOrdinal(cfg, 'SECOND');
    cfg = applyMeetingNthWeekday(cfg, 'TUESDAY');
    expect(isValidMeetingScheduleConfig(cfg)).toBe(true);
    const reset = applyMeetingFrequency('DAILY');
    expect(reset).toEqual({ frequency: 'DAILY' });
  });
});
