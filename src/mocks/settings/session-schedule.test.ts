import { describe, it, expect } from 'vitest';
import { suggestNextSessionDate, isValidSessionScheduleConfig, type SessionScheduleConfig } from './session-schedule';

describe('suggestNextSessionDate — moteur de fréquence des séances (pont vers tontine-frequency / recurrence.ts)', () => {
  it('DAILY : chaque jour', () => {
    expect(suggestNextSessionDate({ frequency: 'DAILY' }, '2026-03-10')).toBe('2026-03-10');
  });

  it('WEEKLY : le prochain jour de semaine configuré, dans les 7 jours suivant afterDate inclus', () => {
    // 2026-03-10 est un mardi.
    expect(suggestNextSessionDate({ frequency: 'WEEKLY', weekday: 'TUESDAY' }, '2026-03-10')).toBe('2026-03-10');
    expect(suggestNextSessionDate({ frequency: 'WEEKLY', weekday: 'FRIDAY' }, '2026-03-10')).toBe('2026-03-13');
  });

  it('MONTHLY (DAY_OF_MONTH) : le prochain jour du mois, mois courant inclus', () => {
    expect(suggestNextSessionDate({ frequency: 'MONTHLY', rule: 'DAY_OF_MONTH', dayOfMonth: 15 }, '2026-05-01')).toBe('2026-05-15');
    expect(suggestNextSessionDate({ frequency: 'MONTHLY', rule: 'DAY_OF_MONTH', dayOfMonth: 15 }, '2026-05-16')).toBe('2026-06-15');
  });

  it('MONTHLY (NTH_WEEKDAY) : le n-ième jour de semaine du mois', () => {
    // Deuxième mardi de mars 2026 = 2026-03-10.
    expect(suggestNextSessionDate({ frequency: 'MONTHLY', rule: 'NTH_WEEKDAY', ordinal: 'SECOND', nthWeekday: 'TUESDAY' }, '2026-03-01')).toBe('2026-03-10');
  });

  it('QUARTERLY : mois d’ancrage dans le trimestre', () => {
    // Trimestre 1 (Jan-Fév-Mar) 2026, mois d'ancrage 2 (février), jour 10.
    expect(suggestNextSessionDate({ frequency: 'QUARTERLY', rule: 'DAY_OF_MONTH', anchorMonth: 2, dayOfMonth: 10 }, '2026-01-01')).toBe('2026-02-10');
  });

  it('SEMIANNUAL : mois d’ancrage dans le semestre', () => {
    // Semestre 1 (Jan-Juin), mois d'ancrage 3 (mars), jour 5.
    expect(suggestNextSessionDate({ frequency: 'SEMIANNUAL', rule: 'DAY_OF_MONTH', anchorMonth: 3, dayOfMonth: 5 }, '2026-01-01')).toBe('2026-03-05');
  });

  it('ANNUAL : mois d’ancrage dans l’année', () => {
    expect(suggestNextSessionDate({ frequency: 'ANNUAL', rule: 'DAY_OF_MONTH', anchorMonth: 6, dayOfMonth: 20 }, '2026-01-01')).toBe('2026-06-20');
  });

  it('LAST_DAY_OF_PERIOD : dernier jour de la période, quelle que soit la fréquence', () => {
    expect(suggestNextSessionDate({ frequency: 'MONTHLY', rule: 'LAST_DAY_OF_PERIOD' }, '2026-02-01')).toBe('2026-02-28');
    expect(suggestNextSessionDate({ frequency: 'QUARTERLY', rule: 'LAST_DAY_OF_PERIOD' }, '2026-01-01')).toBe('2026-03-31');
    expect(suggestNextSessionDate({ frequency: 'ANNUAL', rule: 'LAST_DAY_OF_PERIOD' }, '2026-01-01')).toBe('2026-12-31');
  });

  it('borné par periodEnd : renvoie null quand la prochaine occurrence dépasserait la fin de l’exercice (§7 du mandat)', () => {
    expect(suggestNextSessionDate({ frequency: 'MONTHLY', rule: 'DAY_OF_MONTH', dayOfMonth: 15 }, '2026-12-16', '2026-12-31')).toBeNull();
  });

  it('reste dans les bornes quand la prochaine occurrence tombe avant periodEnd', () => {
    expect(suggestNextSessionDate({ frequency: 'MONTHLY', rule: 'DAY_OF_MONTH', dayOfMonth: 15 }, '2026-12-01', '2026-12-31')).toBe('2026-12-15');
  });

  it('CALCULER ≠ CRÉER : fonction pure, ne renvoie jamais qu’UNE seule date, jamais un tableau', () => {
    const result = suggestNextSessionDate({ frequency: 'DAILY' }, '2026-01-01');
    expect(typeof result).toBe('string');
  });

  it('config incomplète => null', () => {
    expect(suggestNextSessionDate({ frequency: 'WEEKLY' }, '2026-01-01')).toBeNull();
    expect(suggestNextSessionDate({}, '2026-01-01')).toBeNull();
  });
});

describe('isValidSessionScheduleConfig', () => {
  it('DAILY est toujours valide', () => {
    expect(isValidSessionScheduleConfig({ frequency: 'DAILY' })).toBe(true);
  });
  it('WEEKLY exige un jour de semaine', () => {
    expect(isValidSessionScheduleConfig({ frequency: 'WEEKLY' })).toBe(false);
    expect(isValidSessionScheduleConfig({ frequency: 'WEEKLY', weekday: 'MONDAY' })).toBe(true);
  });
  it('QUARTERLY/SEMIANNUAL/ANNUAL exigent un mois d’ancrage sauf LAST_DAY_OF_PERIOD', () => {
    const base: Partial<SessionScheduleConfig> = { frequency: 'QUARTERLY', rule: 'DAY_OF_MONTH', dayOfMonth: 5 };
    expect(isValidSessionScheduleConfig(base)).toBe(false);
    expect(isValidSessionScheduleConfig({ ...base, anchorMonth: 2 })).toBe(true);
    expect(isValidSessionScheduleConfig({ frequency: 'QUARTERLY', rule: 'LAST_DAY_OF_PERIOD' })).toBe(true);
  });
});
