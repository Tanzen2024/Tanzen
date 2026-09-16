import { describe, it, expect } from 'vitest';
import { tontinesService } from './tontines.service';
import { tontineTurnsService } from './tontine-turns.service';
import { financeService } from './finance.service';
import { transactions } from '@/mocks/finance/transactions';

/**
 * Mandat « Avec achat » — RÈGLE FINANCIÈRE CRITIQUE : la caisse « Achat
 * tontine » ne doit recevoir QUE les montants d'achat réellement effectués
 * (`ReceptionOperation.purchaseAmount`), jamais les cotisations ni les
 * montants de réception « net » (ceux-ci empruntent le chemin `accountId`/
 * `resolveTontineAccount`, totalement distinct et inchangé — voir
 * `tontine-finance-integration.test.ts`).
 *
 * T-001 (« Achat tontine » = AC-015) et T-002 (« Achat tontine » = AC-016)
 * ont chacun leur propre caisse « Achat tontine » seedée (mocks/finance/accounts.ts)
 * — utilisés ici pour couvrir l'isolation multi-tenant (TEST 6).
 */
async function makeAdhesionAndOccurrence(tenantId: string, tontineId: string, memberId: string, memberName: string) {
  const period = (await tontineTurnsService.createPeriod(tenantId, { tontineId, startDate: '2026-01-01', endDate: '2026-12-31' }))!;
  const adhesion = (await tontineTurnsService.createAdhesion(tenantId, { periodId: period.id, memberId, memberName, joinedAt: '2026-01-01' }))!;
  const occurrence = (await tontineTurnsService.createOccurrence(tenantId, { periodId: period.id, occurrenceNumber: 1, plannedDate: '2026-02-01' }))!;
  return { period, adhesion, occurrence };
}

describe('« Avec achat » — TEST 1 : activer le switch ne crée qu’une association, jamais de transaction', () => {
  it('purchaseMode WITH_PURCHASE résout automatiquement purchaseAccountId (caisse « Achat tontine » du tenant), sans poster de Transaction', async () => {
    const transactionsBefore = transactions.length;
    const tontine = (await tontinesService.createTontine({
      tenantId: 'T-001', name: `Avec achat ${Date.now()}`, valueType: 'MONEY', currency: 'XOF',
      purchaseMode: 'WITH_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 50_000,
    }))!;

    expect(tontine.purchaseMode).toBe('WITH_PURCHASE');
    expect(tontine.purchaseAccountId).toBe('AC-015'); // « Achat tontine » de T-001
    expect(transactions.length).toBe(transactionsBefore); // aucune transaction créée à la création
  });
});

describe('« Avec achat » — TEST 5 : switch OFF, aucune association', () => {
  it('purchaseMode WITHOUT_PURCHASE (ou omis) ne renseigne jamais purchaseAccountId', async () => {
    const tontine = (await tontinesService.createTontine({
      tenantId: 'T-001', name: `Sans achat ${Date.now()}`, valueType: 'MONEY', currency: 'XOF',
      purchaseMode: 'WITHOUT_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 50_000,
    }))!;
    expect(tontine.purchaseAccountId).toBeUndefined();
  });
});

describe('« Avec achat » — TEST 2 : une cotisation ne doit JAMAIS atterrir dans la caisse « Achat tontine »', () => {
  it('recordContributionPayment sur une tontine « Avec achat » (sans accountId général) ne poste rien dans AC-015', async () => {
    const tontine = (await tontinesService.createTontine({
      tenantId: 'T-001', name: `Cotisation vs achat ${Date.now()}`, valueType: 'MONEY', currency: 'XOF',
      purchaseMode: 'WITH_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 50_000,
    }))!;
    expect(tontine.purchaseAccountId).toBe('AC-015');
    const { adhesion, occurrence } = await makeAdhesionAndOccurrence('T-001', tontine.id, 'M-PURCHASE-1', 'Membre Achat 1');
    const contribution = (await tontineTurnsService.createContribution('T-001', { adhesionId: adhesion.id, tontineOccurrenceId: occurrence.id, valueType: 'MONEY', expectedAmount: 50_000 }))!;

    const purchaseAccountBefore = (await financeService.getAccount('T-001', 'AC-015'))!;
    const transactionsBefore = transactions.length;

    await tontineTurnsService.recordContributionPayment('T-001', contribution.id, { amount: 50_000 });

    // Aucune transaction n'est postée du tout : cette tontine n'a pas de `accountId` général
    // (seulement `purchaseAccountId`), donc `resolveTontineAccount` (chemin cotisation) ne
    // trouve rien — exactement le comportement attendu, la cotisation ne « retombe » jamais
    // sur la caisse achat par défaut.
    expect(transactions.length).toBe(transactionsBefore);
    const purchaseAccountAfter = (await financeService.getAccount('T-001', 'AC-015'))!;
    expect(purchaseAccountAfter.balance).toBe(purchaseAccountBefore.balance);
  });
});

describe('« Avec achat » — TEST 3 & 4 : un achat réel poste UNIQUEMENT le montant d’achat, distinct de la réception nette', () => {
  it('recordReception avec purchaseAmount crédite la caisse « Achat tontine », le montant net suit un chemin séparé (aucune caisse générale ici → aucune transaction pour le net)', async () => {
    const tontine = (await tontinesService.createTontine({
      tenantId: 'T-001', name: `Achat réel ${Date.now()}`, valueType: 'MONEY', currency: 'XOF',
      purchaseMode: 'WITH_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 50_000,
    }))!;
    const { adhesion, occurrence } = await makeAdhesionAndOccurrence('T-001', tontine.id, 'M-PURCHASE-2', 'Membre Achat 2');
    const { created } = (await tontineTurnsService.addBeneficiaries('T-001', occurrence.id, { adhesionIds: [adhesion.id], valueType: 'MONEY', expectedAmount: 150_000 }))!;
    const beneficiary = created[0];

    const purchaseAccountBefore = (await financeService.getAccount('T-001', 'AC-015'))!;
    const transactionsBefore = transactions.length;

    // Réception nette (50 000, chemin `accountId` — absent ici) + achat réel (10 000, chemin `purchaseAccountId`).
    await tontineTurnsService.recordReception('T-001', beneficiary.id, { amount: 50_000, purchaseAmount: 10_000 });

    // Une seule transaction créée : celle de l'achat (10 000 → AC-015). La réception nette
    // ne poste rien car cette tontine n'a pas de `accountId` général (démontre la séparation
    // des deux chemins : le "net" n'emprunte jamais le chemin achat, même en son absence).
    expect(transactions.length).toBe(transactionsBefore + 1);
    const created_ = transactions[transactions.length - 1];
    expect(created_.amount).toBe(10_000); // jamais 50 000 (le net) ni 60 000 (la somme des deux)
    expect(created_.type).toBe('credit');
    expect(created_.toAccount).toBe('CS-001-CX-008'); // AC-015

    const purchaseAccountAfter = (await financeService.getAccount('T-001', 'AC-015'))!;
    expect(purchaseAccountAfter.balance).toBe(purchaseAccountBefore.balance + 10_000);
  });

  it('sans purchaseAmount (réception normale, tontine « Sans achat »), aucune transaction n’est postée dans la caisse « Achat tontine »', async () => {
    const tontine = (await tontinesService.createTontine({
      tenantId: 'T-001', name: `Sans achat réception ${Date.now()}`, valueType: 'MONEY', currency: 'XOF',
      purchaseMode: 'WITHOUT_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 50_000,
    }))!;
    const { adhesion, occurrence } = await makeAdhesionAndOccurrence('T-001', tontine.id, 'M-PURCHASE-3', 'Membre Achat 3');
    const { created } = (await tontineTurnsService.addBeneficiaries('T-001', occurrence.id, { adhesionIds: [adhesion.id], valueType: 'MONEY', expectedAmount: 80_000 }))!;
    const beneficiary = created[0];

    const purchaseAccountBefore = (await financeService.getAccount('T-001', 'AC-015'))!;
    await tontineTurnsService.recordReception('T-001', beneficiary.id, { amount: 80_000 });
    const purchaseAccountAfter = (await financeService.getAccount('T-001', 'AC-015'))!;

    expect(purchaseAccountAfter.balance).toBe(purchaseAccountBefore.balance);
  });
});

describe('« Avec achat » — TEST 6 : isolation multi-tenant', () => {
  it('un achat pour une tontine de T-002 ne crédite que la caisse « Achat tontine » de T-002 (AC-016), jamais celle de T-001 (AC-015)', async () => {
    const tontine = (await tontinesService.createTontine({
      tenantId: 'T-002', name: `Achat T-002 ${Date.now()}`, valueType: 'MONEY', currency: 'XOF',
      purchaseMode: 'WITH_PURCHASE', frequency: 'MONTHLY', monthlyDayOfMonth: 1, contributionAmount: 20_000,
    }))!;
    expect(tontine.purchaseAccountId).toBe('AC-016');
    const { adhesion, occurrence } = await makeAdhesionAndOccurrence('T-002', tontine.id, 'M-PURCHASE-4', 'Membre Achat 4');
    const { created } = (await tontineTurnsService.addBeneficiaries('T-002', occurrence.id, { adhesionIds: [adhesion.id], valueType: 'MONEY', expectedAmount: 100_000 }))!;
    const beneficiary = created[0];

    const t001Before = (await financeService.getAccount('T-001', 'AC-015'))!;
    const t002Before = (await financeService.getAccount('T-002', 'AC-016'))!;

    await tontineTurnsService.recordReception('T-002', beneficiary.id, { amount: 100_000, purchaseAmount: 7_000 });

    const t001After = (await financeService.getAccount('T-001', 'AC-015'))!;
    const t002After = (await financeService.getAccount('T-002', 'AC-016'))!;
    expect(t002After.balance).toBe(t002Before.balance + 7_000);
    expect(t001After.balance).toBe(t001Before.balance); // aucune fuite vers la caisse de l'autre tenant
  });
});
