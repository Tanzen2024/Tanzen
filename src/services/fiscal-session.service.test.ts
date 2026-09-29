import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fiscalSessionService, suggestNextSession, validateSessionBelongsToExercise, sessionsOf, sessionTiming } from './fiscal-session.service';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';
import { fiscalYears } from '@/mocks/settings/fiscal-years';
import { settingsService } from './settings.service';

/**
 * ISOLATION : chaque test mute `fiscalSessions` (module-level) — et le test de
 * clôture mute aussi `fiscalYears` (statut de l'exercice, via
 * `settingsService.closeCurrentFiscalYear`) — restauration des deux seeds
 * exacts avant/après chaque cas pour qu'aucun test ne dépende de l'ordre.
 */
const SESSIONS_SEED = structuredClone(fiscalSessions);
const YEARS_SEED = structuredClone(fiscalYears);
const restoreSeed = () => {
  fiscalSessions.splice(0, fiscalSessions.length, ...structuredClone(SESSIONS_SEED));
  fiscalYears.splice(0, fiscalYears.length, ...structuredClone(YEARS_SEED));
};
beforeEach(restoreSeed);
afterEach(restoreSeed);

describe('fiscalSessionService — reconstruction complète « Exercices fiscaux / Séances »', () => {
  it('un exercice sans aucune séance : listSessions renvoie [] (aucune précréation à la création de l’exercice)', async () => {
    const sessions = await fiscalSessionService.listSessions('T-003', 'FY-T003-2026');
    expect(sessions).toEqual([]);
  });

  it('CALCULER ≠ CRÉER : suggestNextSessionDate ne crée rien — un appel répété renvoie toujours la même suggestion tant qu’aucune séance n’est réellement créée', async () => {
    const before = await fiscalSessionService.listSessions('T-003', 'FY-T003-2026');
    expect(before).toHaveLength(0);
    const first = await fiscalSessionService.suggestNextSessionDate('T-003', 'FY-T003-2026');
    const second = await fiscalSessionService.suggestNextSessionDate('T-003', 'FY-T003-2026');
    // FY-T003-2026 n'a pas de sessionSchedule configuré dans le seed → aucune suggestion, jamais une date inventée.
    expect(first).toBeNull();
    expect(second).toBeNull();
    const after = await fiscalSessionService.listSessions('T-003', 'FY-T003-2026');
    expect(after).toHaveLength(0);
  });

  it('première séance (aucune séance encore créée) : la suggestion respecte la fréquence, jamais avant startDate ni dans le passé', () => {
    const year = fiscalYears.find((item) => item.id === 'FY-T002-2026')!; // « le 5 de chaque mois », startDate 2026-01-01, aucune séance dans le seed.
    const suggestion = suggestNextSession('T-002', year.id, '2026-09-25');
    expect(suggestion! >= year.startDate).toBe(true);
    expect(suggestion).toBe('2026-10-05'); // jamais le 5 janvier : aucune séance → première occurrence STRICTEMENT future.
  });

  it('création réelle de la première séance : createSession persiste réellement, sessionNumber = 1', async () => {
    const created = await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-03-10');
    expect(created).toBeTruthy();
    expect(created!.sessionNumber).toBe(1);
    expect(created!.tenantId).toBe('T-003');
    expect(created!.fiscalYearId).toBe('FY-T003-2026');
    const sessions = await fiscalSessionService.listSessions('T-003', 'FY-T003-2026');
    expect(sessions).toHaveLength(1);
  });

  it('calcul de la séance suivante à partir de la dernière séance réellement créée (FY-T001-2026, deuxième mardi de chaque mois)', async () => {
    await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-11'); // après le seed FS-001 (14/07) — deuxième mardi d'août 2026.
    const next = await fiscalSessionService.suggestNextSessionDate('T-001', 'FY-T001-2026');
    expect(next).toBe('2026-09-08'); // deuxième mardi de septembre 2026.
  });

  it('création progressive : chaque « Ajouter une séance » incrémente sessionNumber de 1, jamais de lot de séances futures créées automatiquement', async () => {
    const first = await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-01-10');
    const second = await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-02-10');
    const third = await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-03-10');
    expect([first!.sessionNumber, second!.sessionNumber, third!.sessionNumber]).toEqual([1, 2, 3]);
    const sessions = await fiscalSessionService.listSessions('T-003', 'FY-T003-2026');
    expect(sessions).toHaveLength(3); // exactement les 3 créées explicitement — aucune autre.
  });

  it('une séance hors période de l’exercice est refusée (avant startDate ou après endDate)', async () => {
    const beforeStart = await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2025-12-31');
    const afterEndDate = await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2027-01-01');
    expect(beforeStart).toBeNull();
    expect(afterEndDate).toBeNull();
    expect(await fiscalSessionService.listSessions('T-003', 'FY-T003-2026')).toHaveLength(0);
  });

  it('une séance dans la période (bornes incluses) est acceptée', async () => {
    const onStart = await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-01-01');
    const onEnd = await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-12-31');
    expect(onStart).toBeTruthy();
    expect(onEnd).toBeTruthy();
  });

  it('un exercice clôturé ne doit plus accepter de nouvelle séance normale', async () => {
    // T-003 a un exercice EN COURS (FY-T003-2026) — le clôturer puis tenter d’y ajouter une séance.
    const closeOutcome = await settingsService.closeFiscalYear('T-003', 'FY-T003-2026');
    expect(closeOutcome.ok).toBe(true);
    const result = await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-06-15');
    expect(result).toBeNull();
  });

  it('sessionNumber est propre à l’exercice, jamais un compteur global au tenant', async () => {
    // FY-T001-2026 porte déjà le seed FS-001 (sessionNumber 1, 14/07) : une nouvelle séance y prend donc le numéro 2.
    const s1 = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-01');
    // FY-T001-2027 — exercice DIFFÉRENT, même tenant, aucune séance encore : repart à 1 (jamais 3, la preuve que ce n'est pas un compteur global au tenant).
    const s2 = await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-06-01');
    expect(s1!.sessionNumber).toBe(2);
    expect(s2!.sessionNumber).toBe(1);
  });

  it('aucun doublon : createSession sur un exercice/tenant inexistant échoue proprement, jamais une écriture partielle', async () => {
    const wrongTenant = await fiscalSessionService.createSession('T-999', 'FY-T003-2026', '2026-06-01');
    const wrongYear = await fiscalSessionService.createSession('T-003', 'FY-DOES-NOT-EXIST', '2026-06-01');
    expect(wrongTenant).toBeNull();
    expect(wrongYear).toBeNull();
    expect(sessionsOf('T-999', 'FY-T003-2026')).toHaveLength(0);
  });

  it('validateSessionBelongsToExercise refuse une séance d’un AUTRE exercice ou d’un AUTRE tenant', async () => {
    const session = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-20');
    expect(validateSessionBelongsToExercise(session!.id, 'FY-T001-2026')).toBe(true);
    expect(validateSessionBelongsToExercise(session!.id, 'FY-T001-2027')).toBe(false);
    expect(validateSessionBelongsToExercise(session!.id, 'FY-T001-2026', 'T-002')).toBe(false);
    expect(validateSessionBelongsToExercise(session!.id, 'FY-T001-2026', 'T-001')).toBe(true);
  });

  it('getSession isole par tenant — une séance d’un autre tenant n’est jamais retournée', async () => {
    const session = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-20');
    const wrongTenantLookup = await fiscalSessionService.getSession('T-002', session!.id);
    const rightTenantLookup = await fiscalSessionService.getSession('T-001', session!.id);
    expect(wrongTenantLookup).toBeNull();
    expect(rightTenantLookup?.id).toBe(session!.id);
  });

  it('listAllSessions retourne toutes les séances du tenant, tous exercices confondus, jamais celles d’un autre tenant', async () => {
    await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-01');
    await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-06-01');
    const all = await fiscalSessionService.listAllSessions('T-001');
    // + le seed FS-001 (T-001, FY-T001-2026) déjà présent.
    expect(all).toHaveLength(3);
    expect(all.every((session) => session.tenantId === 'T-001')).toBe(true);
  });
});

/**
 * Mandat « Gestion des séances » — décisions validées le 2026-09-25 (suggestion comme les
 * Tours Tontines, ordre chronologique strict, état affiché calculé, jamais stocké).
 * `today` est fixé explicitement : jamais de dépendance à l'horloge réelle.
 */
describe('suggestNextSession — première séance et cas « aujourd’hui »', () => {
  const TODAY = '2026-09-25';
  /** Fréquence mensuelle « jour N » posée sur l'exercice (seed restauré après chaque cas). */
  const monthlyOn = (fiscalYearId: string, dayOfMonth: number) => {
    fiscalYears.find((item) => item.id === fiscalYearId)!.sessionSchedule = { frequency: 'MONTHLY', rule: 'DAY_OF_MONTH', dayOfMonth };
  };

  it('exercice commencé + jour 25, aucune séance, aujourd’hui = le 25 → occurrence suivante (25/10)', () => {
    monthlyOn('FY-T003-2026', 25);
    expect(suggestNextSession('T-003', 'FY-T003-2026', TODAY)).toBe('2026-10-25');
  });

  it('exercice commencé + jour 1 → mois suivant (01/10)', () => {
    monthlyOn('FY-T003-2026', 1);
    expect(suggestNextSession('T-003', 'FY-T003-2026', TODAY)).toBe('2026-10-01');
  });

  it('exercice commencé + jour 20 → mois suivant (20/10)', () => {
    monthlyOn('FY-T003-2026', 20);
    expect(suggestNextSession('T-003', 'FY-T003-2026', TODAY)).toBe('2026-10-20');
  });

  it('exercice à venir → respecte sa date de début (le jour même du début reste éligible)', () => {
    monthlyOn('FY-T001-2027', 1);
    expect(suggestNextSession('T-001', 'FY-T001-2027', TODAY)).toBe('2027-01-01');
    monthlyOn('FY-T001-2027', 15);
    expect(suggestNextSession('T-001', 'FY-T001-2027', TODAY)).toBe('2027-01-15');
  });

  it('dernière séance AVANT aujourd’hui + occurrence aujourd’hui → aujourd’hui est proposé', async () => {
    monthlyOn('FY-T003-2026', 25);
    await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-09-20');
    expect(suggestNextSession('T-003', 'FY-T003-2026', TODAY)).toBe('2026-09-25');
  });

  it('dernière séance AUJOURD’HUI → occurrence suivante', async () => {
    monthlyOn('FY-T003-2026', 25);
    await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-09-25');
    expect(suggestNextSession('T-003', 'FY-T003-2026', TODAY)).toBe('2026-10-25');
  });

  it('une séance existe : la suggestion part de la DERNIÈRE séance, même ancienne, jamais d’aujourd’hui', async () => {
    monthlyOn('FY-T003-2026', 25);
    await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-03-10');
    expect(suggestNextSession('T-003', 'FY-T003-2026', TODAY)).toBe('2026-03-25');
  });

  it('la suggestion n’écrit rien, même répétée', () => {
    monthlyOn('FY-T003-2026', 25);
    const before = fiscalSessions.length;
    suggestNextSession('T-003', 'FY-T003-2026', TODAY);
    suggestNextSession('T-003', 'FY-T003-2026', TODAY);
    expect(fiscalSessions.length).toBe(before);
  });
});

describe('createSession — ordre chronologique strict (Séance #1 < #2 < #3)', () => {
  it('même date que la dernière séance → refus', async () => {
    await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-05-10');
    expect(await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-05-10')).toBeNull();
    expect(sessionsOf('T-003', 'FY-T003-2026')).toHaveLength(1);
  });

  it('date antérieure à la dernière séance → refus', async () => {
    await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-05-10');
    expect(await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-05-09')).toBeNull();
    expect(sessionsOf('T-003', 'FY-T003-2026')).toHaveLength(1);
  });

  it('date postérieure → acceptée avec le numéro suivant ; une date passée reste permise tant qu’elle suit la dernière séance', async () => {
    await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-02-10');
    const second = await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-02-11');
    expect(second?.sessionNumber).toBe(2);
    expect(sessionsOf('T-003', 'FY-T003-2026').map((session) => session.date)).toEqual(['2026-02-10', '2026-02-11']);
  });

  it('l’ordre est propre à l’exercice : une séance d’un autre exercice ne bloque jamais', async () => {
    // FS-001 (FY-T001-2026, 14/07/2026) n'empêche pas une séance en début d'exercice 2027.
    expect(await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-01-05')).toBeTruthy();
  });
});

describe('État affiché d’une séance — calculé, jamais stocké', () => {
  it('FiscalSession n’a aucune propriété status : exactement id, tenantId, fiscalYearId, sessionNumber, date, createdAt', async () => {
    const session = await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-06-01');
    expect(Object.keys(session!).sort()).toEqual(['createdAt', 'date', 'fiscalYearId', 'id', 'sessionNumber', 'tenantId']);
    expect(fiscalSessions.every((item) => !('status' in item))).toBe(true);
  });

  it('À venir / Aujourd’hui / Passée selon la date', () => {
    expect(sessionTiming('2026-09-26', '2026-09-25')).toBe('upcoming');
    expect(sessionTiming('2026-09-25', '2026-09-25')).toBe('today');
    expect(sessionTiming('2026-09-24', '2026-09-25')).toBe('past');
  });
});

describe('Exercice 2027, « Mensuelle, jour 20 » — prochaine séance (bug « Prochaine séance → — »)', () => {
  const TODAY = '2026-09-25';
  beforeEach(() => { fiscalYears.find((item) => item.id === 'FY-T001-2027')!.sessionSchedule = { frequency: 'MONTHLY', rule: 'DAY_OF_MONTH', dayOfMonth: 20 }; });

  it('CAS 1 — dernière séance 20/01/2027 → 20/02/2027', async () => {
    await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-01-20');
    expect(await fiscalSessionService.suggestNextSessionDate('T-001', 'FY-T001-2027')).toBe('2027-02-20');
  });

  it('CAS 2 — séances 20/01 et 20/02/2027 → 20/03/2027', async () => {
    await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-01-20');
    await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-02-20');
    expect(await fiscalSessionService.suggestNextSessionDate('T-001', 'FY-T001-2027')).toBe('2027-03-20');
  });

  it('CAS 3 — aucune séance : première occurrence à partir du début d’exercice (exercice à venir) → 20/01/2027', () => {
    expect(suggestNextSession('T-001', 'FY-T001-2027', TODAY)).toBe('2027-01-20');
  });

  it('CAS 4 — l’occurrence suivante dépasserait la fin d’exercice → aucune suggestion hors exercice', async () => {
    await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-12-20');
    expect(await fiscalSessionService.suggestNextSessionDate('T-001', 'FY-T001-2027')).toBeNull();
  });

  it('CAS 7 — calculer la prochaine séance n’écrit rien', async () => {
    await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-01-20');
    const before = structuredClone(fiscalSessions);
    await fiscalSessionService.suggestNextSessionDate('T-001', 'FY-T001-2027');
    await fiscalSessionService.suggestNextSessionDate('T-001', 'FY-T001-2027');
    expect(fiscalSessions).toEqual(before);
  });
});
