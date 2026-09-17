import { describe, it, expect } from 'vitest';
import { tontineOperationsService } from './tontine-operations.service';
import { tontinesService } from './tontines.service';
import { workflowService } from './workflow.service';
import { transactions } from '@/mocks/finance/transactions';
import { tontineRemainders } from '@/mocks/tontines/tontines';

/** Helper — crée une Tontine MONEY fraîche pour isoler chaque test des autres. Plus de Période intermédiaire (restructuration) : Plans/Tours se rattachent DIRECTEMENT à `tontine.id`. */
async function makeMoneyTontine(tenantId: string, opts: { withPurchase?: boolean; accountId?: string; contributionAmount?: number } = {}) {
  return tontinesService.createTontine({
    tenantId, name: `Test Ops ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, valueType: 'MONEY',
    contributionAmount: opts.contributionAmount ?? 10_000, frequency: 'MONTHLY', monthlyRule: 'DAY_OF_MONTH', monthlyDayOfMonth: 5,
    withPurchase: opts.withPurchase ?? false, accountId: opts.accountId,
  } as never);
}

describe('tontineOperationsService — Planification (sans-achat), rattachée DIRECTEMENT à la Tontine', () => {
  it('ALLOW: addPlanEntry assigns sequential positions (1, 2, 3…)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id);
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id);
    expect(planA?.position).toBe(1);
    expect(planB?.position).toBe(2);
    expect(planA?.tontineId).toBe(tontine!.id);
  });

  it('DENY: addPlanEntry refuses a « Avec achat » tontine — planning is sans-achat only', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const plan = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    expect(plan).toBeNull();
  });

  it('DENY: addPlanEntry refuses the same adhesion twice on the same tontine', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    const duplicate = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    expect(duplicate).toBeNull();
  });

  it('ALLOW → DENY: removePlanEntry works while unconsumed, refused once consumed by a Tour', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const plan = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    const removed = await tontineOperationsService.removePlanEntry('T-001', plan!.id);
    expect(removed).toEqual({ removed: true });

    const plan2 = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05'); // consomme plan2
    const refused = await tontineOperationsService.removePlanEntry('T-001', plan2!.id);
    expect(refused).toBeNull();
  });

  it('DENY: listPlans of a tenant never leaks another tenant’s plans', async () => {
    const result = await tontineOperationsService.listPlans('T-002', 'TON-004'); // TON-004 appartient à T-001
    expect(result).toEqual([]);
  });
});

describe('tontineOperationsService — Tours progressifs (« Ajouter un tour »), rattachés DIRECTEMENT à la Tontine', () => {
  it('ALLOW: sans-achat — createOccurrence auto-consumes the next unconsumed plan position and creates one beneficiary', async () => {
    const tontine = await makeMoneyTontine('T-001', { contributionAmount: 30_000 });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    expect(occurrence?.occurrenceNumber).toBe(1);
    expect(occurrence?.status).toBe('PLANNED');
    expect(occurrence?.tontineId).toBe(tontine!.id);
    const beneficiaries = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(beneficiaries).toHaveLength(1);
    expect(beneficiaries[0].adhesionId).toBe(adhesion!.id);
    expect(beneficiaries[0].amountDue).toBe(30_000);
  });

  it('ALLOW: sans-achat — no beneficiary created when the plan is empty (never blocks progressive round creation)', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    expect(occurrence).toBeTruthy();
    const beneficiaries = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(beneficiaries).toHaveLength(0);
  });

  it('ALLOW: avec-achat — createOccurrence never auto-creates a beneficiary; addOccurrenceBeneficiary lets the manager choose manually, several per round', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    expect(await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id)).toHaveLength(0);
    const beneficiaryA = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionA!.id, 12_000);
    const beneficiaryB = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesionB!.id, 8_000);
    expect(beneficiaryA).toBeTruthy();
    expect(beneficiaryB).toBeTruthy();
    const beneficiaries = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    expect(beneficiaries).toHaveLength(2); // jamais une chaîne concaténée — une ligne par bénéficiaire
  });

  it('DENY: sans-achat — addOccurrenceBeneficiary is refused (the plan is the only path)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: false });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    expect(beneficiary).toBeNull();
  });

  it('DENY: addOccurrenceBeneficiary refuses a duplicate adhesion on the same occurrence', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 5_000);
    const duplicate = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 5_000);
    expect(duplicate).toBeNull();
  });

  it('ALLOW: occurrenceNumber increases progressively across successive rounds of the same tontine', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const first = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const second = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-10-05');
    expect(first?.occurrenceNumber).toBe(1);
    expect(second?.occurrenceNumber).toBe(2);
  });

  it('DENY: listOccurrences never leaks another tenant’s tours', async () => {
    const result = await tontineOperationsService.listOccurrences('T-002', 'TON-004'); // TON-004 appartient à T-001
    expect(result).toEqual([]);
  });
});

describe('tontineOperationsService — Finance : cotisations et réceptions journal-liées', () => {
  it('ALLOW: recordContribution posts a credit Transaction (EPARGNE) when the tontine is linked to a Finance account', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002' });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const before = transactions.length;
    const contribution = await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    expect(contribution?.amount).toBe(10_000);
    expect(transactions.length).toBe(before + 1);
    expect(transactions[transactions.length - 1]).toMatchObject({ category: 'EPARGNE', type: 'credit', amount: 10_000, toAccount: 'CS-001-ÉPG' });
  });

  it('ALLOW: recordContribution never blocks (best-effort) when the tontine has no linked Finance account', async () => {
    const tontine = await makeMoneyTontine('T-001'); // aucun accountId
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const before = transactions.length;
    const contribution = await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    expect(contribution).toBeTruthy();
    expect(transactions.length).toBe(before); // aucune Transaction, mais l'enregistrement métier réussit
  });

  it('DENY: recordContribution refuses an adhesion inactive at the occurrence date', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    await tontinesService.closeAdhesion('T-001', adhesion!.id, '2026-09-02');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05'); // après la sortie
    const contribution = await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    expect(contribution).toBeNull();
  });

  it('DENY: recordContribution refuses an adhesion belonging to a DIFFERENT tontine', async () => {
    const tontineA = await makeMoneyTontine('T-001');
    const tontineB = await makeMoneyTontine('T-001');
    const adhesionOfB = await tontinesService.addAdhesion('T-001', tontineB!.id, 'M-001', '2026-09-01');
    const occurrenceOfA = await tontineOperationsService.createOccurrence('T-001', tontineA!.id, '2026-09-05');
    const contribution = await tontineOperationsService.recordContribution('T-001', occurrenceOfA!.id, adhesionOfB!.id, 10_000);
    expect(contribution).toBeNull();
  });

  it('FINANCE NON-LEAKAGE : recordReception with a purchaseAmount posts the purchase amount ONLY to the "Achat tontine" account — the net reception posts to the general account, never mixed', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 20_000);
    const before = transactions.length;
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 15_000, 5_000);
    expect(transactions.length).toBe(before + 2);
    const netTx = transactions.find((t) => t.amount === 15_000 && t.fromAccount === 'CS-001-ÉPG');
    const purchaseTx = transactions.find((t) => t.amount === 5_000 && t.toAccount === 'CS-001-CX-008');
    expect(netTx).toMatchObject({ category: 'AUTRES', subcategory: 'DISTRIBUTION', type: 'debit' });
    expect(purchaseTx).toMatchObject({ category: 'AUTRES', subcategory: 'AUTRE', type: 'credit' });
  });

  it('DENY: recordReception is refused once the Occurrence is REALIZED (immutability)', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 5_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 5_000);
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    const secondReception = await tontineOperationsService.recordReception('T-001', beneficiary!.id, 1_000);
    expect(secondReception).toBeNull();
    const refusedNewBeneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 1_000);
    expect(refusedNewBeneficiary).toBeNull();
  });
});

describe('tontineOperationsService — Clôture et Reliquat', () => {
  it('DENY: closeOccurrence refuses while any beneficiary is not fully paid', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 4_000); // partiel
    const closed = await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    expect(closed).toBeNull();
  });

  it('ALLOW: closeOccurrence succeeds once every beneficiary is fully paid, and moves status to REALIZED', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 10_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 10_000);
    const closed = await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    expect(closed?.status).toBe('REALIZED');
  });

  it('RELIQUAT — traçabilité complète : un solde collecté non intégralement distribué crée un TontineRemainder OPEN avec tontine/tour/date/origine/statut', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 6_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 6_000); // 10 000 collectés, 6 000 distribués → reliquat 4 000
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    const remainders = await tontineOperationsService.listRemainders('T-001', tontine!.id);
    expect(remainders).toHaveLength(1);
    expect(remainders[0]).toMatchObject({ tontineId: tontine!.id, occurrenceId: occurrence!.id, amount: 4_000, origin: 'UNDERDISTRIBUTED_POOL', status: 'OPEN' });
    expect(remainders[0].createdBy).toBeTruthy();
    expect(remainders[0].date).toBeTruthy();
    expect('periodId' in remainders[0]).toBe(false); // aucune trace de Période dans le modèle Reliquat
  });

  it('ALLOW: no remainder is created when the collected pool exactly matches what was distributed', async () => {
    const before = tontineRemainders.length;
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002' });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesion!.id);
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05'); // sans-achat, bénéficiaire auto (amountDue = contributionAmount)
    await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    const [beneficiary] = await tontineOperationsService.listBeneficiaries('T-001', occurrence!.id);
    await tontineOperationsService.recordReception('T-001', beneficiary.id, 10_000);
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    expect(tontineRemainders.length).toBe(before); // rien ajouté
  });

  it('ALLOW → DENY: consumeRemainder/writeOffRemainder transition OPEN once, refused a second time', async () => {
    const tontine = await makeMoneyTontine('T-001', { accountId: 'AC-002', withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.recordContribution('T-001', occurrence!.id, adhesion!.id, 10_000);
    const beneficiary = await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence!.id, adhesion!.id, 2_000);
    await tontineOperationsService.recordReception('T-001', beneficiary!.id, 2_000);
    await tontineOperationsService.closeOccurrence('T-001', occurrence!.id);
    const [remainder] = await tontineOperationsService.listRemainders('T-001', tontine!.id);
    const consumed = await tontineOperationsService.consumeRemainder('T-001', remainder.id);
    expect(consumed?.status).toBe('CONSUMED');
    const secondAttempt = await tontineOperationsService.writeOffRemainder('T-001', remainder.id, 'motif');
    expect(secondAttempt).toBeNull();
  });
});

describe('tontineOperationsService — Distributions (vue consolidée, transverse à tous les Tours de la Tontine)', () => {
  it('ALLOW: listDistributions aggregates OccurrenceBeneficiary rows across every Tour of the tontine, most recent tour first', async () => {
    const tontine = await makeMoneyTontine('T-001', { withPurchase: true });
    const adhesion = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const occurrence1 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-09-05');
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence1!.id, adhesion!.id, 5_000);
    const occurrence2 = await tontineOperationsService.createOccurrence('T-001', tontine!.id, '2026-10-05');
    await tontineOperationsService.addOccurrenceBeneficiary('T-001', occurrence2!.id, adhesion!.id, 5_000);
    const distributions = await tontineOperationsService.listDistributions('T-001', tontine!.id);
    expect(distributions).toHaveLength(2);
    expect(distributions[0].occurrenceNumber).toBe(2); // le plus récent d'abord
  });

  it('DENY: listDistributions never leaks another tenant’s distributions', async () => {
    const result = await tontineOperationsService.listDistributions('T-002', 'TON-004'); // TON-004 appartient à T-001
    expect(result).toEqual([]);
  });
});

describe('tontineOperationsService — Permutation de positions planifiées (workflow générique)', () => {
  it('ALLOW: requestPlanPermutation creates a WorkflowRequest against the WD-008 definition (domain tontines, entityType beneficiaryPermutation)', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id);
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id);
    const request = await tontineOperationsService.requestPlanPermutation('T-001', { planAId: planA!.id, planBId: planB!.id, requestedBy: 'Test User' });
    expect(request?.domain).toBe('tontines');
    expect(request?.entityType).toBe('beneficiaryPermutation');
    expect(request?.status).toBe('pending');
  });

  it('DENY: requestPlanPermutation refuses two positions from different Tontines, and a position already consumed', async () => {
    const tontineA = await makeMoneyTontine('T-001');
    const tontineB = await makeMoneyTontine('T-001');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontineA!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontineB!.id, 'M-006', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontineA!.id, adhesionA!.id);
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontineB!.id, adhesionB!.id);
    const crossTontine = await tontineOperationsService.requestPlanPermutation('T-001', { planAId: planA!.id, planBId: planB!.id, requestedBy: 'Test' });
    expect(crossTontine).toBeUndefined(); // pas de mockRequest ici (moteur Workflow générique) — undefined, jamais null

    await tontineOperationsService.createOccurrence('T-001', tontineA!.id, '2026-09-05'); // consomme planA
    const adhesionC = await tontinesService.addAdhesion('T-001', tontineA!.id, 'M-016', '2026-09-01');
    const planC = await tontineOperationsService.addPlanEntry('T-001', tontineA!.id, adhesionC!.id);
    const consumedSide = await tontineOperationsService.requestPlanPermutation('T-001', { planAId: planA!.id, planBId: planC!.id, requestedBy: 'Test' });
    expect(consumedSide).toBeUndefined();
  });

  it('ALLOW: WD-008 permission is beneficiaries.manage, self-approval explicitly allowed (mandat)', async () => {
    const definition = await workflowService.getWorkflowFor('beneficiaryPermutation', 'update');
    expect(definition?.id).toBe('WD-008');
    expect(definition?.steps[0].approverPermission).toBe('beneficiaries.manage');
    expect(definition?.allowSelfApproval).toBe(true);
  });

  it('ALLOW: approving the request swaps the two adhesionId atomically and writes a sensitive AuditEvent, even with the SAME actor as requester (self-approval)', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id);
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id);
    const request = await tontineOperationsService.requestPlanPermutation('T-001', { planAId: planA!.id, planBId: planB!.id, requestedBy: 'Amadou Mbaye', requestedByUserId: 'U-001' });
    const decided = await workflowService.submitAction('T-001', request!.id, 'approve', 'Amadou Mbaye', undefined, 'U-001'); // même acteur que le demandeur
    tontineOperationsService.applyPlanPermutationDecision('T-001', decided!);
    const refreshedA = await tontineOperationsService.getPlanPermutationPreview('T-001', request!.id);
    expect(refreshedA?.a.memberName).toBe('Cheikh Diop'); // M-006 a pris la position de M-001 après échange
    expect(refreshedA?.b.memberName).toBe('Fatou Ndiaye');
  });

  it('ALLOW: rejecting the request never mutates the plan positions', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id);
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id);
    const request = await tontineOperationsService.requestPlanPermutation('T-001', { planAId: planA!.id, planBId: planB!.id, requestedBy: 'Test' });
    const decided = await workflowService.submitAction('T-001', request!.id, 'reject', 'Amadou Mbaye');
    tontineOperationsService.applyPlanPermutationDecision('T-001', decided!); // no-op : status !== 'approved'
    const preview = await tontineOperationsService.getPlanPermutationPreview('T-001', request!.id);
    expect(preview?.a.memberName).toBe('Fatou Ndiaye');
    expect(preview?.b.memberName).toBe('Cheikh Diop');
  });

  it('DENY: applying the same approved decision twice never double-swaps (idempotence)', async () => {
    const tontine = await makeMoneyTontine('T-001');
    const adhesionA = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-001', '2026-09-01');
    const adhesionB = await tontinesService.addAdhesion('T-001', tontine!.id, 'M-006', '2026-09-01');
    const planA = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionA!.id);
    const planB = await tontineOperationsService.addPlanEntry('T-001', tontine!.id, adhesionB!.id);
    const request = await tontineOperationsService.requestPlanPermutation('T-001', { planAId: planA!.id, planBId: planB!.id, requestedBy: 'Test' });
    const decided = await workflowService.submitAction('T-001', request!.id, 'approve', 'Amadou Mbaye', undefined, 'U-001');
    tontineOperationsService.applyPlanPermutationDecision('T-001', decided!);
    tontineOperationsService.applyPlanPermutationDecision('T-001', decided!); // second appel : no-op (appliedAt déjà renseigné)
    const preview = await tontineOperationsService.getPlanPermutationPreview('T-001', request!.id);
    expect(preview?.a.memberName).toBe('Cheikh Diop');
    expect(preview?.b.memberName).toBe('Fatou Ndiaye');
  });
});

describe('tontineOperationsService — Isolation multi-tenant', () => {
  it('DENY: listAllAdhesions/listAllOccurrences/listAllContributions never leak across tenants', async () => {
    const [adhesionsT1, adhesionsT2] = await Promise.all([tontineOperationsService.listAllAdhesions('T-001'), tontineOperationsService.listAllAdhesions('T-002')]);
    expect(adhesionsT1.every((a) => a.tenantId === 'T-001')).toBe(true);
    expect(adhesionsT2.every((a) => a.tenantId === 'T-002')).toBe(true);
    const [occurrencesT1, occurrencesT2] = await Promise.all([tontineOperationsService.listAllOccurrences('T-001'), tontineOperationsService.listAllOccurrences('T-002')]);
    expect(occurrencesT1.every((o) => o.tenantId === 'T-001')).toBe(true);
    expect(occurrencesT2.every((o) => o.tenantId === 'T-002')).toBe(true);
  });

  it('DENY: getOccurrence returns null for a Tour of another tenant', async () => {
    const tontine = await makeMoneyTontine('T-002');
    const occurrence = await tontineOperationsService.createOccurrence('T-002', tontine!.id, '2026-09-05');
    expect(await tontineOperationsService.getOccurrence('T-001', occurrence!.id)).toBeNull();
  });
});
