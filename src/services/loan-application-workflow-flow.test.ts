import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { creditService } from './credit.service';
import { workflowService } from './workflow.service';
import { financeService, cashboxAvailableBalance } from './finance.service';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { guarantors } from '@/mocks/finance/guarantors';
import { cashboxes } from '@/mocks/finance/cashboxes';
import { loanRules, tenantCreditRule } from '@/mocks/finance/loan-rules';
import { auditEvents } from '@/mocks/audit/audit-events';
import { workflowRequests } from '@/mocks/operations/workflow-requests';
import { workflowDefinitions } from '@/mocks/operations/workflow-definitions';

/**
 * WORKFLOW D'APPROBATION DES PRÊTS — de la soumission à la transaction (mandat du 2026-09-28).
 * Demandeur : U-001 Amadou Mbaye (utilisateur connecté de la démo). Approbateurs : U-013 Jeanne Mbarga
 * et U-014 Paul Ekotto (administrateurs actifs de T-001 → `loans.approve.admin`).
 * Règle LR-001 : approbation requise, niveau Administrateur ; l'approbation et le décaissement sont
 * deux actions distinctes : la transaction n'existe qu'au décaissement.
 */
const stores = { transactions, loans, loanFundingAllocations, applications, guarantors, cashboxes, loanRules, auditEvents, workflowRequests, workflowDefinitions } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); };
beforeEach(restore);
afterEach(restore);

const REQUESTER = { id: 'U-001', name: 'Amadou Mbaye' };
const B = { id: 'U-013', name: 'Jeanne Mbarga' };
const C = { id: 'U-014', name: 'Paul Ekotto' };
const submit = (requestedAmount = 200_000, complementaryFunding?: { cashboxId: string; amount: number }[]) =>
  creditService.submitLoanApplication('T-001', { memberId: 'M-016', requestedAmount, purpose: 'Équipement', complementaryFunding }, REQUESTER.name, REQUESTER.id);
const decide = (requestId: string, action: 'approve' | 'reject', actor: { id: string; name: string }, comment?: string) => creditService.decideLoanApplication('T-001', requestId, action, actor.id, actor.name, comment);
const loanTransactions = (applicationId: string) => {
  const loan = loans.find((item) => item.applicationId === applicationId);
  return loan ? transactions.filter((tx) => tx.loanId === loan.id) : [];
};
/** Configure le workflow de demande de prêt avec deux approbations (Paramètres → Workflows de validation). */
function requireTwoApprovals() {
  const definition = workflowDefinitions.find((item) => item.id === 'WD-001')!;
  definition.steps = [{ order: 1, name: 'Première approbation', approverPermission: 'loans.approve.admin' }, { order: 2, name: 'Approbation finale', approverPermission: 'loans.approve.admin' }];
}

describe('1. Soumission', () => {
  it('la demande apparaît dans le workflow du tenant, EN ATTENTE ; aucune transaction ni prêt', async () => {
    const txBefore = transactions.length;
    const loansBefore = loans.length;
    const submitted = (await submit())!;
    expect(submitted.application).toMatchObject({ stage: 'stageSubmitted', memberId: 'M-016', requestedAmount: 200_000 });
    expect(submitted.request).toMatchObject({ domain: 'credit', entityType: 'application', entityId: submitted.application.id, status: 'pending', amount: 200_000, requestedByUserId: REQUESTER.id });
    expect((await workflowService.listRequests('T-001')).map((request) => request.id)).toContain(submitted.request.id);
    // À traiter par un approbateur habilité (pas par le demandeur lui-même).
    const { permissionsOfUser } = await import('./workflow.service');
    expect((await workflowService.listMyApprovals('T-001', permissionsOfUser('T-001', B.id), B.id)).map((request) => request.id)).toContain(submitted.request.id);
    expect((await workflowService.listMyApprovals('T-001', permissionsOfUser('T-001', REQUESTER.id), REQUESTER.id)).map((request) => request.id)).not.toContain(submitted.request.id);
    expect(transactions.length).toBe(txBefore);
    expect(loans.length).toBe(loansBefore);
  });

  it('une nouvelle version du workflow (WD-001 remplacé) est utilisée : la soumission n’échoue plus', async () => {
    const created = await workflowService.createNewVersionOfDefinition('T-001', 'WD-001', { code: 'CREDIT_APPLICATION_APPROVAL', name: 'Approbation de demande de crédit', domain: 'credit', description: 'v3', entityType: 'application', action: 'create', steps: [{ name: 'Approbation administrateur', approverPermission: 'loans.approve.admin' }], active: true });
    expect(created).toBeTruthy();
    expect(workflowDefinitions.find((item) => item.id === 'WD-001')!.active).toBe(false);
    const submitted = await submit();
    expect(submitted?.request.workflowDefinitionId).toBe(created!.id);
  });
});

describe('2 et 3. Approbations et transaction au décaissement', () => {
  it('deux approbations configurées : la 1re laisse la demande EN COURS, la définitive l’approuve ; aucune transaction avant le décaissement', async () => {
    requireTwoApprovals();
    const submitted = (await submit())!;
    expect(submitted.request.steps).toHaveLength(2);
    const txBefore = transactions.length;
    const first = await decide(submitted.request.id, 'approve', B);
    expect(first).toMatchObject({ ok: true, request: { status: 'inProgress', currentStepOrder: 2 }, application: { stage: 'stageReview' } });
    // Le même approbateur ne peut pas donner la 2e approbation.
    expect(await decide(submitted.request.id, 'approve', B)).toEqual({ ok: false, reason: 'sameApprover' });
    expect(await creditService.disburseLoan('T-001', submitted.application.id)).toBeUndefined();
    const final = await decide(submitted.request.id, 'approve', C);
    expect(final).toMatchObject({ ok: true, request: { status: 'approved' }, application: { stage: 'stageApproved' } });
    expect(transactions.length).toBe(txBefore); // approuvé ≠ décaissé
  });

  it('décaissement : prêt historisé et transaction visible dans les transactions de la trésorerie', async () => {
    const submitted = (await submit())!;
    await decide(submitted.request.id, 'approve', B, 'Dossier complet');
    const disbursed = (await creditService.disburseLoan('T-001', submitted.application.id))!;
    const rule = tenantCreditRule('T-001')!;
    expect(disbursed.loan).toMatchObject({ memberId: 'M-016', principal: 200_000, loanMode: rule.loanMode, interestRate: rule.interestRate, interestPeriod: rule.interestPeriod, applicationId: submitted.application.id });
    expect(disbursed.application.stage).toBe('stageDisbursed');
    const [tx] = loanTransactions(submitted.application.id);
    expect(tx).toMatchObject({ memberId: 'M-016', category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount: 200_000, status: 'completed', loanId: disbursed.loan.id });
    expect(tx.description).toContain(submitted.application.id);
    expect((await financeService.listTransactions('T-001')).map((item) => item.id)).toContain(tx.id);
  });
});

describe('4. Rejet', () => {
  it('rejet avec motif : REJETÉE, aucun prêt, aucune transaction, décaissement impossible', async () => {
    const submitted = (await submit())!;
    const txBefore = transactions.length;
    const rejected = await decide(submitted.request.id, 'reject', B, 'Capacité de remboursement insuffisante');
    expect(rejected).toMatchObject({ ok: true, request: { status: 'rejected' }, application: { stage: 'stageRejected' } });
    expect(rejected.ok && rejected.request.steps[0].comment).toBe('Capacité de remboursement insuffisante');
    expect(await creditService.disburseLoan('T-001', submitted.application.id)).toBeUndefined();
    expect(transactions.length).toBe(txBefore);
    expect(loans.some((loan) => loan.applicationId === submitted.application.id)).toBe(false);
  });
});

describe('5. Plusieurs caisses', () => {
  it('Épargne insuffisante + caisse complémentaire : une transaction par caisse, montants répartis, Σ = capital', async () => {
    const epargne = cashboxes.find((cashbox) => cashbox.id === 'AC-009')!;
    const transport = cashboxes.find((cashbox) => cashbox.id === 'AC-012')!;
    epargne.openingBalance = 0;
    epargne.openingBalance = 120_000 - (cashboxAvailableBalance('T-001', 'AC-009') ?? 0);
    transport.openingBalance = 0;
    transport.openingBalance = 500_000 - (cashboxAvailableBalance('T-001', 'AC-012') ?? 0);
    const submitted = (await submit(200_000, [{ cashboxId: 'AC-012', amount: 80_000 }]))!;
    await decide(submitted.request.id, 'approve', B);
    const disbursed = (await creditService.disburseLoan('T-001', submitted.application.id))!;
    const txs = loanTransactions(submitted.application.id);
    expect(txs.map((tx) => [tx.source, tx.amount])).toEqual([[epargne.cashboxNumber, 120_000], [transport.cashboxNumber, 80_000]]);
    expect(loanFundingAllocations.filter((item) => item.loanId === disbursed.loan.id).map((item) => [item.cashboxId, item.amount])).toEqual([['AC-009', 120_000], ['AC-012', 80_000]]);
  });
});

describe('6. Double clic / nouvelle tentative', () => {
  it('seconde approbation refusée ; second décaissement refusé : aucune transaction en double', async () => {
    const submitted = (await submit())!;
    await decide(submitted.request.id, 'approve', B);
    expect(await decide(submitted.request.id, 'approve', C)).toEqual({ ok: false, reason: 'notPending' });
    const [first, second] = await Promise.all([creditService.disburseLoan('T-001', submitted.application.id), creditService.disburseLoan('T-001', submitted.application.id)]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await creditService.disburseLoan('T-001', submitted.application.id)).toBeUndefined();
    expect(loanTransactions(submitted.application.id)).toHaveLength(1);
    expect(loans.filter((loan) => loan.applicationId === submitted.application.id)).toHaveLength(1);
  });
});

describe('7. Isolation et permissions', () => {
  it('autre tenant : demande invisible et non décidable ; sans permission : refus ; demandeur : refus', async () => {
    const submitted = (await submit())!;
    expect((await workflowService.listRequests('T-002')).map((request) => request.id)).not.toContain(submitted.request.id);
    expect(await creditService.decideLoanApplication('T-002', submitted.request.id, 'approve', B.id, B.name)).toEqual({ ok: false, reason: 'notFound' });
    expect(await creditService.disburseLoan('T-002', submitted.application.id)).toBeUndefined();
    expect(await decide(submitted.request.id, 'approve', { id: 'U-002', name: 'Fatou Ndiaye' })).toEqual({ ok: false, reason: 'forbidden' }); // Gestionnaire : pas de loans.approve.admin
    expect(await decide(submitted.request.id, 'approve', REQUESTER)).toEqual({ ok: false, reason: 'selfApproval' });
    expect(workflowRequests.find((request) => request.id === submitted.request.id)!.status).toBe('pending');
  });
});
