import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { financeService, insertTransaction, cashboxAvailableBalance } from './finance.service';
import { financePositionService } from './finance-position.service';
import { fiscalSessionService } from './fiscal-session.service';
import { cashboxes } from '@/mocks/finance/cashboxes';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { tontines } from '@/mocks/tontines/tontines';
import { auditEvents } from '@/mocks/audit/audit-events';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';

/**
 * Mandat « Évolution globale du module Finance » §27-§32 (tests §50) : cycle de
 * vie Active → Désactivée → Archivée d'une caisse, sans aucune suppression, et
 * refus SERVICE de toute nouvelle transaction sur une caisse non opérationnelle.
 * AC-012 « Transport » (T-001) : caisse ordinaire, sans prêt financé ni tontine liée.
 */
const STORES = { cashboxes, transactions, loans, loanFundingAllocations, tontines, auditEvents, fiscalSessions } as const;
const SEEDS = Object.fromEntries(Object.entries(STORES).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof STORES, unknown[]>;
function restore() {
  for (const [name, list] of Object.entries(STORES)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEEDS[name as keyof typeof STORES]));
}
beforeEach(restore);
afterEach(restore);

const status = (id: string) => cashboxes.find((cashbox) => cashbox.id === id)?.status;
const epargneOn = (cashboxNumber: string) => insertTransaction('T-001', { cashboxNumber, memberId: 'M-001', memberName: 'Fatou Ndiaye', category: 'EPARGNE', type: 'credit', amount: 1_000, description: 'test cycle de vie' });

describe('Caisse — cycle de vie (service)', () => {
  it('supprimer (désactivation logique) → réactiver → archiver → désarchiver : transitions réversibles, auditées', async () => {
    expect(await financeService.deleteCashbox('T-001', 'AC-012')).toMatchObject({ ok: true });
    expect(status('AC-012')).toBe('inactive');
    expect(await financeService.reactivateCashbox('T-001', 'AC-012')).toBeTruthy();
    expect(status('AC-012')).toBe('active');
    expect(await financeService.archiveCashbox('T-001', 'AC-012')).toMatchObject({ ok: true });
    expect(status('AC-012')).toBe('archived');
    // Désarchiver rend la caisse « Désactivée » : la réactivation reste un acte explicite.
    expect(await financeService.unarchiveCashbox('T-001', 'AC-012')).toMatchObject({ ok: true });
    expect(status('AC-012')).toBe('inactive');
    const actions = auditEvents.filter((event) => event.resourceId === 'AC-012').map((event) => event.action);
    expect(actions).toEqual(['finance.cashbox.deleted', 'finance.cashbox.reactivated', 'finance.cashbox.archived', 'finance.cashbox.unarchived']);
  });

  it('une caisse désactivée peut être archivée ; transitions invalides refusées avec leur raison', async () => {
    await financeService.deleteCashbox('T-001', 'AC-012');
    expect(await financeService.deleteCashbox('T-001', 'AC-012')).toEqual({ ok: false, reason: 'invalidStatus' });
    expect(await financeService.archiveCashbox('T-001', 'AC-012')).toMatchObject({ ok: true });
    expect(await financeService.archiveCashbox('T-001', 'AC-012')).toEqual({ ok: false, reason: 'invalidStatus' });
    expect(await financeService.unarchiveCashbox('T-001', 'AC-011')).toEqual({ ok: false, reason: 'invalidStatus' });
    expect(await financeService.reactivateCashbox('T-001', 'AC-011')).toBeNull();
    // Isolation tenant : jamais la caisse d'un autre tenant.
    expect(await financeService.deleteCashbox('T-002', 'AC-012')).toBeNull();
  });

  it('nouvelles transactions refusées par le SERVICE sur une caisse désactivée ou archivée, de nouveau acceptées après réactivation', async () => {
    await financeService.deleteCashbox('T-001', 'AC-012');
    expect(epargneOn('CS-001-CX-004')).toBeUndefined();
    await financeService.archiveCashbox('T-001', 'AC-012');
    expect(epargneOn('CS-001-CX-004')).toBeUndefined();
    await financeService.unarchiveCashbox('T-001', 'AC-012');
    await financeService.reactivateCashbox('T-001', 'AC-012');
    expect(epargneOn('CS-001-CX-004')).toMatchObject({ destination: 'CS-001-CX-004', status: 'completed' });
  });

  it('historique conservé : archiver ne supprime ni la caisse, ni ses transactions, ni son solde', async () => {
    const before = transactions.filter((tx) => tx.source === 'CS-001-CX-004' || tx.destination === 'CS-001-CX-004').map((tx) => tx.id);
    const balance = cashboxAvailableBalance('T-001', 'AC-012');
    expect(before.length).toBeGreaterThan(0);
    await financeService.archiveCashbox('T-001', 'AC-012');
    expect(cashboxes.some((cashbox) => cashbox.id === 'AC-012')).toBe(true);
    expect(transactions.filter((tx) => tx.source === 'CS-001-CX-004' || tx.destination === 'CS-001-CX-004').map((tx) => tx.id)).toEqual(before);
    expect(cashboxAvailableBalance('T-001', 'AC-012')).toBe(balance);
    // Toujours consultable (liste + situation de l'exercice).
    expect((await financeService.getCashbox('T-001', 'AC-012'))?.status).toBe('archived');
    expect((await financePositionService.cashboxForFiscalYear('T-001', 'AC-012', 'FY-T001-2026'))?.status).toBe('archived');
  });

  it('une caisse archivée est en consultation seule : modification refusée', async () => {
    await financeService.archiveCashbox('T-001', 'AC-012');
    expect(await financeService.updateCashbox('T-001', 'AC-012', { description: 'x' })).toBeNull();
    await financeService.unarchiveCashbox('T-001', 'AC-012');
    expect(await financeService.updateCashbox('T-001', 'AC-012', { description: 'x' })).toMatchObject({ description: 'x' });
  });

  it('raisons métier réelles : caisse système, caisse finançant un prêt actif, caisse d’une tontine active', async () => {
    expect(await financeService.deleteCashbox('T-001', 'AC-009')).toEqual({ ok: false, reason: 'systemProtected' });
    expect(await financeService.archiveCashbox('T-001', 'AC-015')).toEqual({ ok: false, reason: 'systemProtected' });

    const activeLoan = loans.find((loan) => loan.tenantId === 'T-001' && loan.status === 'active' && loan.outstanding > 0)!;
    loanFundingAllocations.push({ id: 'LFA-TEST', tenantId: 'T-001', loanId: activeLoan.id, cashboxId: 'AC-012', amount: 10_000, transactionId: 'TR-TEST' } as never);
    expect(await financeService.deleteCashbox('T-001', 'AC-012')).toEqual({ ok: false, reason: 'fundsActiveLoan' });
    expect(await financeService.archiveCashbox('T-001', 'AC-012')).toEqual({ ok: false, reason: 'fundsActiveLoan' });
    loanFundingAllocations.splice(0, loanFundingAllocations.length);

    tontines.find((tontine) => tontine.id === 'TON-004')!.cashboxId = 'AC-012';
    expect(await financeService.deleteCashbox('T-001', 'AC-012')).toEqual({ ok: false, reason: 'linkedToActiveTontine' });
    expect(status('AC-012')).toBe('active');
  });
});

describe('Récapitulatif par séance — moteur existant (tests §47/§49)', () => {
  it('« Toutes les séances » = situation de l’exercice, strictement identique à cashboxesForFiscalYear', async () => {
    expect(await financePositionService.cashboxesForSession('T-001', 'FY-T001-2026', undefined)).toEqual(await financePositionService.cashboxesForFiscalYear('T-001', 'FY-T001-2026'));
  });

  it('séance précise : ouverture = ouverture d’exercice + séances antérieures ; crédit/débit = mouvements de CETTE séance', async () => {
    // Transport : ses mouvements de démonstration de séance 1 (3 cotisations de 5 000, frais 12 000), sans report d'ouverture.
    const transport = (await financePositionService.cashboxesForSession('T-001', 'FY-T001-2026', 'FS-001'))!.find((line) => line.id === 'AC-012')!;
    expect([transport.yearOpeningBalance, transport.inflows, transport.outflows, transport.balance]).toEqual([0, 15_000, 12_000, 3_000]);
    const seance1 = epargneOn('CS-001-CX-001')!;
    seance1.amount = 50_000; seance1.sessionId = 'FS-001'; seance1.fiscalYearId = 'FY-T001-2026';
    const first = (await financePositionService.cashboxesForSession('T-001', 'FY-T001-2026', 'FS-001'))!.find((line) => line.id === 'AC-009')!;
    // Séance 1 d'Épargne : journal de démonstration (entrées 285 000, prêt L-001 850 000) + ce crédit de 50 000.
    expect([first.yearOpeningBalance, first.inflows, first.outflows, first.balance]).toEqual([8_650_000, 335_000, 850_000, 8_135_000]);

    const second = (await fiscalSessionService.createSession('T-001', 'FY-T001-2026', '2026-08-20'))!;
    const tx = epargneOn('CS-001-CX-001')!;
    tx.sessionId = second.id; tx.fiscalYearId = 'FY-T001-2026';
    const line = (await financePositionService.cashboxesForSession('T-001', 'FY-T001-2026', second.id))!.find((item) => item.id === 'AC-009')!;
    // Ouverture de la séance 2 = solde de fin de séance 1 (8 135 000) ; ses propres mouvements = 1 000.
    expect([line.yearOpeningBalance, line.inflows, line.outflows, line.balance]).toEqual([8_135_000, 1_000, 0, 8_136_000]);
    // La séance 1 n'est jamais modifiée par une transaction de la séance 2.
    expect((await financePositionService.cashboxesForSession('T-001', 'FY-T001-2026', 'FS-001'))!.find((item) => item.id === 'AC-009')!.balance).toBe(8_135_000);
  });
});
