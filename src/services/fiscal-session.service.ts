import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { fiscalSessions, type FiscalSession } from '@/mocks/settings/fiscal-sessions';
import { fiscalYears, type FiscalYear } from '@/mocks/settings/fiscal-years';
import { suggestNextSessionDate as computeSuggestNextSessionDate } from '@/mocks/settings/session-schedule';

/**
 * Service central des SÉANCES d'exercice fiscal — reconstruction complète,
 * remplace `meeting.service.ts` (supprimé). Point d'entrée UNIQUE pour toute
 * création/consultation de séance et pour le rattachement `Transaction.sessionId`.
 *
 * Contrairement à l'ancien mécanisme (réunions dérivées, virtuelles), une
 * `FiscalSession` est une entité RÉELLE, persistée UNE PAR UNE — jamais de
 * génération en masse (même principe que `tontineOperationsService.createOccurrence`).
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
export function sessionsOf(tenantId: string, fiscalYearId: string): FiscalSession[] {
  return fiscalSessions.filter((session) => session.tenantId === tenantId && session.fiscalYearId === fiscalYearId).sort((a, b) => a.sessionNumber - b.sessionNumber);
}

/**
 * Prochaine date de séance suggérée (fonction pure, AUCUNE écriture) —
 * `null` si aucune fréquence n'est configurée, si l'exercice n'existe pas, ou
 * si la fréquence ne produit plus aucune date dans la période restante
 * (§7 du mandat : la clôture de l'exercice gère la fin de période, jamais une
 * séance forcée hors période).
 *
 * `suggestNextSessionDate` (moteur, `session-schedule.ts`) traite `afterDate`
 * de façon INCLUSIVE (une candidate égale à `afterDate` est valide) — nécessaire
 * pour la Séance 0 : la première séance peut légitimement tomber le jour même
 * du début d'exercice. Quand une séance existe déjà, on avance donc
 * `afterDate` d'un jour AVANT l'appel, pour que la suggestion soit toujours
 * strictement postérieure à la dernière séance réellement créée.
 */
export function suggestNextSession(tenantId: string, fiscalYearId: string): string | null {
  const year = findFiscalYear(tenantId, fiscalYearId);
  if (!year || !year.sessionSchedule) return null;
  const existing = sessionsOf(tenantId, fiscalYearId);
  const afterDate = existing.length > 0 ? nextDayISO(existing[existing.length - 1].date) : year.startDate;
  return computeSuggestNextSessionDate(year.sessionSchedule, afterDate, year.endDate);
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
   *   - `sessionNumber` généré automatiquement (`max + 1`, jamais saisi).
   */
  createSession: (tenantId: string, fiscalYearId: string, date: string) =>
    mockRequest(() => {
      const year = findFiscalYear(tenantId, fiscalYearId);
      if (!year) return undefined;
      if (year.status === 'closed') return undefined;
      if (!date || date < year.startDate || date > year.endDate) return undefined;
      const existing = sessionsOf(tenantId, fiscalYearId);
      const sessionNumber = existing.reduce((max, item) => Math.max(max, item.sessionNumber), 0) + 1;
      const session: FiscalSession = { id: uniqueId('FS'), tenantId, fiscalYearId, sessionNumber, date, createdAt: new Date().toISOString().slice(0, 10) };
      fiscalSessions.push(session);
      return session;
    }),
};
