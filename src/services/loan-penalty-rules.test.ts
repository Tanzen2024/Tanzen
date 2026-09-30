import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loanRuleService, violatesPenaltyConstraints, type LoanRuleInput } from './loan-rule.service';
import { creditService } from './credit.service';
import { cashboxAvailableBalance, type TransactionInput } from './finance.service';
import { loanDebtAt, loanPenaltyAccruals } from '@/lib/finance';
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
import { APPROVER_1, REQUESTER, applyChange } from './loan-rule.test-helpers';

/**
 * PÉNALITÉ DE RETARD — configuration de la règle de crédit (double approbation WD-009), validations,
 * historisation sur le prêt à l'octroi et imputation d'un remboursement (règles définitives du 2026-09-29).
 */
const stores = { loanRules, workflowRequests, transactions, loans, loanFundingAllocations, applications, repayments, guarantors, auditEvents, cashboxes } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => {
  for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores]));
};
beforeEach(restore);
afterEach(restore);

const rule = () => tenantCreditRule('T-001')!;
const baseInput: LoanRuleInput = {
  name: 'Règle T-003', allowLoans: true, loanMode: 'COMPOUND', minAmount: 10_000, maxAmount: 500_000, interestRate: 5, durationMonths: 12,
  maxActiveLoans: 1, maxLoanExposure: null, requiresGuarantor: false, minGuarantors: 0, maxGuarantors: 1, guaranteeTypeRequired: 'PERSONAL', guaranteeRatio: 100,
  allowSelfGuarantee: false, requiresApproval: false, approvalLevel: null,
};

/** Prêt enregistré directement (règle sans approbation requise), financé par la caisse Épargne. */
async function lend(principal: number) {
  rule().requiresApproval = false;
  const epargne = cashboxes.find((cashbox) => cashbox.id === 'AC-009')!;
  epargne.openingBalance = 0;
  epargne.openingBalance = 5_000_000 - (cashboxAvailableBalance('T-001', 'AC-009') ?? 0);
  const transactionInput: TransactionInput = { cashboxNumber: epargne.cashboxNumber, memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount: principal, description: 'Prêt test' };
  return (await creditService.createLoanTransaction('T-001', { memberId: 'M-016', principal, guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: principal, relation: 'Membre' }], approved: true, approvedBy: APPROVER_1.name, transactionInput }))!;
}

describe('Validation de la configuration de pénalité', () => {
  it('OFF : type null et valeur 0 admis ; ON : type obligatoire et valeur > 0 ; valeur négative toujours refusée', () => {
    expect(violatesPenaltyConstraints({ penaltyEnabled: false, penaltyType: null, penaltyValue: 0 })).toBe(false);
    expect(violatesPenaltyConstraints({ penaltyEnabled: true, penaltyType: 'FIXED', penaltyValue: 50_000 })).toBe(false);
    expect(violatesPenaltyConstraints({ penaltyEnabled: true, penaltyType: 'PERCENTAGE', penaltyValue: 2 })).toBe(false);
    expect(violatesPenaltyConstraints({ penaltyEnabled: true, penaltyType: null, penaltyValue: 2 })).toBe(true);
    expect(violatesPenaltyConstraints({ penaltyEnabled: true, penaltyType: 'FIXED', penaltyValue: 0 })).toBe(true);
    expect(violatesPenaltyConstraints({ penaltyEnabled: false, penaltyType: null, penaltyValue: -1 })).toBe(true);
  });

  it('création : pénalité invalide refusée ; périodicité forcée à MENSUELLE, pénalité OFF par défaut', async () => {
    expect(await loanRuleService.createLoanRule('T-003', { ...baseInput, penaltyEnabled: true, penaltyType: null, penaltyValue: 10 })).toBeFalsy();
    expect(await loanRuleService.createLoanRule('T-003', { ...baseInput, penaltyEnabled: true, penaltyType: 'PERCENTAGE', penaltyValue: 0 })).toBeFalsy();
    const created = await loanRuleService.createLoanRule('T-003', { ...baseInput, interestPeriod: 'YEARLY' });
    expect(created).toMatchObject({ interestPeriod: 'MONTHLY', penaltyEnabled: false, penaltyType: null, penaltyValue: 0 });
  });

  it('modification : passe par la double approbation ; ON sans type refusé ; la périodicité n’est plus modifiable', async () => {
    const request = (patch: Parameters<typeof loanRuleService.requestLoanRuleUpdate>[2]) => loanRuleService.requestLoanRuleUpdate('T-001', 'LR-001', patch, REQUESTER.id, REQUESTER.name);
    expect(await request({ penaltyEnabled: true, penaltyType: null, penaltyValue: 2 })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await request({ interestPeriod: 'WEEKLY' })).toMatchObject({ ok: false, reason: 'noChange' });
    const created = await request({ penaltyEnabled: true, penaltyType: 'PERCENTAGE', penaltyValue: 2 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.request.changeSet).toEqual(expect.arrayContaining([
      { field: 'penaltyEnabled', before: false, after: true },
      { field: 'penaltyType', before: null, after: 'PERCENTAGE' },
      { field: 'penaltyValue', before: 0, after: 2 },
    ]));
    expect(rule()).toMatchObject({ penaltyEnabled: false, penaltyType: null, penaltyValue: 0 }); // inchangée avant la 2e approbation
  });
});

describe('TEST 12 / 13 — historisation de la pénalité sur le prêt', () => {
  it('prêt accordé sous 2 % : reste à 2 % quand la règle passe à 5 % ; un nouveau prêt prend 5 %', async () => {
    expect(await applyChange('T-001', 'LR-001', { penaltyEnabled: true, penaltyType: 'PERCENTAGE', penaltyValue: 2 })).toMatchObject({ penaltyEnabled: true, penaltyValue: 2 });
    const { loan: oldLoan } = await lend(100_000);
    expect(oldLoan).toMatchObject({ penaltyEnabled: true, penaltyType: 'PERCENTAGE', penaltyValue: 2, interestPeriod: 'MONTHLY' });

    expect(await applyChange('T-001', 'LR-001', { penaltyValue: 5 })).toMatchObject({ penaltyValue: 5 });
    const stored = loans.find((loan) => loan.id === oldLoan.id)!;
    expect(stored).toMatchObject({ penaltyEnabled: true, penaltyType: 'PERCENTAGE', penaltyValue: 2 });
    const until = new Date(Date.parse(`${stored.maturityDate}T00:00:00Z`) + 40 * 86_400_000).toISOString().slice(0, 10);
    const [firstLate] = loanPenaltyAccruals(stored, [], until);
    expect(firstLate).toMatchObject({ penaltyType: 'PERCENTAGE', penaltyValue: 2 });
    expect(firstLate.amount).toBe(Math.round((firstLate.base * 2) / 100));

    const { loan: newLoan } = await lend(100_000);
    expect(newLoan).toMatchObject({ penaltyEnabled: true, penaltyType: 'PERCENTAGE', penaltyValue: 5 });
  });

  it('règle sans pénalité : le prêt est accordé pénalité OFF', async () => {
    const { loan } = await lend(100_000);
    expect(loan).toMatchObject({ penaltyEnabled: false, penaltyType: null, penaltyValue: 0 });
  });
});

describe('Remboursement : part imputée sur les pénalités (penaltyPart)', () => {
  it('L-004 en retard, pénalité FIXED 50 000 : un versement couvrant la dette hors pénalités + 30 000 → penaltyPart = 30 000, reste 20 000', async () => {
    const loan = loans.find((item) => item.id === 'L-004')!;
    Object.assign(loan, { penaltyEnabled: true, penaltyType: 'FIXED', penaltyValue: 50_000 });
    const loanRepayments = () => repayments.filter((item) => item.loanId === 'L-004');
    const due = loanDebtAt(loan, loanRepayments(), '2027-08-30');
    expect(due).toBe(7_400_563 + 50_000);
    const amount = due - 20_000;
    const transactionInput: TransactionInput = { cashboxNumber: 'CS-001-CX-001', memberId: 'M-006', memberName: 'Cheikh Diop', category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit', amount, description: '' };
    const result = (await creditService.createRepaymentTransaction('T-001', { loanId: 'L-004', paymentDate: '2027-08-30', amount, transactionInput }))!;
    expect(result).toBeDefined();
    expect(result.repayment).toMatchObject({ amount, penaltyPart: 30_000 });
    expect(result.repayment.principalPart + result.repayment.interestPart).toBe(amount - 30_000);
    expect(loan.outstanding).toBe(20_000);
    expect(loanDebtAt(loan, loanRepayments(), '2027-08-30')).toBe(20_000);
    // Au-delà de la dette (pénalités comprises) : refusé, comme avant.
    expect(await creditService.createRepaymentTransaction('T-001', { loanId: 'L-004', paymentDate: '2027-08-30', amount: 20_001, transactionInput: { ...transactionInput, amount: 20_001 } })).toBeUndefined();
  });
});
