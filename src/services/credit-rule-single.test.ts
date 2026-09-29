import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { creditService, collectionTransactionOf, disbursementTransactionOf } from './credit.service';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { repayments } from '@/mocks/finance/repayments';
import { guarantors } from '@/mocks/finance/guarantors';
import { loanRules, tenantCreditRule } from '@/mocks/finance/loan-rules';
import { computeLoanTerms } from '@/lib/finance';
import type { TransactionInput } from './finance.service';


/**
 * RÈGLE DE CRÉDIT UNIQUE PAR TENANT (décision définitive du 2026-09-26) :
 *   Tenant → une CreditRule → tous les prêts ; le prêt ne porte ni règle ni caisse ;
 *   la caisse n'apparaît que sur la TRANSACTION (décaissement / encaissement).
 */
const stores = { transactions, loans, applications, repayments, guarantors, loanRules, loanFundingAllocations } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); };
beforeEach(restore);
afterEach(restore);
// Workflow d'approbation des prêts (2026-09-27) : prêt DIRECT uniquement si la règle n'exige pas d'approbation — ces tests portent sur ce chemin.
beforeEach(() => { loanRules.find((rule) => rule.id === 'LR-001')!.requiresApproval = false; });

const MEMBERS = { 'M-001': 'Fatou Ndiaye', 'M-016': 'Modou Faye', 'M-018': 'Coumba Thiam' } as const;
const CASHBOX = { 'AC-012': 'CS-001-CX-004', 'AC-011': 'CS-001-CX-003' } as const;

function lendFrom(cashboxId: keyof typeof CASHBOX, memberId: keyof typeof MEMBERS, principal = 100_000) {
  const transactionInput: TransactionInput = { cashboxNumber: CASHBOX[cashboxId], memberId, memberName: MEMBERS[memberId], category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount: principal, description: `Prêt ${memberId}` };
  return creditService.createLoanTransaction('T-001', { memberId, principal, guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: principal, relation: 'Membre' }], approved: true, approvedBy: 'Amadou Mbaye', transactionInput });
}

describe('Prêt — la règle unique du tenant s’applique automatiquement', () => {
  it('aucun choix de règle : les conditions du prêt sont celles de LA règle du tenant (LR-001)', async () => {
    const result = await lendFrom('AC-012', 'M-016', 200_000);
    expect(result).toBeTruthy();
    const rule = tenantCreditRule('T-001')!;
    expect(rule.id).toBe('LR-001');
    const expected = computeLoanTerms(200_000, rule, result!.transaction.date);
    expect(result!.loan).toMatchObject({ interestRate: rule.interestRate, interestAmount: expected.interestAmount, totalRepayable: expected.totalRepayable });
  });

  it('le prêt ne stocke ni règle ni caisse ; le décaissement, lui, porte la caisse — DÉBIT, AUTRES / PRÊT', async () => {
    const result = await lendFrom('AC-012', 'M-016');
    expect(result!.loan).not.toHaveProperty('creditRuleId');
    expect(result!.loan).not.toHaveProperty('cashboxId');
    const disbursement = disbursementTransactionOf(result!.loan)!;
    // Mandat du 2026-09-27 : le décaissement sort d'Épargne (prioritaire), quelle que soit la caisse passée par l'appelant.
    expect(disbursement).toMatchObject({ loanId: result!.loan.id, source: 'CS-001-CX-001', type: 'debit', category: 'AUTRES', subcategory: 'PRET', amount: 100_000 });
  });

  it('un prêt en CRÉDIT est refusé par le service', async () => {
    const transactionInput: TransactionInput = { cashboxNumber: 'CS-001-CX-004', memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'PRET', type: 'credit', amount: 100_000, description: 'Prêt à l’envers' };
    expect(await creditService.createLoanTransaction('T-001', { memberId: 'M-016', principal: 100_000, guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: 100_000, relation: 'Membre' }], approved: true, transactionInput })).toBeUndefined();
  });

  it('les limites de la règle unique s’appliquent quelle que soit la caisse (montant au-delà du plafond refusé depuis AC-011)', async () => {
    expect(await lendFrom('AC-011', 'M-016', 2_500_000)).toBeUndefined();
  });

  it('règle qui n’autorise pas les prêts → aucun prêt, sur aucune caisse', async () => {
    tenantCreditRule('T-001')!.allowLoans = false;
    expect(await lendFrom('AC-012', 'M-016')).toBeUndefined();
    expect(await lendFrom('AC-011', 'M-018')).toBeUndefined();
  });
});

describe('Multi-caisses — même règle', () => {
  it('trois prêts saisis « depuis » des caisses différentes : même règle, et tous financés par Épargne (caisse prioritaire)', async () => {
    const a = await lendFrom('AC-012', 'M-001');
    const b = await lendFrom('AC-011', 'M-016');
    const c = await lendFrom('AC-012', 'M-018');
    expect([a, b, c].every(Boolean)).toBe(true);
    expect([a, b, c].map((result) => disbursementTransactionOf(result!.loan)!.source)).toEqual(['CS-001-CX-001', 'CS-001-CX-001', 'CS-001-CX-001']);
    const rule = tenantCreditRule('T-001')!;
    for (const result of [a, b, c]) expect(result!.loan.interestRate).toBe(rule.interestRate);
  });
});

describe('Remboursement — lié au prêt, encaissé sur une caisse', () => {
  it('CRÉDIT, AUTRES / REMBOURSEMENT, rattaché au prêt et à la caisse d’encaissement', async () => {
    const result = await creditService.createRepaymentTransaction('T-001', {
      loanId: 'L-001', paymentDate: '2026-09-20', principalPart: 10_000, interestPart: 1_000,
      transactionInput: { cashboxNumber: 'CS-001-CX-003', memberId: 'M-001', memberName: 'Fatou Ndiaye', category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit', amount: 11_000, description: 'Remboursement' },
    });
    expect(result!.repayment.loanId).toBe('L-001');
    expect(collectionTransactionOf(result!.repayment)).toMatchObject({ loanId: 'L-001', destination: 'CS-001-CX-003', type: 'credit', category: 'AUTRES', subcategory: 'REMBOURSEMENT' });
  });
});
