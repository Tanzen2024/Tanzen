import { describe, it, expect } from 'vitest';
import { tontineTurnsService } from './tontine-turns.service';
import { tontinesService } from './tontines.service';
import { financeService } from './finance.service';
import { transactions } from '@/mocks/finance/transactions';

/**
 * Mandat « Finalisation Finance/Tontines » — objectif MAJEUR : intégration
 * Tontine ↔ Finance. Chaque test construit sa propre Tontine/Période/
 * Adhésion/Occurrence (même convention que `tontine-rotation.test.ts`),
 * liée ou non à une caisse Finance réelle, pour vérifier :
 *   - qu'une cotisation/réception MONEY sur une tontine RATTACHÉE à une caisse
 *     poste réellement une Transaction Finance qui affecte le solde du compte ;
 *   - qu'une tontine NON rattachée (rétrocompatibilité totale, cas de toutes
 *     les tontines seedées avant ce mandat) ne poste jamais rien ;
 *   - qu'une tontine GOODS ne poste jamais de Transaction, même rattachée.
 */
const TENANT = 'T-001';
const ACCOUNT_ID = 'AC-002'; // CS-001-ÉPG, tenant T-001

async function makeLinkedTontine() {
  return (await tontinesService.createTontine({
    tenantId: TENANT, name: `Intégration ${Date.now()}-${Math.random()}`, valueType: 'MONEY', currency: 'XOF',
    purchaseMode: 'WITHOUT_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 25_000, accountId: ACCOUNT_ID,
  }))!;
}

async function makeUnlinkedTontine() {
  return (await tontinesService.createTontine({
    tenantId: TENANT, name: `Sans compte ${Date.now()}-${Math.random()}`, valueType: 'MONEY', currency: 'XOF',
    purchaseMode: 'WITHOUT_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 25_000,
  }))!;
}

async function makeGoodsTontine() {
  return (await tontinesService.createTontine({
    tenantId: TENANT, name: `Nature ${Date.now()}-${Math.random()}`, valueType: 'GOODS', item: 'Sac de riz', quantity: 1, unit: 'SAC',
    frequency: 'MONTHLY', monthlyDayOfMonth: 1, accountId: ACCOUNT_ID,
  }))!;
}

async function makeAdhesionAndOccurrence(tontineId: string, memberId: string, memberName: string) {
  const period = (await tontineTurnsService.createPeriod(TENANT, { tontineId, startDate: '2026-01-01', endDate: '2026-12-31' }))!;
  const adhesion = (await tontineTurnsService.createAdhesion(TENANT, { periodId: period.id, memberId, memberName, joinedAt: '2026-01-01' }))!;
  const occurrence = (await tontineTurnsService.createOccurrence(TENANT, { periodId: period.id, occurrenceNumber: 1, plannedDate: '2026-02-01' }))!;
  return { period, adhesion, occurrence };
}

describe('Intégration Tontine ↔ Finance — Cotisation → Transaction → Compte', () => {
  it('une tontine RATTACHÉE à une caisse poste une Transaction EPARGNE qui augmente le solde du compte', async () => {
    const tontine = await makeLinkedTontine();
    const { adhesion, occurrence } = await makeAdhesionAndOccurrence(tontine.id, 'M-INT-1', 'Membre Intégration 1');
    const contribution = (await tontineTurnsService.createContribution(TENANT, { adhesionId: adhesion.id, tontineOccurrenceId: occurrence.id, valueType: 'MONEY', expectedAmount: 25_000 }))!;

    const accountBefore = (await financeService.getAccount(TENANT, ACCOUNT_ID))!;
    const transactionsBefore = transactions.length;

    await tontineTurnsService.recordContributionPayment(TENANT, contribution.id, { amount: 25_000 });

    expect(transactions.length).toBe(transactionsBefore + 1);
    const created = transactions[transactions.length - 1];
    expect(created.category).toBe('EPARGNE');
    expect(created.type).toBe('credit');
    expect(created.amount).toBe(25_000);
    expect(created.memberId).toBe('M-INT-1');
    expect(created.toAccount).toBe('CS-001-ÉPG');

    const accountAfter = (await financeService.getAccount(TENANT, ACCOUNT_ID))!;
    expect(accountAfter.balance).toBe(accountBefore.balance + 25_000);
  });

  it('une tontine NON rattachée à une caisse ne poste AUCUNE Transaction (rétrocompatibilité totale)', async () => {
    const tontine = await makeUnlinkedTontine();
    const { adhesion, occurrence } = await makeAdhesionAndOccurrence(tontine.id, 'M-INT-2', 'Membre Intégration 2');
    const contribution = (await tontineTurnsService.createContribution(TENANT, { adhesionId: adhesion.id, tontineOccurrenceId: occurrence.id, valueType: 'MONEY', expectedAmount: 25_000 }))!;

    const transactionsBefore = transactions.length;
    const result = await tontineTurnsService.recordContributionPayment(TENANT, contribution.id, { amount: 25_000 });

    expect(result).not.toBeNull();
    expect(result?.paidAmount).toBe(25_000); // la mutation Tontine elle-même reste inchangée
    expect(transactions.length).toBe(transactionsBefore); // mais aucune Transaction Finance n'est créée
  });

  it('une tontine GOODS (rattachée ou non) ne poste jamais de Transaction — aucun flux monétaire à faire transiter', async () => {
    const tontine = await makeGoodsTontine();
    const { adhesion, occurrence } = await makeAdhesionAndOccurrence(tontine.id, 'M-INT-3', 'Membre Intégration 3');
    const contribution = (await tontineTurnsService.createContribution(TENANT, { adhesionId: adhesion.id, tontineOccurrenceId: occurrence.id, valueType: 'GOODS', expectedQuantity: 1, item: 'Sac de riz', unit: 'SAC' }))!;

    const transactionsBefore = transactions.length;
    await tontineTurnsService.recordContributionPayment(TENANT, contribution.id, { quantity: 1 });
    expect(transactions.length).toBe(transactionsBefore);
  });
});

describe('Intégration Tontine ↔ Finance — Réception bénéficiaire → Transaction → Compte', () => {
  it('une réception MONEY sur une tontine rattachée poste une Transaction AUTRES/DISTRIBUTION qui diminue le solde du compte', async () => {
    const tontine = await makeLinkedTontine();
    const { adhesion, occurrence } = await makeAdhesionAndOccurrence(tontine.id, 'M-INT-4', 'Membre Intégration 4');
    const { created } = (await tontineTurnsService.addBeneficiaries(TENANT, occurrence.id, { adhesionIds: [adhesion.id], valueType: 'MONEY', expectedAmount: 150_000 }))!;
    const beneficiary = created[0];

    const accountBefore = (await financeService.getAccount(TENANT, ACCOUNT_ID))!;
    const transactionsBefore = transactions.length;

    await tontineTurnsService.recordReception(TENANT, beneficiary.id, { amount: 150_000 });

    expect(transactions.length).toBe(transactionsBefore + 1);
    const transaction = transactions[transactions.length - 1];
    expect(transaction.category).toBe('AUTRES');
    expect(transaction.subcategory).toBe('DISTRIBUTION');
    expect(transaction.type).toBe('debit');
    expect(transaction.amount).toBe(150_000);
    expect(transaction.memberId).toBe('M-INT-4');
    expect(transaction.fromAccount).toBe('CS-001-ÉPG');

    const accountAfter = (await financeService.getAccount(TENANT, ACCOUNT_ID))!;
    expect(accountAfter.balance).toBe(accountBefore.balance - 150_000);
  });

  it('une réception sans montant (GOODS ou correction nulle) ne poste aucune Transaction', async () => {
    const tontine = await makeLinkedTontine();
    const { adhesion, occurrence } = await makeAdhesionAndOccurrence(tontine.id, 'M-INT-5', 'Membre Intégration 5');
    const { created } = (await tontineTurnsService.addBeneficiaries(TENANT, occurrence.id, { adhesionIds: [adhesion.id], valueType: 'MONEY', expectedAmount: 50_000 }))!;
    const beneficiary = created[0];

    const transactionsBefore = transactions.length;
    await tontineTurnsService.recordReception(TENANT, beneficiary.id, {});
    expect(transactions.length).toBe(transactionsBefore);
  });
});
