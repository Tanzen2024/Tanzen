import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { creditService } from './credit.service';
import { workflowService } from './workflow.service';
import { cashboxAvailableBalance, type TransactionInput } from './finance.service';
import { transactionBatchService } from './transaction-batch.service';
import { transactions } from '@/mocks/finance/transactions';
import { loanRules } from '@/mocks/finance/loan-rules';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { repayments } from '@/mocks/finance/repayments';
import { guarantors } from '@/mocks/finance/guarantors';
import { cashboxes } from '@/mocks/finance/cashboxes';
import { auditEvents } from '@/mocks/audit/audit-events';

// Workflow d'approbation des prêts (2026-09-27) : un prêt n'est enregistré DIRECTEMENT que si la règle n'exige
// pas d'approbation (sinon il passe par `submitLoanApplication`) — ces tests portent sur ce chemin direct.
const RULES_SEED = structuredClone(loanRules);
beforeEach(() => { loanRules.splice(0, loanRules.length, ...structuredClone(RULES_SEED)); loanRules.find((rule) => rule.id === 'LR-001')!.requiresApproval = false; });
afterEach(() => { loanRules.splice(0, loanRules.length, ...structuredClone(RULES_SEED)); });

/**
 * FINANCEMENT MULTI-CAISSES D'UN PRÊT (mandat du 2026-09-26) — règles garanties par le SERVICE :
 * un seul `Loan`, une allocation + une transaction de débit par caisse, caisse courante d'abord,
 * Σ allocations = capital, jamais de prêt partiellement financé, remboursement au prorata.
 */
const stores = { transactions, loans, loanFundingAllocations, applications, repayments, guarantors, auditEvents, cashboxes } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restore = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); };
beforeEach(restore);
afterEach(restore);

/** Caisses T-001 : on leur donne un disponible précis (le report compense le journal de démonstration déjà présent). */
const EPARGNE = 'AC-009'; const INSCRIPTION = 'AC-010'; const SECOURS = 'AC-011'; const TRANSPORT = 'AC-012';
const NUMBER: Record<string, string> = { [EPARGNE]: 'CS-001-CX-001', [INSCRIPTION]: 'CS-001-CX-002', [SECOURS]: 'CS-001-CX-003', [TRANSPORT]: 'CS-001-CX-004' };
function fund(balances: Record<string, number>) {
  for (const [id, amount] of Object.entries(balances)) {
    const cashbox = cashboxes.find((item) => item.id === id)!;
    cashbox.openingBalance = 0;
    cashbox.openingBalance = amount - (cashboxAvailableBalance('T-001', id) ?? 0);
  }
}

function lend(principal: number, complementaryFunding: { cashboxId: string; amount: number }[] = [], currentCashboxId = EPARGNE) {
  const transactionInput: TransactionInput = { cashboxNumber: NUMBER[currentCashboxId], memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount: principal, description: 'Prêt multi-caisses' };
  return creditService.createLoanTransaction('T-001', { memberId: 'M-016', principal, guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: principal, relation: 'Membre' }], approved: true, approvedBy: 'Amadou Mbaye', transactionInput, complementaryFunding });
}

describe('Création d’un prêt financé par plusieurs caisses', () => {
  it('CAS 1 — caisse courante suffisante : une seule allocation, une seule transaction, sur la caisse courante', async () => {
    fund({ [EPARGNE]: 200_000, [INSCRIPTION]: 200_000 });
    const result = (await lend(150_000))!;
    expect(result.allocations.map((allocation) => [allocation.cashboxId, allocation.amount])).toEqual([[EPARGNE, 150_000]]);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ source: 'CS-001-CX-001', amount: 150_000, type: 'debit', loanId: result.loan.id });
  });

  it('CAS 2 — caisse courante insuffisante et aucun complément : refus, RIEN n’est écrit', async () => {
    fund({ [EPARGNE]: 110_000, [INSCRIPTION]: 200_000 });
    const before = { tx: transactions.length, loans: loans.length, allocations: loanFundingAllocations.length };
    expect(await lend(150_000)).toBeUndefined();
    expect({ tx: transactions.length, loans: loans.length, allocations: loanFundingAllocations.length }).toEqual(before);
  });

  it('CAS 3 + 7 + 8 — 110 000 (courante) + 40 000 (complément) : UN seul Loan de 150 000, deux débits, chaque caisse ne supporte que sa part', async () => {
    fund({ [EPARGNE]: 110_000, [INSCRIPTION]: 50_000 });
    const loanCount = loans.length;
    const result = (await lend(150_000, [{ cashboxId: INSCRIPTION, amount: 40_000 }]))!;
    expect(loans.length).toBe(loanCount + 1);
    expect(result.loan.principal).toBe(150_000);
    expect(result.allocations.map((allocation) => [allocation.cashboxId, allocation.amount])).toEqual([[EPARGNE, 110_000], [INSCRIPTION, 40_000]]);
    expect(result.transactions.map((tx) => [tx.source, tx.amount, tx.type, tx.category, tx.subcategory, tx.loanId])).toEqual([
      ['CS-001-CX-001', 110_000, 'debit', 'AUTRES', 'PRET', result.loan.id],
      ['CS-001-CX-002', 40_000, 'debit', 'AUTRES', 'PRET', result.loan.id],
    ]);
    for (const allocation of result.allocations) expect(result.transactions.map((tx) => tx.id)).toContain(allocation.transactionId);
    expect(cashboxAvailableBalance('T-001', EPARGNE)).toBe(0);
    expect(cashboxAvailableBalance('T-001', INSCRIPTION)).toBe(10_000);
    expect(result.loan).not.toHaveProperty('cashboxId');
    expect(await creditService.listLoanFundingAllocations('T-001', result.loan.id)).toHaveLength(2);
  });

  it('CAS 4 — prêt de 300 000 : courante 100 000 + 120 000 + 50 000 + 30 000, total exact', async () => {
    fund({ [EPARGNE]: 100_000, [INSCRIPTION]: 120_000, [SECOURS]: 50_000, [TRANSPORT]: 80_000 });
    const result = (await lend(300_000, [{ cashboxId: INSCRIPTION, amount: 120_000 }, { cashboxId: SECOURS, amount: 50_000 }, { cashboxId: TRANSPORT, amount: 30_000 }]))!;
    expect(result.allocations.reduce((sum, allocation) => sum + allocation.amount, 0)).toBe(300_000);
    expect(result.transactions.reduce((sum, tx) => sum + tx.amount, 0)).toBe(300_000);
    expect(cashboxAvailableBalance('T-001', TRANSPORT)).toBe(50_000);
  });

  it('CAS 5 — fonds insuffisants même avec les compléments : refus, rien d’écrit', async () => {
    fund({ [EPARGNE]: 110_000, [INSCRIPTION]: 20_000 });
    const before = transactions.length;
    expect(await lend(150_000, [{ cashboxId: INSCRIPTION, amount: 20_000 }])).toBeUndefined();
    expect(transactions.length).toBe(before);
  });

  it('CAS 6 — Σ allocations > capital (110 000 + 50 000 pour 150 000) : refus', async () => {
    fund({ [EPARGNE]: 110_000, [INSCRIPTION]: 200_000 });
    expect(await lend(150_000, [{ cashboxId: INSCRIPTION, amount: 50_000 }])).toBeUndefined();
  });

  it('un complément au-delà du disponible de sa caisse, ou une caisse d’un autre tenant / inactive, est refusé', async () => {
    fund({ [EPARGNE]: 110_000, [INSCRIPTION]: 30_000 });
    expect(await lend(150_000, [{ cashboxId: INSCRIPTION, amount: 40_000 }])).toBeUndefined();
    expect(await lend(150_000, [{ cashboxId: 'AC-004', amount: 40_000 }])).toBeUndefined(); // caisse de T-002
    fund({ [SECOURS]: 100_000 });
    cashboxes.find((cashbox) => cashbox.id === SECOURS)!.status = 'inactive';
    expect(await lend(150_000, [{ cashboxId: SECOURS, amount: 40_000 }])).toBeUndefined();
  });

  it('les limites de la règle de crédit restent appliquées (montant hors plafond refusé même financé)', async () => {
    fund({ [EPARGNE]: 5_000_000 });
    expect(await lend(2_500_000)).toBeUndefined();
  });
});

/** Approuve la demande de workflow d'un dossier (approbateur U-001, distinct du demandeur) — seul chemin menant à un décaissement. */
async function approveThroughWorkflow(tenantId: string, requestId: string) {
  const approved = (await workflowService.submitAction(tenantId, requestId, 'approve', 'Amadou Mbaye', undefined, 'U-001'))!;
  creditService.applyLoanApplicationDecision(tenantId, approved);
}

describe('Décaissement d’une demande approuvée — même règle', () => {
  async function approvedApplication(amount: number) {
    const submitted = await creditService.submitLoanApplication('T-001', { memberId: 'M-016', requestedAmount: amount, purpose: 'Demande multi-caisses', guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: amount, relation: 'Membre' }] }, 'Modou Faye');
    await approveThroughWorkflow('T-001', submitted!.request.id);
    return applications.find((item) => item.id === submitted!.application.id)!;
  }

  it('Épargne insuffisante sans complément → refus ; avec complément → un prêt, deux allocations', async () => {
    fund({ [EPARGNE]: 110_000, [INSCRIPTION]: 50_000 });
    const application = await approvedApplication(150_000);
    expect(await creditService.disburseLoan('T-001', application.id)).toBeUndefined();
    expect(application.stage).toBe('stageApproved');
    const disbursed = (await creditService.disburseLoan('T-001', application.id, undefined, [{ cashboxId: INSCRIPTION, amount: 40_000 }]))!;
    expect(disbursed.loan.principal).toBe(150_000);
    expect((await creditService.listLoanFundingAllocations('T-001', disbursed.loan.id)).map((allocation) => [allocation.cashboxId, allocation.amount])).toEqual([[EPARGNE, 110_000], [INSCRIPTION, 40_000]]);
  });
});

describe('Remboursement d’un prêt multi-caisses — prorata des allocations', () => {
  it('11 000 remboursés sur (110 000 ; 40 000) → 8 067 à Épargne, 2 933 à Inscription, UN seul Repayment', async () => {
    fund({ [EPARGNE]: 110_000, [INSCRIPTION]: 50_000 });
    const { loan } = (await lend(150_000, [{ cashboxId: INSCRIPTION, amount: 40_000 }]))!;
    const repaymentCount = repayments.length;
    const result = (await creditService.createRepaymentTransaction('T-001', {
      loanId: loan.id, paymentDate: loan.disbursementDate, amount: 11_000, // ≥ décaissement (sinon dette 0 → refus)
      transactionInput: { cashboxNumber: 'CS-001-CX-004', memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit', amount: 11_000, description: 'Remboursement' },
    }))!;
    expect(repayments.length).toBe(repaymentCount + 1);
    expect(result.transactions.map((tx) => [tx.destination, tx.amount, tx.type, tx.repaymentId])).toEqual([
      ['CS-001-CX-001', 8_067, 'credit', result.repayment.id],
      ['CS-001-CX-002', 2_933, 'credit', result.repayment.id],
    ]);
    expect(result.repayment.amount).toBe(11_000);
    expect(result.repayment.transactionId).toBe(result.transactions[0].id);
  });

  it('prêt antérieur sans allocation (L-001) : encaissement unique sur la caisse choisie, comme avant', async () => {
    const result = (await creditService.createRepaymentTransaction('T-001', {
      loanId: 'L-001', paymentDate: '2026-09-26', amount: 11_000,
      transactionInput: { cashboxNumber: 'CS-001-CX-004', memberId: 'M-001', memberName: 'Fatou Ndiaye', category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit', amount: 11_000, description: 'Remboursement' },
    }))!;
    expect(result.transactions.map((tx) => [tx.destination, tx.amount])).toEqual([['CS-001-CX-004', 11_000]]);
  });
});

describe('Saisie en lot — tout ou rien, allocations comprises', () => {
  it('une ligne refusée après un prêt multi-caisses annule aussi ses allocations et ses deux transactions', async () => {
    fund({ [EPARGNE]: 110_000, [INSCRIPTION]: 50_000 });
    const before = { tx: transactions.length, loans: loans.length, allocations: loanFundingAllocations.length };
    const base: TransactionInput = { cashboxNumber: 'CS-001-CX-001', memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount: 150_000, description: 'Prêt' };
    const result = await transactionBatchService.createTransactionsBatch('T-001', [
      { kind: 'loan', input: { memberId: 'M-016', principal: 150_000, guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: 150_000, relation: '' }], approved: true, transactionInput: base, complementaryFunding: [{ cashboxId: INSCRIPTION, amount: 40_000 }] } },
      { kind: 'transaction', input: { ...base, cashboxNumber: 'TH-002-TRÉS', category: 'AUTRES', subcategory: 'DEPOT', type: 'credit' } }, // caisse d'un autre tenant → refus
    ]);
    expect(result).toEqual({ ok: false, failedIndex: 1 });
    expect({ tx: transactions.length, loans: loans.length, allocations: loanFundingAllocations.length }).toEqual(before);
  });
});
