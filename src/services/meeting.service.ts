import { mockRequest } from './api-client';
import { fiscalYears, type FiscalYear } from '@/mocks/settings/fiscal-years';
import {
  generateMeetingDates,
  fiscalMeetingId,
  parseFiscalMeetingId,
  isValidMeetingScheduleConfig,
} from '@/mocks/settings/meeting-schedule';

/**
 * Service central des RÉUNIONS d'exercice fiscal (mandat « RÈGLE CENTRALE —
 * DATES DE RÉUNION » §9). Point d'entrée UNIQUE pour tout champ « Date de
 * réunion » de l'application — aucun module ne recalcule sa propre date.
 *
 * Les réunions ne sont pas stockées : elles sont DÉRIVÉES à la demande de
 * `(FiscalYear, FiscalYear.meetingSchedule)` via `generateMeetingDates`
 * (le moteur de récurrence réutilisé, cf. `mocks/settings/meeting-schedule.ts`).
 * L'id synthétique `MTG-<fiscalYearId>-<YYYYMMDD>` encode l'exercice — donc le
 * tenant — ce qui rend l'isolation §12 structurelle : une réunion d'un autre
 * exercice ou d'un autre tenant ne peut pas « passer » la validation.
 */
export type FiscalMeeting = {
  /** `MTG-<fiscalYearId>-<YYYYMMDD>` — valeur réellement stockée sur les entités (transaction, etc.). */
  id: string;
  tenantId: string;
  fiscalYearId: string;
  /** Date ISO `YYYY-MM-DD` de l'occurrence — c'est LA date de la réunion (pas de « date effective » distincte). */
  date: string;
};

function findFiscalYear(tenantId: string, fiscalYearId: string): FiscalYear | undefined {
  return fiscalYears.find((year) => year.id === fiscalYearId && year.tenantId === tenantId);
}

/** Occurrences dérivées d'un exercice (fonction pure) — triées, sans doublon, dans la plage de l'exercice. */
export function deriveFiscalMeetings(fiscalYear: FiscalYear | undefined): FiscalMeeting[] {
  if (!fiscalYear || !isValidMeetingScheduleConfig(fiscalYear.meetingSchedule)) return [];
  return generateMeetingDates({ startDate: fiscalYear.startDate, endDate: fiscalYear.endDate }, fiscalYear.meetingSchedule)
    .map((date) => ({ id: fiscalMeetingId(fiscalYear.id, date), tenantId: fiscalYear.tenantId, fiscalYearId: fiscalYear.id, date }));
}

/** Réunion la plus proche d'une date (fonction pure) — `distance = |meeting_date − current_date|`, minimum. Égalité → la réunion postérieure (la prochaine). */
export function nearestMeeting(meetings: FiscalMeeting[], currentDateISO: string): FiscalMeeting | null {
  if (meetings.length === 0) return null;
  const today = Date.parse(currentDateISO);
  return meetings.reduce((best, candidate) => {
    const dBest = Math.abs(Date.parse(best.date) - today);
    const dCandidate = Math.abs(Date.parse(candidate.date) - today);
    if (dCandidate < dBest) return candidate;
    if (dCandidate === dBest && candidate.date > best.date) return candidate; // égalité → la date postérieure
    return best;
  });
}

export const meetingService = {
  /** §9 — `getMeetingsForFiscalExercise`. Vide si l'exercice n'existe pas pour ce tenant ou n'a pas de calendrier. */
  getMeetingsForFiscalExercise: (tenantId: string, fiscalYearId: string) =>
    mockRequest(() => deriveFiscalMeetings(findFiscalYear(tenantId, fiscalYearId))),

  /** §6 / §9 — réunion sélectionnée par défaut dans un formulaire. `null` si aucune réunion. */
  getNearestMeeting: (tenantId: string, fiscalYearId: string, currentDateISO: string) =>
    mockRequest(() => nearestMeeting(deriveFiscalMeetings(findFiscalYear(tenantId, fiscalYearId)), currentDateISO)),

  /** §7 / §9 — options d'un `<select>` : `value` = `meeting_id`, `label` = `meeting_date`. */
  getMeetingOptions: (tenantId: string, fiscalYearId: string) =>
    mockRequest(() => deriveFiscalMeetings(findFiscalYear(tenantId, fiscalYearId)).map((meeting) => ({ value: meeting.id, label: meeting.date, date: meeting.date }))),

  /**
   * §9 / §12 — un `meeting_id` appartient-il réellement à cet exercice (et, si
   * `tenantId` est fourni, à ce tenant) ? Rejette : id malformé, exercice
   * différent, tenant différent, ou date qui n'est plus une occurrence de la
   * règle courante. Synchrone : appelé dans les validations de `finance.service`.
   */
  validateMeetingBelongsToExercise: (meetingId: string, fiscalYearId: string, tenantId?: string): boolean => {
    const parsed = parseFiscalMeetingId(meetingId);
    if (!parsed || parsed.fiscalYearId !== fiscalYearId) return false;
    const fiscalYear = fiscalYears.find((year) => year.id === fiscalYearId);
    if (!fiscalYear) return false;
    if (tenantId && fiscalYear.tenantId !== tenantId) return false;
    return deriveFiscalMeetings(fiscalYear).some((meeting) => meeting.id === meetingId);
  },

  /** Résout la date d'un `meeting_id` (pour l'affichage « Date réunion »). `null` si inconnu. */
  resolveMeetingDate: (meetingId: string): string | null => parseFiscalMeetingId(meetingId)?.date ?? null,
};
