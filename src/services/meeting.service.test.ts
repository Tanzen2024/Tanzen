import { describe, it, expect } from 'vitest';
import { meetingService, deriveFiscalMeetings, nearestMeeting, type FiscalMeeting } from './meeting.service';
import { fiscalYears } from '@/mocks/settings/fiscal-years';
import { fiscalMeetingId } from '@/mocks/settings/meeting-schedule';

/**
 * Mandat « RÈGLE CENTRALE — DATES DE RÉUNION » §6/§7/§9/§12 — service central.
 * Seeds utilisés :
 *   - FY-T001-2026 (T-001) : « deuxième mardi de chaque mois » → 12 occurrences.
 *   - FY-T002-2026 (T-002) : « le 5 de chaque mois ».
 *   - FY-T003-2026 (T-003) : aucun calendrier.
 */
const T1_2026 = 'FY-T001-2026';
const T2_2026 = 'FY-T002-2026';

const findYear = (id: string) => fiscalYears.find((year) => year.id === id);

describe('deriveFiscalMeetings — occurrences dérivées d\'un exercice', () => {
  it('exercice « deuxième mardi » → 12 réunions, ids encodant l\'exercice', () => {
    const meetings = deriveFiscalMeetings(findYear(T1_2026));
    expect(meetings).toHaveLength(12);
    expect(meetings[0]).toEqual({ id: 'MTG-FY-T001-2026-20260113', tenantId: 'T-001', fiscalYearId: T1_2026, date: '2026-01-13' });
    expect(meetings.every((meeting) => meeting.id.startsWith('MTG-FY-T001-2026-'))).toBe(true);
  });

  it('exercice sans calendrier → aucune réunion', () => {
    expect(deriveFiscalMeetings(findYear('FY-T003-2026'))).toEqual([]);
  });

  it('exercice inconnu → aucune réunion', () => {
    expect(deriveFiscalMeetings(undefined)).toEqual([]);
  });
});

describe('meetingService.getMeetingsForFiscalExercise — isolation tenant + exercice', () => {
  it('retourne les réunions de l\'exercice du tenant', async () => {
    const meetings = await meetingService.getMeetingsForFiscalExercise('T-001', T1_2026);
    expect(meetings).toHaveLength(12);
  });

  it('exercice d\'un autre tenant → vide (jamais les réunions d\'autrui)', async () => {
    expect(await meetingService.getMeetingsForFiscalExercise('T-002', T1_2026)).toEqual([]);
  });

  it('getMeetingOptions — value = meeting_id, label = meeting_date', async () => {
    const options = await meetingService.getMeetingOptions('T-001', T1_2026);
    expect(options[0]).toEqual({ value: 'MTG-FY-T001-2026-20260113', label: '2026-01-13', date: '2026-01-13' });
  });
});

describe('nearestMeeting — réunion la plus proche (§6)', () => {
  const meetings = deriveFiscalMeetings(findYear(T1_2026));

  it('une réunion exactement aujourd\'hui → elle est sélectionnée', () => {
    expect(nearestMeeting(meetings, '2026-09-08')?.date).toBe('2026-09-08');
  });

  it('réunion future la plus proche', () => {
    expect(nearestMeeting(meetings, '2026-09-05')?.date).toBe('2026-09-08');
  });

  it('réunion passée la plus proche', () => {
    expect(nearestMeeting(meetings, '2026-08-20')?.date).toBe('2026-08-11');
  });

  it('exemple du mandat — aujourd\'hui 2026-09-02', () => {
    const sample: FiscalMeeting[] = ['2026-08-25', '2026-09-01', '2026-09-08', '2026-09-15']
      .map((date) => ({ id: `MTG-F-${date.replace(/-/g, '')}`, tenantId: 'T', fiscalYearId: 'F', date }));
    expect(nearestMeeting(sample, '2026-09-02')?.date).toBe('2026-09-01');
  });

  it('égalité de distance → la réunion postérieure', () => {
    const sample: FiscalMeeting[] = ['2026-09-08', '2026-09-12']
      .map((date) => ({ id: `MTG-F-${date.replace(/-/g, '')}`, tenantId: 'T', fiscalYearId: 'F', date }));
    expect(nearestMeeting(sample, '2026-09-10')?.date).toBe('2026-09-12');
  });

  it('aucune réunion → null', () => {
    expect(nearestMeeting([], '2026-09-02')).toBeNull();
  });

  it('getNearestMeeting — exercice sans calendrier → null', async () => {
    expect(await meetingService.getNearestMeeting('T-003', 'FY-T003-2026', '2026-09-02')).toBeNull();
  });
});

describe('validateMeetingBelongsToExercise — §9 / §12', () => {
  it('réunion réellement générée par l\'exercice/tenant → true', () => {
    const id = fiscalMeetingId(T1_2026, '2026-01-13');
    expect(meetingService.validateMeetingBelongsToExercise(id, T1_2026, 'T-001')).toBe(true);
  });

  it('meeting_id d\'un autre exercice → false', () => {
    const id = fiscalMeetingId(T1_2026, '2026-01-13');
    expect(meetingService.validateMeetingBelongsToExercise(id, 'FY-T001-2027', 'T-001')).toBe(false);
  });

  it('meeting_id d\'un autre tenant → false', () => {
    const id = fiscalMeetingId(T2_2026, '2026-02-05');
    expect(meetingService.validateMeetingBelongsToExercise(id, T2_2026, 'T-002')).toBe(true);
    expect(meetingService.validateMeetingBelongsToExercise(id, T2_2026, 'T-001')).toBe(false);
  });

  it('date hors de la règle de récurrence → false (réunion inexistante)', () => {
    const bogus = fiscalMeetingId(T1_2026, '2026-01-01'); // le 1er janvier n'est pas un 2ᵉ mardi
    expect(meetingService.validateMeetingBelongsToExercise(bogus, T1_2026, 'T-001')).toBe(false);
  });

  it('id malformé → false', () => {
    expect(meetingService.validateMeetingBelongsToExercise('MT-004', T1_2026, 'T-001')).toBe(false);
  });
});

describe('resolveMeetingDate — affichage « Date réunion »', () => {
  it('résout la date d\'un meeting_id', () => {
    expect(meetingService.resolveMeetingDate('MTG-FY-T001-2026-20260113')).toBe('2026-01-13');
  });
  it('id inconnu → null', () => {
    expect(meetingService.resolveMeetingDate('nope')).toBeNull();
  });
});
