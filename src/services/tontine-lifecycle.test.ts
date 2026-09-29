import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tontinesService } from './tontines.service';
import { tontineOperationsService } from './tontine-operations.service';
import {
  tontines, tontineAdhesions, tontineOccurrences, occurrenceBeneficiaries, tontineContributions, tontineBeneficiaryPlans, tontineRemainders, tontineCycles,
} from '@/mocks/tontines/tontines';
import { transactions } from '@/mocks/finance/transactions';
import { auditEvents } from '@/mocks/audit/audit-events';

/**
 * Mandat « Évolution globale du module Finance » §33-§39 (tests §51) : cycle de
 * vie d'une Tontine (Active · Désactivée · Archivée) SANS toucher aux règles
 * métier existantes. TON-004 (T-001, avec achat) a un Tour OCC-004 encore
 * ouvert (PLANNED) ; TON-001 (T-002, sans achat) a un Tour OCC-002 ouvert ;
 * TON-005 (T-004) est déjà désactivée et n'a aucun Tour.
 */
const STORES = { tontines, tontineAdhesions, tontineOccurrences, occurrenceBeneficiaries, tontineContributions, tontineBeneficiaryPlans, tontineRemainders, tontineCycles, transactions, auditEvents } as const;
const SEEDS = Object.fromEntries(Object.entries(STORES).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof STORES, unknown[]>;
function restore() {
  for (const [name, list] of Object.entries(STORES)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEEDS[name as keyof typeof STORES]));
}
beforeEach(restore);
afterEach(restore);

const status = (id: string) => tontines.find((tontine) => tontine.id === id)?.status;
/** Photographie de tout l'historique d'une Tontine (tours, participations, bénéficiaires, cotisations, plans, reliquats, cycles). */
function history(tontineId: string) {
  const occurrenceIds = new Set(tontineOccurrences.filter((item) => item.tontineId === tontineId).map((item) => item.id));
  return JSON.stringify({
    occurrences: tontineOccurrences.filter((item) => item.tontineId === tontineId),
    adhesions: tontineAdhesions.filter((item) => item.tontineId === tontineId),
    beneficiaries: occurrenceBeneficiaries.filter((item) => occurrenceIds.has(item.occurrenceId)),
    contributions: tontineContributions.filter((item) => occurrenceIds.has(item.occurrenceId)),
    plans: tontineBeneficiaryPlans.filter((item) => item.tontineId === tontineId),
    remainders: tontineRemainders.filter((item) => item.tontineId === tontineId),
    cycles: tontineCycles.filter((item) => item.tontineId === tontineId),
  });
}

describe('Tontine — cycle de vie (service)', () => {
  it('désactiver → réactiver : réversible, historique inchangé', async () => {
    const before = history('TON-004');
    expect(await tontinesService.deleteTontine('T-001', 'TON-004')).toMatchObject({ ok: true });
    expect(status('TON-004')).toBe('statusInactive');
    expect(history('TON-004')).toBe(before);
    expect(await tontinesService.reactivateTontine('T-001', 'TON-004')).toMatchObject({ ok: true });
    expect(status('TON-004')).toBe('statusActive');
    expect(history('TON-004')).toBe(before);
  });

  it('archiver : REFUSÉ tant qu’un Tour est ouvert (la clôture reste soumise à ses propres règles), même désactivée', async () => {
    expect(await tontinesService.archiveTontine('T-001', 'TON-004')).toEqual({ ok: false, reason: 'occurrenceInProgress' });
    await tontinesService.deleteTontine('T-001', 'TON-004');
    expect(await tontinesService.archiveTontine('T-001', 'TON-004')).toEqual({ ok: false, reason: 'occurrenceInProgress' });
    expect(status('TON-004')).toBe('statusInactive');
    // Le Tour ouvert n'a jamais été clôturé (ni contourné) par ces tentatives.
    expect(tontineOccurrences.find((item) => item.id === 'OCC-004')?.status).toBe('PLANNED');
  });

  it('archiver / désarchiver une tontine sans Tour ouvert : historique conservé, désarchivage vers « Désactivée »', async () => {
    const before = history('TON-005');
    expect(await tontinesService.archiveTontine('T-004', 'TON-005')).toMatchObject({ ok: true });
    expect(status('TON-005')).toBe('statusArchived');
    expect(history('TON-005')).toBe(before);
    expect((await tontinesService.getTontine('T-004', 'TON-005'))?.status).toBe('statusArchived'); // toujours consultable
    expect(await tontinesService.updateTontine('T-004', 'TON-005', { name: 'Renommée' })).toBeNull(); // consultation seule
    expect(await tontinesService.unarchiveTontine('T-004', 'TON-005')).toMatchObject({ ok: true });
    expect(status('TON-005')).toBe('statusInactive');
  });

  it('transitions invalides refusées ; isolation tenant', async () => {
    expect(await tontinesService.reactivateTontine('T-001', 'TON-004')).toEqual({ ok: false, reason: 'invalidStatus' });
    expect(await tontinesService.unarchiveTontine('T-001', 'TON-004')).toEqual({ ok: false, reason: 'invalidStatus' });
    expect(await tontinesService.deleteTontine('T-004', 'TON-005')).toEqual({ ok: false, reason: 'invalidStatus' });
    expect(await tontinesService.deleteTontine('T-002', 'TON-004')).toBeNull();
  });
});

describe('Tontine non active — nouvelles opérations refusées côté SERVICE', () => {
  it('désactivée : participation, tour, bénéficiaire, cotisation, paiement, clôture refusés ; historique intact', async () => {
    await tontinesService.deleteTontine('T-001', 'TON-004');
    const before = history('TON-004');
    const transactionCount = transactions.length;
    expect(await tontinesService.addAdhesion('T-001', 'TON-004', 'M-001', '2026-09-01')).toBeNull();
    expect(await tontinesService.addAdhesions('T-001', 'TON-004', ['M-001'], '2026-09-01')).toEqual({ created: [], skipped: 1 });
    expect(await tontinesService.closeAdhesion('T-001', 'ADH-007', '2026-09-01')).toBeNull();
    expect(await tontineOperationsService.createOccurrence('T-001', 'TON-004', '2026-10-01')).toBeNull();
    expect(await tontineOperationsService.addOccurrenceBeneficiary('T-001', 'OCC-004', 'ADH-007', 25_000)).toBeNull();
    expect(await tontineOperationsService.recordContribution('T-001', 'OCC-004', 'ADH-007', 25_000)).toBeNull();
    expect(await tontineOperationsService.setContributionPayment('T-001', 'OCC-004', 'ADH-007', true)).toBeNull();
    expect(await tontineOperationsService.markAllContributionsPaid('T-001', 'OCC-004')).toBeNull();
    expect(await tontineOperationsService.closeOccurrence('T-001', 'OCC-004')).toBeNull();
    expect(await tontineOperationsService.startNewCycle('T-001', 'TON-004')).toBeNull();
    expect(history('TON-004')).toBe(before);
    expect(transactions.length).toBe(transactionCount); // aucune écriture Finance
  });

  it('sans achat désactivée : plan de passage figé (ajout / retrait refusés)', async () => {
    await tontinesService.deleteTontine('T-002', 'TON-001');
    expect(await tontineOperationsService.addPlanEntry('T-002', 'TON-001', 'ADH-001')).toBeNull();
    expect(await tontineOperationsService.addPlanEntries('T-002', 'TON-001', ['ADH-001'])).toMatchObject({ added: [] });
    expect(await tontineOperationsService.removePlanEntry('T-002', 'PLN-002')).toBeNull();
    expect(tontineBeneficiaryPlans.some((plan) => plan.id === 'PLN-002')).toBe(true);
  });

  it('réactivée : les opérations redeviennent possibles, avec leurs règles habituelles', async () => {
    await tontinesService.deleteTontine('T-001', 'TON-004');
    await tontinesService.reactivateTontine('T-001', 'TON-004');
    expect(await tontineOperationsService.createOccurrence('T-001', 'TON-004', '2026-10-01')).toMatchObject({ tontineId: 'TON-004', status: 'PLANNED' });
    expect(await tontineOperationsService.setContributionPayment('T-001', 'OCC-004', 'ADH-007', true)).toMatchObject({ paid: true });
  });

  it('une tontine active garde exactement son comportement : aucune régression sur les opérations', async () => {
    expect(await tontineOperationsService.setContributionPayment('T-001', 'OCC-004', 'ADH-007', true)).toMatchObject({ paid: true });
    // Clôture toujours soumise à ses règles existantes (cotisations incomplètes → refus), jamais assouplie.
    expect(await tontineOperationsService.closeOccurrence('T-001', 'OCC-004')).toBeNull();
  });
});
