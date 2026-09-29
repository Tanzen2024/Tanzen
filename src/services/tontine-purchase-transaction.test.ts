import { describe, it, expect } from 'vitest';
import { tontineOperationsService } from './tontine-operations.service';
import { tontinesService } from './tontines.service';
import { financePositionService } from './finance-position.service';
import { transactions } from '@/mocks/finance/transactions';
import { financeService } from './finance.service';
import { cashboxes } from '@/mocks/finance/cashboxes';
import { cashboxMemberships } from '@/mocks/finance/cashbox-memberships';

/**
 * Mandat « Achat de tontine → crédit automatique dans la caisse Achat tontine » (2026-09-27) :
 * un achat enregistré (`recordReception` avec montant d'achat) produit UNE transaction
 * « Autres / Achat tontine », crédit, montant exact, dans la caisse SYSTÈME TONTINE_PURCHASE —
 * idempotente (`Transaction.tontineBeneficiaryId`), alignée sur le montant d'achat.
 */
async function makePurchaseTontine(tenantId = 'T-001') {
  return tontinesService.createTontine({
    tenantId, name: `Achat ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
    contributionAmount: 10_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5,
    withPurchase: true,
  } as never);
}

async function makeBeneficiary(tontineId: string, occurrenceId: string, memberId: string, tenantId = 'T-001') {
  const adhesion = await tontinesService.addAdhesion(tenantId, tontineId, memberId, '2026-09-01');
  return tontineOperationsService.addOccurrenceBeneficiary(tenantId, occurrenceId, adhesion!.id, 20_000);
}

async function setup(memberId = 'M-001') {
  const tontine = await makePurchaseTontine();
  const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
  const beneficiary = await makeBeneficiary(tontine!.id, occurrence!.id, memberId);
  return { tontine: tontine!, occurrence: occurrence!, beneficiary: beneficiary! };
}

const purchaseCashbox = (tenantId = 'T-001') => cashboxes.find((cashbox) => cashbox.tenantId === tenantId && cashbox.systemCode === 'TONTINE_PURCHASE')!;
const linkedTransactions = (beneficiaryId: string) => transactions.filter((tx) => tx.tontineBeneficiaryId === beneficiaryId);
const activeLinked = (beneficiaryId: string) => linkedTransactions(beneficiaryId).filter((tx) => tx.status !== 'cancelled');

describe('Achat de tontine → crédit automatique dans la caisse « Achat tontine »', () => {
  it('TEST 1 — achat de 50 000 : UNE transaction, caisse système « Achat tontine », Autres / Achat tontine, Crédit 50 000', async () => {
    const { tontine, occurrence, beneficiary } = await setup();
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 50_000);
    const linked = linkedTransactions(beneficiary.id);
    expect(linked).toHaveLength(1);
    const cashbox = purchaseCashbox();
    expect(cashbox.title).toBe('Achat tontine');
    expect(linked[0]).toMatchObject({
      destination: cashbox.cashboxNumber, type: 'credit', amount: 50_000, status: 'completed',
      category: 'AUTRES', subcategory: 'ACHAT_TONTINE', memberId: 'M-001',
      description: `Achat tontine ${tontine.name} — tour ${occurrence.occurrenceNumber}`,
    });
  });

  it('TEST 2 — achat de 100 000 : Crédit 100 000', async () => {
    const { beneficiary } = await setup();
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 100_000);
    expect(activeLinked(beneficiary.id).map((tx) => [tx.type, tx.amount])).toEqual([['credit', 100_000]]);
  });

  it('TEST 3 — plusieurs achats pour plusieurs adhérents : chaque achat a sa propre transaction', async () => {
    const { tontine, occurrence, beneficiary: first } = await setup('M-001');
    const second = (await makeBeneficiary(tontine.id, occurrence.id, 'M-006'))!;
    const third = (await makeBeneficiary(tontine.id, occurrence.id, 'M-016'))!;
    await tontineOperationsService.recordReception('T-001', first.id, 20_000, 50_000);
    await tontineOperationsService.recordReception('T-001', second.id, 20_000, 30_000);
    await tontineOperationsService.recordReception('T-001', third.id, 20_000, 0); // sans achat → aucune transaction d'achat
    expect(activeLinked(first.id).map((tx) => [tx.memberId, tx.amount])).toEqual([['M-001', 50_000]]);
    expect(activeLinked(second.id).map((tx) => [tx.memberId, tx.amount])).toEqual([['M-006', 30_000]]);
    expect(linkedTransactions(third.id)).toHaveLength(0);
  });

  it('TEST 4 — pas de doublon : rejouer la validation du même achat ne crée jamais une seconde transaction', async () => {
    const { beneficiary } = await setup();
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 50_000);
    const before = transactions.length;
    const once = await tontineOperationsService.syncPurchaseTransaction('T-001', beneficiary.id);
    const twice = await tontineOperationsService.syncPurchaseTransaction('T-001', beneficiary.id);
    expect(transactions.length).toBe(before);
    expect(once?.id).toBe(twice?.id);
    expect(linkedTransactions(beneficiary.id).map((tx) => tx.amount)).toEqual([50_000]);
    // Une réception sans montant d'achat ne touche pas non plus à la transaction d'achat.
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 1_000);
    expect(linkedTransactions(beneficiary.id).map((tx) => tx.amount)).toEqual([50_000]);
  });

  it('TEST 5 — modification : l’achat passe de 50 000 à 75 000 → la MÊME transaction affiche 75 000, aucun doublon', async () => {
    const { beneficiary } = await setup();
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 10_000, 50_000);
    const [initial] = linkedTransactions(beneficiary.id);
    const updated = await tontineOperationsService.recordReception('T-001', beneficiary.id, 10_000, 25_000); // workflow existant : cumul additif
    expect(updated?.amountPurchased).toBe(75_000);
    const linked = linkedTransactions(beneficiary.id);
    expect(linked).toHaveLength(1);
    expect(linked[0].id).toBe(initial.id);
    expect(linked[0].amount).toBe(75_000);
  });

  it('TEST 6 — annulation : un achat réglé ne peut pas être retiré (workflow existant) et sa transaction reste active ; un achat ramené à 0 voit sa transaction annulée, jamais supprimée', async () => {
    const { beneficiary } = await setup();
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 50_000);
    expect(await tontineOperationsService.removeOccurrenceBeneficiary('T-001', beneficiary.id)).toBeNull();
    expect(activeLinked(beneficiary.id).map((tx) => tx.amount)).toEqual([50_000]);

    const record = (await tontineOperationsService.listBeneficiaries('T-001', beneficiary.occurrenceId)).find((item) => item.id === beneficiary.id)!;
    record.amountPurchased = 0; // achat n'existant plus : la transaction ne doit plus rester active
    await tontineOperationsService.syncPurchaseTransaction('T-001', beneficiary.id);
    const linked = linkedTransactions(beneficiary.id);
    expect(linked).toHaveLength(1); // traçabilité : jamais de suppression physique
    expect(linked[0].status).toBe('cancelled');
  });

  it('refus atomique : si la transaction d’achat ne peut pas être écrite, la réception n’est pas enregistrée', async () => {
    const { beneficiary } = await setup();
    const cashbox = purchaseCashbox();
    const status = cashbox.status;
    cashbox.status = 'inactive'; // caisse non opérationnelle → `insertTransaction` refuse
    try {
      expect(await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 50_000)).toBeNull();
    } finally {
      cashbox.status = status;
    }
    const record = (await tontineOperationsService.listBeneficiaries('T-001', beneficiary.occurrenceId)).find((item) => item.id === beneficiary.id)!;
    expect([record.amountPaid, record.amountPurchased]).toEqual([0, 0]);
    expect(linkedTransactions(beneficiary.id)).toHaveLength(0);
  });

  it('TEST 7 — journal : la transaction figure au journal de la caisse « Achat tontine » en crédit du montant de l’achat', async () => {
    const { beneficiary } = await setup();
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 50_000);
    const journal = await financeService.listTransactions('T-001');
    const cashbox = purchaseCashbox();
    const row = journal.find((tx) => tx.tontineBeneficiaryId === beneficiary.id);
    expect(row).toMatchObject({ destination: cashbox.cashboxNumber, type: 'credit', amount: 50_000, status: 'completed' });
  });

});

/**
 * Mandat « Traçabilité des achats de tontine » (2026-09-27) : la transaction de la caisse « Achat
 * tontine » TRACE l'achat (origine relue par relation) ; elle n'est PAS, en soi, un mouvement du
 * bilan de l'adhérent — l'achat ne crée aucune adhésion à la caisse et le moteur de position
 * reste seul juge (aucune règle d'impact n'existe à ce jour).
 */
describe('Achat de tontine — traçabilité ≠ impact sur le bilan de l’adhérent', () => {
  const today = () => new Date().toISOString().slice(0, 10);
  const position = (memberId: string) => financePositionService.memberFinancialPosition('T-001', { kind: 'MEMBER_ALL_CASHBOXES', memberId }, today());

  it('TEST 2 — la transaction retrouve par relation la tontine, le tour (et son cycle), l’adhérent et le montant de l’achat', async () => {
    const { tontine, occurrence, beneficiary } = await setup('M-006');
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 50_000);
    const [tx] = activeLinked(beneficiary.id);
    const origin = await tontineOperationsService.getPurchaseOrigin('T-001', tx.tontineBeneficiaryId!);
    expect(origin).toMatchObject({
      tontineId: tontine.id, tontineName: tontine.name,
      occurrenceId: occurrence.id, occurrenceNumber: occurrence.occurrenceNumber, occurrenceDate: occurrence.date, cycleNumber: 1,
      memberId: 'M-006', purchaseAmount: 50_000,
    });
    expect(origin?.purchaseAmount).toBe(tx.amount);
    expect(await tontineOperationsService.getPurchaseOrigin('T-002', tx.tontineBeneficiaryId!)).toBeNull(); // isolation tenant
  });

  it('TEST 3 — l’achat ne rend pas l’adhérent membre de la caisse « Achat tontine »', async () => {
    const cashbox = purchaseCashbox();
    const memberships = () => cashboxMemberships.filter((m) => m.cashboxId === cashbox.id && m.memberId === 'M-016').length;
    const before = memberships();
    const { beneficiary } = await setup('M-016');
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 50_000);
    expect(activeLinked(beneficiary.id)).toHaveLength(1);
    expect(memberships()).toBe(before);
  });

  it('TEST 4 — une transaction sans adhérent reste valide (ex. Transport 12 000)', async () => {
    const cashbox = cashboxes.find((item) => item.tenantId === 'T-001' && !item.systemCode && item.status === 'active')!;
    const tx = await financeService.createTransaction('T-001', { cashboxNumber: cashbox.cashboxNumber, category: 'AUTRES', subcategory: 'AUTRE', type: 'debit', amount: 12_000, description: 'Transport' });
    expect(tx).toMatchObject({ amount: 12_000, status: 'completed' });
    expect(tx?.memberId).toBeUndefined();
  });

  it('TESTS 5, 6, 7 — l’achat ne modifie ni l’épargne, ni la dette, ni aucun agrégat de la position de l’adhérent (aucun double comptage)', async () => {
    const memberId = 'M-006';
    const before = await position(memberId);
    const { beneficiary } = await setup(memberId);
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 50_000);
    await tontineOperationsService.syncPurchaseTransaction('T-001', beneficiary.id);
    expect(activeLinked(beneficiary.id).map((tx) => tx.amount)).toEqual([50_000]); // tracé dans la caisse…
    const after = await position(memberId);
    expect(after.savings).toBe(before.savings); // TEST 5 — épargne inchangée
    expect(after.credit).toEqual(before.credit); // TEST 6 — dette / prêts / remboursements inchangés
    expect(after).toEqual(before); // TEST 7 — …et nulle part ailleurs dans le bilan
  });
});
