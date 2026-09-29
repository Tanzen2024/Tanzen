import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { fiscalSessions, type FiscalSession } from '@/mocks/settings/fiscal-sessions';
import { fiscalYears, fiscalYearContaining, type FiscalYear } from '@/mocks/settings/fiscal-years';
import { suggestNextSessionDate as computeSuggestNextSessionDate } from '@/mocks/settings/session-schedule';

/**
 * Service central des SÉANCES d'exercice fiscal. Point d'entrée UNIQUE pour
 * toute création/consultation de séance et pour le rattachement
 * `Transaction.sessionId`. Une `FiscalSession` est une entité RÉELLE,
 * persistée UNE PAR UNE — jamais de génération en masse (même principe que
 * `tontineOperationsService.createOccurrence`).
 */
function findFiscalYear(tenantId: string, fiscalYearId: string): FiscalYear | undefined {
  return fiscalYears.find((year) => year.id === fiscalYearId && year.tenantId === tenantId);
}

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** `YYYY-MM-DD` + 1 jour, sans dérive de fuseau (calcul en UTC). */
function nextDayISO(dateISO: string): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Séances d'un exercice, triées par numéro — fonction pure réutilisée par le service et les suggestions. */
/**
 * Séance la plus récente selon sa VRAIE date de séance (horodatage, jamais
 * l'ordre de la liste ni un tri de chaînes) ; à date égale, le numéro le plus
 * élevé l'emporte. `undefined` si aucune séance.
 */
export function latestSession<S extends Pick<FiscalSession, 'date' | 'sessionNumber'>>(sessions: readonly S[]): S | undefined {
  const time = (session: S) => new Date(`${session.date}T00:00:00`).getTime();
  return sessions.reduce<S | undefined>((best, session) => !best || time(session) > time(best) || (time(session) === time(best) && session.sessionNumber > best.sessionNumber) ? session : best, undefined);
}

/**
 * SÉANCE COURANTE d'une écriture automatique (tontine : cotisation, réception, achat) — la séance
 * la plus récente (`latestSession`) de l'exercice du tenant contenant `date`, soit la séance
 * affichée par défaut dans Trésorerie → Transactions. `undefined` si aucun exercice ou aucune séance.
 */
export function currentSessionFor(tenantId: string, date: string): FiscalSession | undefined {
  const fiscalYear = fiscalYearContaining(fiscalYears, tenantId, date);
  return fiscalYear ? latestSession(sessionsOf(tenantId, fiscalYear.id)) : undefined;
}

export function sessionsOf(tenantId: string, fiscalYearId: string): FiscalSession[] {
  return fiscalSessions.filter((session) => session.tenantId === tenantId && session.fiscalYearId === fiscalYearId).sort((a, b) => a.sessionNumber - b.sessionNumber);
}

/** Date du jour `YYYY-MM-DD` (fuseau local — même convention que les Tours Tontines). */
function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Prochaine date de séance suggérée (fonction pure, AUCUNE écriture) — même
 * comportement que les Tours Tontines (mandat « Gestion des séances », décision
 * 4 validée le 2026-09-25). `null` si aucune fréquence n'est configurée, si
 * l'exercice n'existe pas, ou si la fréquence ne produit plus aucune date dans
 * la période (jamais une séance forcée hors exercice).
 *
 * Le moteur (`session-schedule.ts`) traite `afterDate` de façon INCLUSIVE ; le
 * point de départ fixe donc la règle :
 *   - une séance existe → lendemain de la DERNIÈRE séance : suggestion
 *     strictement postérieure à elle, aujourd'hui compris s'il convient ;
 *   - aucune séance → le plus tardif entre le début d'exercice (un exercice à
 *     venir peut démarrer le jour même de son début) et DEMAIN (occurrence
 *     strictement future : si la règle tombe aujourd'hui, l'occurrence suivante).
 * `today` n'est paramétrable que pour les tests.
 */
export function suggestNextSession(tenantId: string, fiscalYearId: string, today: string = todayISO()): string | null {
  const year = findFiscalYear(tenantId, fiscalYearId);
  if (!year || !year.sessionSchedule) return null;
  const existing = sessionsOf(tenantId, fiscalYearId);
  const tomorrow = nextDayISO(today);
  const afterDate = existing.length > 0 ? nextDayISO(existing[existing.length - 1].date) : (year.startDate > tomorrow ? year.startDate : tomorrow);
  return computeSuggestNextSessionDate(year.sessionSchedule, afterDate, year.endDate);
}

/** État AFFICHÉ d'une séance, calculé à partir de sa seule date — jamais stocké (`FiscalSession` n'a pas de `status`, décision 2). */
export type SessionTiming = 'upcoming' | 'today' | 'past';
export function sessionTiming(sessionDate: string, today: string = todayISO()): SessionTiming {
  if (sessionDate > today) return 'upcoming';
  return sessionDate === today ? 'today' : 'past';
}

/** Une séance `sessionId` appartient-elle réellement à `fiscalYearId` (et, si fourni, à `tenantId`) ? */
export function validateSessionBelongsToExercise(sessionId: string, fiscalYearId: string, tenantId?: string): boolean {
  return fiscalSessions.some((session) => session.id === sessionId && session.fiscalYearId === fiscalYearId && (!tenantId || session.tenantId === tenantId));
}

export const fiscalSessionService = {
  listSessions: (tenantId: string, fiscalYearId: string) => mockRequest(() => sessionsOf(tenantId, fiscalYearId)),
  /** Toutes les séances du tenant, tous exercices confondus — sert à l'affichage du journal consolidé (`Transaction.sessionId` → « Séance #N — date »), jamais un fetch par ligne. */
  listAllSessions: (tenantId: string) => mockRequest(() => fiscalSessions.filter((session) => session.tenantId === tenantId)),
  getSession: (tenantId: string, sessionId: string) => mockRequest(() => getTenantScoped(fiscalSessions, (item) => item.id === sessionId, tenantId)),
  suggestNextSessionDate: (tenantId: string, fiscalYearId: string) => mockRequest(() => suggestNextSession(tenantId, fiscalYearId)),

  /**
   * « Ajouter une séance » — acte manuel, unitaire, jamais une génération en
   * masse (§10/§11 du mandat). Validations (§15/§23) :
   *   - l'exercice existe et appartient au tenant ;
   *   - l'exercice n'est PAS clôturé ;
   *   - la date est dans la période [startDate, endDate] (bornes incluses) ;
   *   - la date est STRICTEMENT postérieure à la dernière séance de l'exercice
   *     (décision 1 : Séance #1 < #2 < #3 chronologiquement — même date ou
   *     date antérieure refusée ; passé, présent ou futur restent permis) ;
   *   - `sessionNumber` généré automatiquement (`max + 1`, jamais saisi).
   */
  createSession: (tenantId: string, fiscalYearId: string, date: string) =>
    mockRequest(() => {
      const year = findFiscalYear(tenantId, fiscalYearId);
      if (!year) return undefined;
      if (year.isClosed) return undefined;
      if (!date || date < year.startDate || date > year.endDate) return undefined;
      const existing = sessionsOf(tenantId, fiscalYearId);
      if (existing.some((item) => item.date >= date)) return undefined;
      const sessionNumber = existing.reduce((max, item) => Math.max(max, item.sessionNumber), 0) + 1;
      const session: FiscalSession = { id: uniqueId('FS'), tenantId, fiscalYearId, sessionNumber, date, createdAt: new Date().toISOString().slice(0, 10) };
      fiscalSessions.push(session);
      return session;
    }),
};
