import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fiscalSessionService, suggestNextSession, validateSessionBelongsToExercise, sessionsOf } from './fiscal-session.service';
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

  it('première séance (aucune séance encore créée) : la suggestion respecte la fréquence ET ne propose jamais une date avant startDate', () => {
    const year = fiscalYears.find((item) => item.id === 'FY-T002-2026')!; // « le 5 de chaque mois », startDate 2026-01-01, aucune séance dans le seed.
    const suggestion = suggestNextSession('T-002', year.id);
    expect(suggestion).not.toBeNull();
    expect(suggestion! >= year.startDate).toBe(true);
    expect(suggestion).toBe('2026-01-05'); // le 5 janvier 2026 — la période EN COURS (mois de startDate) reste éligible.
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
    await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-01-13');
    const next = await fiscalSessionService.suggestNextSessionDate('T-001', 'FY-T001-2026');
    expect(next).toBe('2026-02-10'); // deuxième mardi de février 2026.
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
    // T-003 a un exercice OUVERT (FY-T003-2026, isCurrent) — le clôturer puis tenter d’y ajouter une séance.
    const closeOutcome = await settingsService.closeCurrentFiscalYear('T-003');
    expect(closeOutcome.ok).toBe(true);
    const result = await fiscalSessionService.createSession('T-003', 'FY-T003-2026', '2026-06-15');
    expect(result).toBeNull();
  });

  it('sessionNumber est propre à l’exercice, jamais un compteur global au tenant', async () => {
    // FY-T001-2026 porte déjà le seed FS-001 (sessionNumber 1) : une nouvelle séance y prend donc le numéro 2.
    const s1 = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-06-01');
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
    const session = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-02-10');
    expect(validateSessionBelongsToExercise(session!.id, 'FY-T001-2026')).toBe(true);
    expect(validateSessionBelongsToExercise(session!.id, 'FY-T001-2027')).toBe(false);
    expect(validateSessionBelongsToExercise(session!.id, 'FY-T001-2026', 'T-002')).toBe(false);
    expect(validateSessionBelongsToExercise(session!.id, 'FY-T001-2026', 'T-001')).toBe(true);
  });

  it('getSession isole par tenant — une séance d’un autre tenant n’est jamais retournée', async () => {
    const session = await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-02-10');
    const wrongTenantLookup = await fiscalSessionService.getSession('T-002', session!.id);
    const rightTenantLookup = await fiscalSessionService.getSession('T-001', session!.id);
    expect(wrongTenantLookup).toBeNull();
    expect(rightTenantLookup?.id).toBe(session!.id);
  });

  it('listAllSessions retourne toutes les séances du tenant, tous exercices confondus, jamais celles d’un autre tenant', async () => {
    await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-06-01');
    await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-06-01');
    const all = await fiscalSessionService.listAllSessions('T-001');
    // + le seed FS-001 (T-001, FY-T001-2026) déjà présent.
    expect(all).toHaveLength(3);
    expect(all.every((session) => session.tenantId === 'T-001')).toBe(true);
  });
});
