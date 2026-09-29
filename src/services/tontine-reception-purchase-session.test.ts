import { describe, it, expect } from 'vitest';
import { tontineOperationsService } from './tontine-operations.service';
import { tontinesService } from './tontines.service';
import { financeService } from './finance.service';
import { financePositionService } from './finance-position.service';
import { currentSessionFor } from './fiscal-session.service';
import { transactions } from '@/mocks/finance/transactions';
import { cashboxes } from '@/mocks/finance/cashboxes';

/**
 * Mandat « Transaction automatique lors de l'encaissement d'une tontine avec achat » (2026-09-28).
 * Cause racine : la transaction « Achat tontine » était bien écrite, mais SANS séance — or
 * Trésorerie → Transactions s'ouvre sur la séance courante et filtre par `sessionId` : elle n'était
 * visible que via « Toutes les séances ». Désormais toute écriture automatique de la tontine
 * (achat, distribution, cotisation) porte la séance courante de l'exercice (`currentSessionFor`).
 */
const today = () => new Date().toISOString().slice(0, 10);

async function setup(withPurchase: boolean, memberIds: string[], tenantId = 'T-001', cashboxId?: string) {
  const tontine = await tontinesService.createTontine({
    tenantId, cashboxId, name: `Encaissement ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
    contributionAmount: 10_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5, withPurchase,
  } as never);
  const occurrence = await tontineOperationsService.createOccurrence(tenantId, tontine!.id, '2026-09-05');
  const beneficiaries = [];
  for (const memberId of memberIds) {
    const adhesion = await tontinesService.addAdhesion(tenantId, tontine!.id, memberId, '2026-09-01');
    // Sans achat : le bénéficiaire suit le plan de passage (workflow existant).
    if (!withPurchase) await tontineOperationsService.addPlanEntry(tenantId, tontine!.id, adhesion!.id);
    beneficiaries.push((await tontineOperationsService.addOccurrenceBeneficiary(tenantId, occurrence!.id, adhesion!.id, 20_000))!);
  }
  return { tontine: tontine!, occurrence: occurrence!, beneficiaries };
}

const purchaseCashbox = (tenantId = 'T-001') => cashboxes.find((cashbox) => cashbox.tenantId === tenantId && cashbox.systemCode === 'TONTINE_PURCHASE')!;
const purchasesOf = (beneficiaryId: string) => transactions.filter((tx) => tx.tontineBeneficiaryId === beneficiaryId && tx.status !== 'cancelled');

describe('Encaissement d’une tontine avec achat → transaction « Achat tontine » visible dans la séance courante', () => {
  it('TEST 1 et 7 — avec achat : transaction créée dans la caisse système, exercice ET séance courante (visible par défaut)', async () => {
    const { tontine, occurrence, beneficiaries: [beneficiary] } = await setup(true, ['M-001'], 'T-001', 'AC-012');
    await tontineOperationsService.recordContribution('T-001', occurrence.id, (await tontinesService.listAdhesions('T-001', tontine.id))[0].id, 10_000);
    expect(await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 50_000)).toBeTruthy();
    const [tx] = purchasesOf(beneficiary.id);
    const session = currentSessionFor('T-001', today());
    expect(session).toBeDefined();
    expect(tx).toMatchObject({
      tenantId: 'T-001', destination: purchaseCashbox().cashboxNumber, category: 'AUTRES', subcategory: 'ACHAT_TONTINE', type: 'credit',
      amount: 50_000, status: 'completed', memberId: 'M-001', fiscalYearId: session!.fiscalYearId, sessionId: session!.id,
      description: `Achat tontine ${tontine.name} — tour ${occurrence.occurrenceNumber}`,
    });
    // Toutes les écritures automatiques de la tontine (cotisation, distribution, achat) : même séance courante.
    const generated = transactions.filter((item) => item.tenantId === 'T-001' && item.description.includes(tontine.name));
    expect(generated.map((item) => item.subcategory ?? item.category).sort()).toEqual(['ACHAT_TONTINE', 'DISTRIBUTION', 'EPARGNE']);
    expect(new Set(generated.map((item) => item.sessionId))).toEqual(new Set([session!.id]));
  });

  it('TEST 2 — sans achat : aucune transaction « Achat tontine », même si un montant d’achat est transmis', async () => {
    const { tontine, beneficiaries: [beneficiary] } = await setup(false, ['M-001']);
    expect(beneficiary).toBeDefined();
    const before = transactions.filter((tx) => tx.subcategory === 'ACHAT_TONTINE').length;
    expect(await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 50_000)).toBeTruthy();
    expect(beneficiary.amountPurchased).toBe(0);
    expect(purchasesOf(beneficiary.id)).toHaveLength(0);
    expect(transactions.filter((tx) => tx.subcategory === 'ACHAT_TONTINE').length).toBe(before);
    expect(transactions.some((tx) => tx.subcategory === 'ACHAT_TONTINE' && tx.description.includes(tontine.name))).toBe(false);
  });

  it('TEST 3 — deux encaissements distincts : deux transactions distinctes', async () => {
    const { beneficiaries: [first, second] } = await setup(true, ['M-001', 'M-006']);
    await tontineOperationsService.recordReception('T-001', first.id, 20_000, 30_000);
    await tontineOperationsService.recordReception('T-001', second.id, 20_000, 45_000);
    const [a] = purchasesOf(first.id);
    const [b] = purchasesOf(second.id);
    expect(a.id).not.toBe(b.id);
    expect([a.amount, b.amount]).toEqual([30_000, 45_000]);
  });

  it('TEST 4 — rejeu du même encaissement : une seule transaction', async () => {
    const { beneficiaries: [beneficiary] } = await setup(true, ['M-001']);
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 50_000);
    await tontineOperationsService.syncPurchaseTransaction('T-001', beneficiary.id);
    await tontineOperationsService.syncPurchaseTransaction('T-001', beneficiary.id);
    expect(purchasesOf(beneficiary.id)).toHaveLength(1);
  });

  it('TEST 5 — montant = montant d’achat saisi, exact (jamais le montant reçu ni la cotisation)', async () => {
    const { beneficiaries: [beneficiary] } = await setup(true, ['M-001']);
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 33_333);
    expect(purchasesOf(beneficiary.id).map((tx) => tx.amount)).toEqual([33_333]);
  });

  it('TEST 6 — tenant : la transaction est écrite dans le tenant de la tontine et sa caisse système ; sans séance dans l’exercice, aucune séance inventée', async () => {
    const { beneficiaries: [beneficiary] } = await setup(true, ['M-002'], 'T-002');
    expect(await tontineOperationsService.recordReception('T-002', beneficiary.id, 20_000, 40_000)).toBeTruthy();
    const [tx] = purchasesOf(beneficiary.id);
    expect(tx).toMatchObject({ tenantId: 'T-002', destination: purchaseCashbox('T-002').cashboxNumber, amount: 40_000 });
    expect(tx.sessionId).toBe(currentSessionFor('T-002', today())?.id);
  });

  it('TEST 8 — bilan : solde de la caisse + achat, un seul gain « Achat tontine » (jamais compté deux fois)', async () => {
    const cashbox = purchaseCashbox();
    const balance = async () => (await financeService.getCashbox('T-001', cashbox.id) as unknown as { balance: number }).balance;
    const before = await balance();
    const { tontine, beneficiaries: [beneficiary] } = await setup(true, ['M-006']);
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 20_000, 50_000);
    await tontineOperationsService.syncPurchaseTransaction('T-001', beneficiary.id);
    expect(await balance()).toBe(before + 50_000);
    const [tx] = purchasesOf(beneficiary.id);
    const { sheets: [sheet] } = await financePositionService.memberBalanceSheets('T-001', { memberIds: ['M-006'], asOfDate: today() });
    const gainsFromPurchase = sheet.gainLines.filter((line) => line.source.kind === 'TONTINE_PURCHASE' && line.source.transactionId === tx.id);
    expect(gainsFromPurchase).toHaveLength(1);
    expect(gainsFromPurchase[0]).toMatchObject({ generated: 50_000, rule: 'EQUAL', gain: 50_000 });
    expect(gainsFromPurchase[0].source).toMatchObject({ tontineId: tontine.id });
    const { sheets } = await financePositionService.memberBalanceSheets('T-001', { memberIds: 'ALL', asOfDate: today() });
    const distributed = sheets.flatMap((item) => item.gainLines).filter((line) => line.source.kind === 'TONTINE_PURCHASE' && line.source.transactionId === tx.id);
    expect(distributed.reduce((sum, line) => sum + line.gain, 0)).toBe(50_000);
  });
});
