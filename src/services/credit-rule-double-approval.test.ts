import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loanRuleService } from './loan-rule.service';
import { creditService } from './credit.service';
import { permissionsOfUser, workflowService } from './workflow.service';
import { users } from '@/mocks/access/users';
import { cashboxAvailableBalance, type TransactionInput } from './finance.service';
import { financePositionService } from './finance-position.service';
import { loanInterestAccruals } from '@/lib/finance';
import { loanRules, tenantCreditRule } from '@/mocks/finance/loan-rules';
import { workflowRequests } from '@/mocks/operations/workflow-requests';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { repayments } from '@/mocks/finance/repayments';
import { guarantors } from '@/mocks/finance/guarantors';
import { cashboxes } from '@/mocks/finance/cashboxes';
import { auditEvents } from '@/mocks/audit/audit-events';
import { APPROVER_1, APPROVER_2, REQUESTER, applyChange } from './loan-rule.test-helpers';

/**
 * RÈGLE DE CRÉDIT — DOUBLE APPROBATION + HISTORISATION DES PRÊTS (mandat du 2026-09-28).
 * Demandeur U-002 (Gestionnaire), 1er approbateur U-001, 2e approbateur U-013 (administrateurs de la démo T-001).
 */
const stores = { loanRules, workflowRequests, transactions, loans, loanFundingAllocations, applications, repayments, guarantors, auditEvents, cashboxes } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => {
  for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores]));
};
beforeEach(restore);
afterEach(restore);

const rule = () => tenantCreditRule('T-001')!;
const request = (patch: Parameters<typeof loanRuleService.requestLoanRuleUpdate>[2]) => loanRuleService.requestLoanRuleUpdate('T-001', 'LR-001', patch, REQUESTER.id, REQUESTER.name);
const decide = (requestId: string, action: 'approve' | 'reject', actor = APPROVER_1, comment?: string) => loanRuleService.decideLoanRuleUpdate('T-001', requestId, action, actor.id, actor.name, comment);

/** Point de départ de l'exemple du mandat : Intérêt composé, 10 %, mensuel (valeurs de départ posées en préparation de test). */
function startFrom(loanMode: 'SIMPLE' | 'COMPOUND' | 'GLOBAL', interestRate: number) {
  Object.assign(rule(), { loanMode, interestRate, interestPeriod: 'MONTHLY', requiresApproval: false });
}

/** Prêt enregistré directement (règle sans approbation requise), financé par la caisse Épargne. */
async function lend(principal: number) {
  const epargne = cashboxes.find((cashbox) => cashbox.id === 'AC-009')!;
  epargne.openingBalance = 0;
  epargne.openingBalance = 5_000_000 - (cashboxAvailableBalance('T-001', 'AC-009') ?? 0);
  const transactionInput: TransactionInput = { cashboxNumber: epargne.cashboxNumber, memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount: principal, description: 'Prêt test' };
  return (await creditService.createLoanTransaction('T-001', { memberId: 'M-016', principal, guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: principal, relation: 'Membre' }], approved: true, approvedBy: APPROVER_1.name, transactionInput }))!;
}

describe('Double approbation de la modification de la règle de crédit', () => {
  it('1 et 2. création d’une demande : EN ATTENTE, règle active inchangée', async () => {
    startFrom('COMPOUND', 10);
    const result = await request({ loanMode: 'SIMPLE', interestRate: 15 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request).toMatchObject({ domain: 'credit', entityType: 'creditRule', entityId: 'LR-001', status: 'pending', currentStepOrder: 1, requestedByUserId: REQUESTER.id, entitySnapshotVersion: 1 });
    expect(result.request.changeSet).toEqual(expect.arrayContaining([{ field: 'loanMode', before: 'COMPOUND', after: 'SIMPLE' }, { field: 'interestRate', before: 10, after: 15 }]));
    expect(rule()).toMatchObject({ loanMode: 'COMPOUND', interestRate: 10, version: 1 });
  });

  it('3 à 6. 1re approbation → toujours inchangée ; 2e approbation (autre approbateur) → ACTIVÉE (exemple 2 BIS.9)', async () => {
    startFrom('COMPOUND', 10);
    const created = await request({ loanMode: 'SIMPLE', interestRate: 15 });
    if (!created.ok) throw new Error('demande refusée');
    const first = await decide(created.request.id, 'approve', APPROVER_1);
    expect(first).toMatchObject({ ok: true, activated: false, request: { status: 'inProgress', currentStepOrder: 2 } });
    expect(rule()).toMatchObject({ loanMode: 'COMPOUND', interestRate: 10 });
    const second = await decide(created.request.id, 'approve', APPROVER_2);
    expect(second).toMatchObject({ ok: true, activated: true, request: { status: 'approved' } });
    expect(rule()).toMatchObject({ loanMode: 'SIMPLE', interestRate: 15, version: 2 });
  });

  it('7. le même utilisateur ne peut pas faire les deux approbations ; le demandeur ne peut pas approuver', async () => {
    const created = await request({ interestRate: 15 });
    if (!created.ok) throw new Error('demande refusée');
    expect(await decide(created.request.id, 'approve', REQUESTER)).toMatchObject({ ok: false }); // U-002 : ni permission, ni droit (demandeur)
    await decide(created.request.id, 'approve', APPROVER_1);
    expect(await decide(created.request.id, 'approve', APPROVER_1)).toEqual({ ok: false, reason: 'sameApprover' });
    expect(rule().interestRate).toBe(12);
    // Demande créée par un administrateur : il ne peut pas l'approuver lui-même.
    const own = await loanRuleService.requestLoanRuleUpdate('T-001', 'LR-001', { durationMonths: 12 }, APPROVER_2.id, APPROVER_2.name);
    expect(own).toMatchObject({ ok: false, reason: 'pending' }); // une demande est déjà en cours sur la règle
  });

  it('le demandeur administrateur est exclu des deux approbations', async () => {
    const own = await loanRuleService.requestLoanRuleUpdate('T-001', 'LR-001', { durationMonths: 12 }, APPROVER_1.id, APPROVER_1.name);
    if (!own.ok) throw new Error('demande refusée');
    expect(await decide(own.request.id, 'approve', APPROVER_1)).toEqual({ ok: false, reason: 'selfApproval' });
  });

  it('8 et 10. rejet par le 1er approbateur → REJETÉE, règle inchangée', async () => {
    const created = await request({ interestRate: 30 });
    if (!created.ok) throw new Error('demande refusée');
    expect(await decide(created.request.id, 'reject', APPROVER_1, 'Taux trop élevé')).toMatchObject({ ok: true, activated: false, request: { status: 'rejected' } });
    expect(rule()).toMatchObject({ interestRate: 12, version: 1 });
    expect(await decide(created.request.id, 'approve', APPROVER_2)).toEqual({ ok: false, reason: 'notPending' });
  });

  it('9 et 10. rejet par le 2e approbateur → REJETÉE, règle inchangée, aucun effet sur les nouveaux prêts', async () => {
    startFrom('COMPOUND', 10);
    const created = await request({ loanMode: 'SIMPLE', interestRate: 30 });
    if (!created.ok) throw new Error('demande refusée');
    await decide(created.request.id, 'approve', APPROVER_1);
    expect(await decide(created.request.id, 'reject', APPROVER_2)).toMatchObject({ ok: true, request: { status: 'rejected' } });
    expect(rule()).toMatchObject({ loanMode: 'COMPOUND', interestRate: 10, version: 1 });
    expect((await lend(100_000)).loan).toMatchObject({ loanMode: 'COMPOUND', interestRate: 10 });
  });

  it('11. historique complet, jamais écrasé : demandeur, approbateurs, dates, valeurs, résultat, activation, audit', async () => {
    const created = await request({ interestRate: 15 });
    if (!created.ok) throw new Error('demande refusée');
    await decide(created.request.id, 'approve', APPROVER_1, 'OK trésorier');
    await decide(created.request.id, 'approve', APPROVER_2, 'OK président');
    const second = await request({ interestRate: 18 });
    if (!second.ok) throw new Error('seconde demande refusée');
    await decide(second.request.id, 'reject', APPROVER_1);
    const history = await loanRuleService.listLoanRuleChanges('T-001', 'LR-001');
    expect(history.map((item) => item.status)).toEqual(['rejected', 'approved']);
    const done = history[1];
    expect(done).toMatchObject({ requestedBy: REQUESTER.name, requestedByUserId: REQUESTER.id, changeSet: [{ field: 'interestRate', before: 12, after: 15 }] });
    expect(done.steps.map((step) => [step.actedBy, step.status, step.comment])).toEqual([[APPROVER_1.id, 'approved', 'OK trésorier'], [APPROVER_2.id, 'approved', 'OK président']]);
    expect(done.steps.every((step) => Boolean(step.actedAt))).toBe(true);
    expect(done.appliedAt).toBeTruthy();
    expect(history[0].appliedAt).toBeUndefined();
    const actions = auditEvents.filter((event) => event.resourceId === 'LR-001').map((event) => event.action);
    expect(actions).toEqual(expect.arrayContaining(['loanRules.updateRequested', 'loanRules.updateApproved', 'loanRules.updateActivated', 'loanRules.updateRejected']));
    const activation = auditEvents.find((event) => event.action === 'loanRules.updateActivated')!;
    expect(activation).toMatchObject({ before: { interestRate: '12' }, after: { interestRate: '15' } });
  });

  it('14. impossible de contourner le workflow', async () => {
    // Plus aucune écriture directe exposée par le service.
    expect('updateLoanRule' in loanRuleService).toBe(false);
    // Demande par un utilisateur sans `loanRules.manage` (U-003, lecture seule).
    expect(await loanRuleService.requestLoanRuleUpdate('T-001', 'LR-001', { interestRate: 1 }, 'U-003', 'Cheikh Diop')).toEqual({ ok: false, reason: 'forbidden' });
    const created = await request({ interestRate: 1 });
    if (!created.ok) throw new Error('demande refusée');
    // Le moteur générique refuse d'approuver une demande de règle (séparation et activation hors de portée).
    expect(await workflowService.decide('T-001', created.request.id, 'approve', APPROVER_1.id, APPROVER_1.name)).toBeUndefined();
    // Approbateur sans `loanRules.approve` (Gestionnaire).
    expect(await decide(created.request.id, 'approve', { id: 'U-002', name: 'Fatou Ndiaye' })).toMatchObject({ ok: false });
    // Autre tenant : la demande est introuvable.
    expect(await loanRuleService.decideLoanRuleUpdate('T-002', created.request.id, 'approve', APPROVER_1.id, APPROVER_1.name)).toEqual({ ok: false, reason: 'notFound' });
    expect(rule().interestRate).toBe(12);
  });

  it('15. deux modifications concurrentes : la seconde est refusée tant que la première n’est pas terminée, rien n’est écrasé', async () => {
    const first = await request({ interestRate: 15 });
    if (!first.ok) throw new Error('demande refusée');
    const concurrent = await request({ interestRate: 20 });
    expect(concurrent).toEqual({ ok: false, reason: 'pending', existingRequestId: first.request.id });
    expect(workflowRequests.find((item) => item.id === first.request.id)!.changeSet).toEqual([{ field: 'interestRate', before: 12, after: 15 }]);
    await decide(first.request.id, 'approve', APPROVER_1);
    expect(await request({ interestRate: 20 })).toMatchObject({ ok: false, reason: 'pending' }); // encore en cours (2e étape)
    await decide(first.request.id, 'approve', APPROVER_2);
    const next = await request({ interestRate: 20 });
    expect(next).toMatchObject({ ok: true, request: { entitySnapshotVersion: 2, changeSet: [{ field: 'interestRate', before: 15, after: 20 }] } });
  });

  it('valeurs invalides ou aucune modification → aucune demande créée', async () => {
    const before = workflowRequests.length;
    expect(await request({ minAmount: 9_000_000 })).toEqual({ ok: false, reason: 'invalid' });
    expect(await request({ interestRate: 12 })).toEqual({ ok: false, reason: 'noChange' });
    expect(workflowRequests.length).toBe(before);
  });
});

describe('Historisation des paramètres financiers du prêt', () => {
  it('ÉTAPES 1 à 4 — composé 10 % → règle passée à simple 20 % : l’ancien prêt reste composé 10 %, le nouveau suit la nouvelle règle', async () => {
    // ÉTAPE 1 : octroi sous « Intérêt composé, 10 %, mensuel ».
    startFrom('COMPOUND', 10);
    const { loan: oldLoan } = await lend(100_000);
    expect(oldLoan).toMatchObject({ loanMode: 'COMPOUND', interestRate: 10, interestPeriod: 'MONTHLY' });
    const before = loanInterestAccruals(oldLoan, [], oldLoan.maturityDate).map((accrual) => [accrual.base, accrual.amount]);
    expect(before.slice(0, 2)).toEqual([[100_000, 10_000], [110_000, 11_000]]);

    // ÉTAPE 2 : modification de la règle par double approbation (simple, 20 %, mensuel).
    expect(await applyChange('T-001', 'LR-001', { loanMode: 'SIMPLE', interestRate: 20, interestPeriod: 'MONTHLY' })).toMatchObject({ loanMode: 'SIMPLE', interestRate: 20 });

    // ÉTAPE 3 : l'ancien prêt est recalculé à l'identique (composé 10 %), jamais avec la nouvelle règle.
    const stored = loans.find((loan) => loan.id === oldLoan.id)!;
    expect(stored).toMatchObject({ loanMode: 'COMPOUND', interestRate: 10, interestPeriod: 'MONTHLY' });
    expect(loanInterestAccruals(stored, [], stored.maturityDate).map((accrual) => [accrual.base, accrual.amount])).toEqual(before);

    // ÉTAPE 4 : un nouveau prêt utilise la nouvelle règle.
    const { loan: newLoan } = await lend(100_000);
    expect(newLoan).toMatchObject({ loanMode: 'SIMPLE', interestRate: 20, interestPeriod: 'MONTHLY' });
    expect(loanInterestAccruals(newLoan, [], newLoan.maturityDate).slice(0, 2).map((accrual) => [accrual.base, accrual.amount])).toEqual([[100_000, 20_000], [100_000, 20_000]]);
  });

  it('le bilan affiche et calcule chaque prêt selon SES paramètres, même après changement de règle', async () => {
    startFrom('COMPOUND', 10);
    const { loan: oldLoan } = await lend(100_000);
    await applyChange('T-001', 'LR-001', { loanMode: 'SIMPLE', interestRate: 20 });
    const { loan: newLoan } = await lend(50_000);
    const { statements } = await financePositionService.memberPeriodStatements('T-001', { memberIds: ['M-016'], from: '2026-01-01', to: '2027-12-31' });
    const lines = statements[0].end.loans;
    expect(lines.find((line) => line.loanId === oldLoan.id)).toMatchObject({ loanMode: 'COMPOUND', rate: 10 });
    expect(lines.find((line) => line.loanId === newLoan.id)).toMatchObject({ loanMode: 'SIMPLE', rate: 20 });
  });
});

describe('Intérêt global : décaissement, montant reçu, dette et trésorerie cohérents', () => {
  it('100 000 à 25 % (règles de référence) : le journal décaisse 100 000, la dette vaut 125 000 dès l’origine, aucun intérêt périodique', async () => {
    startFrom('GLOBAL', 25);
    const available = () => cashboxAvailableBalance('T-001', 'AC-009') ?? 0;
    const result = await lend(100_000);
    expect(result.loan).toMatchObject({ loanMode: 'GLOBAL', interestRate: 25, interestAmount: 25_000, totalRepayable: 125_000 });
    expect(result.transactions.map((tx) => tx.amount)).toEqual([100_000]);
    expect(result.transactions[0].description).not.toMatch(/prélevé/);
    expect(result.allocations.map((allocation) => allocation.amount)).toEqual([100_000]);
    expect(available()).toBe(5_000_000 - 100_000);
    expect((await creditService.getLoan('T-001', result.loan.id))?.outstanding).toBe(125_000);
    const { statements } = await financePositionService.memberPeriodStatements('T-001', { memberIds: ['M-016'], from: '2026-01-01', to: '2027-12-31' });
    const line = statements[0].end.loans.find((item) => item.loanId === result.loan.id);
    expect(line).toMatchObject({ principal: 100_000, interestAccrued: 25_000, outstanding: 125_000 });
    expect(line).not.toHaveProperty('interestWithheld');
    expect(line).not.toHaveProperty('netReceived');
  });
});

describe('Données de démonstration T-001 : trois administrateurs actifs distincts', () => {
  const T001_ADMINS = ['U-001', 'U-013', 'U-014'];

  it('au moins 3 administrateurs actifs, chacun autorisé à demander ET à approuver ; U-011 reste désactivé ; règle de démo intacte', () => {
    const activeAdmins = users.filter((user) => user.tenantId === 'T-001' && user.isActive && user.roleIds.includes('role-admin')).map((user) => user.id);
    expect(activeAdmins).toEqual(T001_ADMINS);
    for (const id of T001_ADMINS) expect(permissionsOfUser('T-001', id)).toEqual(expect.arrayContaining(['loanRules.manage', 'loanRules.approve']));
    expect(users.find((user) => user.id === 'U-011')).toMatchObject({ isActive: false, roleIds: ['role-admin'] });
    expect(permissionsOfUser('T-001', 'U-011')).toEqual([]);
    expect(rule()).toMatchObject({ requiresGuarantor: false, loanMode: 'COMPOUND', interestRate: 12, interestPeriod: 'MONTHLY', version: 1 });
  });

  it('scénario réel A → B → C : A (U-001) demande, B (U-013) 1re approbation, C (U-014) 2e approbation → activée ; protections et audit des trois acteurs', async () => {
    const A = { id: 'U-001', name: 'Amadou Mbaye' };
    const B = { id: 'U-013', name: 'Jeanne Mbarga' };
    const C = { id: 'U-014', name: 'Paul Ekotto' };
    const created = await loanRuleService.requestLoanRuleUpdate('T-001', 'LR-001', { durationMonths: 18 }, A.id, A.name);
    if (!created.ok) throw new Error('demande refusée');
    // A ne peut pas approuver sa propre demande.
    expect(await decide(created.request.id, 'approve', A)).toEqual({ ok: false, reason: 'selfApproval' });
    // Aucun contournement par le moteur générique.
    expect(await workflowService.decide('T-001', created.request.id, 'approve', B.id, B.name)).toBeUndefined();
    // B : 1re approbation — aucune activation.
    expect(await decide(created.request.id, 'approve', B)).toMatchObject({ ok: true, activated: false, request: { currentStepOrder: 2 } });
    expect(rule()).toMatchObject({ durationMonths: 24, version: 1 });
    // B ne peut pas faire la 2e approbation.
    expect(await decide(created.request.id, 'approve', B)).toEqual({ ok: false, reason: 'sameApprover' });
    // C : 2e approbation — activation.
    expect(await decide(created.request.id, 'approve', C)).toMatchObject({ ok: true, activated: true, request: { status: 'approved' } });
    expect(rule()).toMatchObject({ durationMonths: 18, version: 2 });
    // Audit : demandeur, 1er et 2e approbateurs, activation.
    const trail = auditEvents.filter((event) => event.resourceId === 'LR-001' && event.context?.requestId === created.request.id);
    expect(trail.find((event) => event.action === 'loanRules.updateRequested')?.actorId).toBe(A.id);
    expect(trail.filter((event) => event.action === 'loanRules.updateApproved').map((event) => [event.actorId, event.context?.step])).toEqual([[B.id, 1], [C.id, 2]]);
    expect(trail.some((event) => event.action === 'loanRules.updateActivated')).toBe(true);
    const stored = workflowRequests.find((item) => item.id === created.request.id)!;
    expect([stored.requestedByUserId, ...stored.steps.map((step) => step.actedBy)]).toEqual([A.id, B.id, C.id]);
  });
});
