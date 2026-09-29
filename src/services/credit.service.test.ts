import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { creditService } from './credit.service';
import { workflowService } from './workflow.service';
import { transactions } from '@/mocks/finance/transactions';
import { loanRules } from '@/mocks/finance/loan-rules';
import { repayments } from '@/mocks/finance/repayments';
import { loanDebtAt } from '@/lib/finance';
import type { TransactionInput } from './finance.service';

// Workflow d'approbation des prêts (2026-09-27) : un prêt n'est enregistré DIRECTEMENT que si la règle n'exige
// pas d'approbation (sinon il passe par `submitLoanApplication`) — ces tests portent sur ce chemin direct.
const RULES_SEED = structuredClone(loanRules);
beforeEach(() => { loanRules.splice(0, loanRules.length, ...structuredClone(RULES_SEED)); loanRules.find((rule) => rule.id === 'LR-001')!.requiresApproval = false; });
afterEach(() => { loanRules.splice(0, loanRules.length, ...structuredClone(RULES_SEED)); });

describe('creditService — Applications', () => {
  it('ALLOW/DENY: listApplications and getApplication are scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([creditService.listApplications('T-001'), creditService.listApplications('T-002')]);
    expect(t001.every((application) => application.tenantId === 'T-001')).toBe(true);
    if (t002.length > 0) {
      const result = await creditService.getApplication('T-001', t002[0].id);
      expect(result).toBeNull();
    }
  });

  it('DENY: advanceApplicationStage cannot mutate an application of another tenant', async () => {
    const [t001] = await creditService.listApplications('T-001');
    const result = await creditService.advanceApplicationStage('T-002', t001.id, 'stageApproved');
    expect(result).toBeNull();
  });
});

describe('creditService — Loans', () => {
  it('ALLOW/DENY: listLoans and getLoan are scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([creditService.listLoans('T-001'), creditService.listLoans('T-002')]);
    expect(t001.every((loan) => loan.tenantId === 'T-001')).toBe(true);
    expect(t002.length).toBeGreaterThan(0);
    const result = await creditService.getLoan('T-001', t002[0].id);
    expect(result).toBeNull();
  });

  it('DENY: closeLoan cannot mutate a loan of another tenant', async () => {
    const [t001] = await creditService.listLoans('T-001');
    const result = await creditService.closeLoan('T-002', t001.id);
    expect(result).toBeNull();
  });
});

describe('creditService — Repayments/Guarantors: two-step tenant scoping via parent Loan', () => {
  it('DENY: listRepaymentsByLoan returns an empty list (not another tenant\'s data) for a loan of another tenant', async () => {
    const [t002Loan] = await creditService.listLoans('T-002');
    const result = await creditService.listRepaymentsByLoan('T-001', t002Loan.id);
    expect(result).toEqual([]);
  });

  it('DENY: listGuarantorsByLoan returns an empty list for a loan of another tenant', async () => {
    const [t002Loan] = await creditService.listLoans('T-002');
    const result = await creditService.listGuarantorsByLoan('T-001', t002Loan.id);
    expect(result).toEqual([]);
  });

  it('DENY: createRepayment refuses to write against a loan of another tenant', async () => {
    const [t002Loan] = await creditService.listLoans('T-002');
    const before = await creditService.getLoan('T-002', t002Loan.id);
    const result = await creditService.createRepayment('T-001', { loanId: t002Loan.id, paymentDate: '2026-12-01', principalPart: 50_000, interestPart: 5_000, status: 'completed' });
    expect(result).toBeNull();
    const after = await creditService.getLoan('T-002', t002Loan.id);
    expect(after?.paidAmount).toBe(before?.paidAmount);
  });

  it('DENY: createGuarantor refuses to write against a loan of another tenant', async () => {
    const [t002Loan] = await creditService.listLoans('T-002');
    const result = await creditService.createGuarantor('T-001', { loanId: t002Loan.id, guarantorName: 'Intrus', guaranteedAmount: 10_000, relation: 'friend' });
    expect(result).toBeNull();
  });
});

describe('creditService — REGRESSION: repayment recalculates parent loan paidAmount/outstanding/progress (Phase 7)', () => {
  it('ALLOW: a completed repayment on L-001 updates paidAmount/outstanding/progress with the verified formula', async () => {
    const before = await creditService.getLoan('T-001', 'L-001');
    expect(before).not.toBeNull();
    // `before` is a live reference into the same mutable mock array (services never clone),
    // so its primitive fields must be captured before the mutation, not read again afterwards.
    const beforePaidAmount = before?.paidAmount ?? 0;
    // Règles de référence (2026-09-28) : la dette avant remboursement est la DETTE COURANTE à la date du paiement.
    const debtOf = (date: string) => loanDebtAt(before!, repayments.filter((item) => item.loanId === 'L-001' && item.tenantId === 'T-001'), date);
    const debtBefore = debtOf('2026-09-01');
    const principalPart = 80_000;
    const interestPart = 20_000;
    const repayment = await creditService.createRepayment('T-001', { loanId: 'L-001', paymentDate: '2026-09-01', principalPart, interestPart, status: 'completed' });
    expect(repayment).not.toBeNull();
    expect(repayment?.amount).toBe(principalPart + interestPart);

    const after = await creditService.getLoan('T-001', 'L-001');
    const expectedPaidAmount = beforePaidAmount + principalPart + interestPart;
    // Dette juste après le paiement = dette courante du 01/09 − 100 000 (le remboursement ne crée aucun intérêt).
    expect(debtOf('2026-09-01')).toBe(debtBefore - 100_000);
    const expectedProgress = Math.min(100, Math.round((expectedPaidAmount / (expectedPaidAmount + debtBefore - 100_000)) * 100));
    expect(after?.paidAmount).toBe(expectedPaidAmount);
    // `outstanding` exposé = dette courante du jour (intérêts des échéances suivantes sur la base réduite).
    expect(after?.outstanding).toBe(debtOf(new Date().toISOString().slice(0, 10)));
    expect(after?.progress).toBe(expectedProgress);
    expect(after?.lastPaymentDate).toBe('2026-09-01');
  });

  it('does NOT update the loan when the repayment status is not "completed"', async () => {
    const before = await creditService.getLoan('T-001', 'L-004');
    // Snapshot primitives — `before` is a live reference into the mutable mock array.
    const beforePaidAmount = before?.paidAmount;
    const beforeOutstanding = before?.outstanding;
    const beforeProgress = before?.progress;
    const repayment = await creditService.createRepayment('T-001', { loanId: 'L-004', paymentDate: '2026-09-01', principalPart: 10_000, interestPart: 1_000, status: 'scheduled' });
    expect(repayment).not.toBeNull();
    const after = await creditService.getLoan('T-001', 'L-004');
    expect(after?.paidAmount).toBe(beforePaidAmount);
    expect(after?.outstanding).toBe(beforeOutstanding);
    expect(after?.progress).toBe(beforeProgress);
  });
});

describe('creditService — createRepayment: garde-fous ajoutés (mandat Finance/Tontines §14)', () => {
  it('DENY: refuse un remboursement qui dépasserait la dette courante, sans muter le prêt', async () => {
    const before = await creditService.getLoan('T-001', 'L-001');
    const paidAmount = before?.paidAmount ?? 0;
    const debt = loanDebtAt(before!, repayments.filter((item) => item.loanId === 'L-001'), '2026-09-01');
    const result = await creditService.createRepayment('T-001', { loanId: 'L-001', paymentDate: '2026-09-01', principalPart: debt + 1, interestPart: 0, status: 'completed' });
    expect(result).toBeNull();
    const after = await creditService.getLoan('T-001', 'L-001');
    expect(after?.paidAmount).toBe(paidAmount);
  });

  it('DENY: refuse un montant négatif', async () => {
    const result = await creditService.createRepayment('T-001', { loanId: 'L-001', paymentDate: '2026-09-01', principalPart: -10_000, interestPart: 0, status: 'completed' });
    expect(result).toBeNull();
  });

  it('ALLOW: un remboursement qui solde exactement le prêt fait passer le statut à "repaid"', async () => {
    const loan = await creditService.createLoan({ tenantId: 'T-001', memberId: 'M-001', borrower: 'Test Borrower', principal: 100_000, loanMode: 'SIMPLE', interestRate: 0, interestPeriod: 'MONTHLY', interestAmount: 0, totalRepayable: 100_000, maturityDate: '2027-01-01', monthlyPayment: 100_000, nextPaymentDate: '2026-10-01', applicationId: 'AP-TEST', tenantName: 'Coopérative Sutura' });
    expect(loan.status).toBe('active');
    // Date du paiement ≥ décaissement (aujourd'hui) : avant le décaissement la dette vaut 0 et tout paiement est refusé.
    const payDay = loan.disbursementDate;
    const result = await creditService.createRepayment('T-001', { loanId: loan.id, paymentDate: payDay, principalPart: 100_000, interestPart: 0, status: 'completed' });
    expect(result).not.toBeNull();
    const after = await creditService.getLoan('T-001', loan.id);
    expect(after?.outstanding).toBe(0);
    expect(after?.status).toBe('repaid');
    // Toute nouvelle tentative de remboursement sur un prêt déjà soldé dépasserait la dette (0).
    const overpay = await creditService.createRepayment('T-001', { loanId: loan.id, paymentDate: payDay, principalPart: 1, interestPart: 0, status: 'completed' });
    expect(overpay).toBeNull();
  });
});

describe('creditService — submitLoanApplication (mandat Finance/Tontines, création réelle d’une demande)', () => {
  it('ALLOW: une demande conforme crée un Application ET une WorkflowRequest (WD-001) liés', async () => {
    const result = await creditService.submitLoanApplication('T-002', { memberId: 'M-007', requestedAmount: 100_000, purpose: 'Test', guarantors: [{ guarantorName: 'Aïssatou Bâ', guaranteedAmount: 100_000, relation: 'Membre' }] }, 'Khadija Mbaye', 'U-TEST'); // LR-002 : 1 garant (80 %) requis
    expect(result).not.toBeUndefined();
    expect(result?.application.stage).toBe('stageSubmitted');
    expect(result?.request.domain).toBe('credit');
    expect(result?.request.entityType).toBe('application');
    expect(result?.request.entityId).toBe(result?.application.id);
    expect(result?.request.status).toBe('pending');
  });

  it('DENY: montant hors des bornes de la politique — aucune Application ni WorkflowRequest créée', async () => {
    const before = await creditService.listApplications('T-002');
    const result = await creditService.submitLoanApplication('T-002', { memberId: 'M-007', requestedAmount: 1, purpose: 'Test' }, 'Khadija Mbaye');
    expect(result).toBeUndefined();
    const after = await creditService.listApplications('T-002');
    expect(after.length).toBe(before.length);
  });

  it('DENY: maxActiveLoans déjà atteint (L-002 actif, politique T-002 limitée à 1)', async () => {
    const result = await creditService.submitLoanApplication('T-002', { memberId: 'M-002', requestedAmount: 100_000, purpose: 'Test' }, 'Mamadou Sow');
    expect(result).toBeUndefined();
  });

  it('DENY: compte d’un autre tenant', async () => {
    const result = await creditService.submitLoanApplication('T-002', { memberId: 'M-002', requestedAmount: 100_000, purpose: 'Test' }, 'Mamadou Sow');
    expect(result).toBeUndefined();
  });

  it('DENY: tenant sans règle de crédit vivante → aucune demande possible, quelle que soit la caisse', async () => {
    const rule = loanRules.find((item) => item.id === 'LR-001')!;
    rule.deletedAt = '2026-09-26T00:00:00.000Z';
    try {
      const result = await creditService.submitLoanApplication('T-001', { memberId: 'M-001', requestedAmount: 100_000, purpose: 'Test' }, 'Fatou Ndiaye');
      expect(result).toBeUndefined();
    } finally { rule.deletedAt = null; }
  });

  it('ALLOW: règle unique du tenant — aucune caisse choisie : la caisse de décaissement prioritaire est TOUJOURS Épargne (AC-009, SAVINGS)', async () => {
    const result = await creditService.submitLoanApplication('T-001', { memberId: 'M-001', requestedAmount: 100_000, purpose: 'Test caisse quelconque', guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: 100_000, relation: 'Membre' }] }, 'Fatou Ndiaye');
    expect(result?.application.cashboxId).toBe('AC-009');
  });
});

describe('creditService — cycle de vie complet demande → approbation → décaissement', () => {
  it('applyLoanApplicationDecision fait progresser Application.stage avec l’UNIQUE étape de WD-001 (niveau de la règle), disburseLoan crée un Loan réel et lie la Transaction', async () => {
    const submitted = await creditService.submitLoanApplication('T-002', { memberId: 'M-007', requestedAmount: 200_000, purpose: 'Cycle complet', guarantors: [{ guarantorName: 'Aïssatou Bâ', guaranteedAmount: 200_000, relation: 'Membre tontine' }] }, 'Khadija Mbaye', 'U-TEST');
    expect(submitted).not.toBeUndefined();
    const requestId = submitted!.request.id;
    const applicationId = submitted!.application.id;

    // UNE étape, nommée et gardée selon le niveau d'approbation de la règle (LR-002 : Bureau).
    expect(submitted!.request.steps.map((step) => [step.name, step.approverPermission])).toEqual([['Approbation du bureau', 'loans.approve.board']]);
    const decided = await workflowService.submitAction('T-002', requestId, 'approve', 'Amadou Mbaye', undefined, 'U-001');
    expect(decided?.status).toBe('approved');
    creditService.applyLoanApplicationDecision('T-002', decided!);
    let application = await creditService.getApplication('T-002', applicationId);
    expect(application?.stage).toBe('stageApproved');

    // Décaissement.
    const transactionsBefore = transactions.length;
    const disbursed = await creditService.disburseLoan('T-002', applicationId);
    expect(disbursed).not.toBeUndefined();
    expect(disbursed?.loan.principal).toBe(200_000);
    expect(disbursed?.loan.status).toBe('active');
    expect(disbursed?.loan.totalRepayable).toBeGreaterThan(200_000); // LR-002 a un taux > 0
    expect(transactions.length).toBe(transactionsBefore + 1);
    const createdTransaction = transactions[transactions.length - 1];
    expect(createdTransaction.loanId).toBe(disbursed?.loan.id);
    expect(createdTransaction).toMatchObject({ category: 'AUTRES', subcategory: 'PRET', type: 'debit' });
    application = await creditService.getApplication('T-002', applicationId);
    expect(application?.stage).toBe('stageDisbursed');

    // Un second décaissement de la même demande est refusé (déjà décaissée).
    const secondAttempt = await creditService.disburseLoan('T-002', applicationId);
    expect(secondAttempt).toBeUndefined();
  });

  it('disburseLoan refuse une demande qui n’est pas encore approuvée', async () => {
    // AC-009/LR-004 (T-001) : maxActiveLoans 3, sans garant requis — évite toute
    // dépendance à l'état accumulé par les tests précédents sur M-007/AC-004.
    const submitted = await creditService.submitLoanApplication('T-001', { memberId: 'M-006', requestedAmount: 100_000, purpose: 'Pas encore approuvé', guarantors: [{ guarantorName: 'Fatou Ndiaye', guaranteedAmount: 100_000, relation: 'Membre' }] }, 'Cheikh Diop');
    expect(submitted).not.toBeUndefined();
    const result = await creditService.disburseLoan('T-001', submitted!.application.id);
    expect(result).toBeUndefined();
  });
});

describe('creditService — createLoanTransaction (chemin direct du formulaire de transaction, atomique)', () => {
  const buildPretInput = (amount: number): TransactionInput => ({
    cashboxNumber: 'CS-001-CX-004',
    memberId: 'M-001',
    memberName: 'Fatou Ndiaye',
    category: 'AUTRES', subcategory: 'PRET',
    type: 'debit',
    amount,
    description: 'Prêt test service',
  });

  it('ALLOW: crée Transaction + Application(stageDisbursed) + Loan + Guarantor, liés entre eux', async () => {
    const result = await creditService.createLoanTransaction('T-001', {
      memberId: 'M-001',
      principal: 300_000,
      guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: 300_000, relation: 'Ami' }],
      approved: true,
      approvedBy: 'Amadou Mbaye',
      transactionInput: buildPretInput(300_000),
    });
    expect(result).not.toBeUndefined();
    expect(result?.application.stage).toBe('stageDisbursed');
    expect(result?.loan.principal).toBe(300_000);
    expect(result?.transaction?.loanId).toBe(result?.loan.id);
    const loanGuarantors = await creditService.listGuarantorsByLoan('T-001', result!.loan.id);
    expect(loanGuarantors.some((g) => g.guarantorName === 'Cheikh Diop')).toBe(true);
  });

  it('DENY: montant hors politique — AUCUNE transaction créée (atomicité)', async () => {
    const before = transactions.length;
    const result = await creditService.createLoanTransaction('T-001', {
      memberId: 'M-001',
      principal: 1_000, // < minAmount 50 000
      guarantors: [],
      approved: true,
      transactionInput: buildPretInput(1_000),
    });
    expect(result).toBeUndefined();
    expect(transactions.length).toBe(before);
  });

  it('DENY: garant insuffisant alors que la politique l’exige — aucune transaction créée', async () => {
    loanRules.find((rule) => rule.id === 'LR-001')!.requiresGuarantor = true; // LR-001 est OFF dans les données DEMO : ce test porte sur une règle qui EXIGE un garant.
    const before = transactions.length;
    const result = await creditService.createLoanTransaction('T-001', {
      memberId: 'M-001',
      principal: 300_000,
      guarantors: [],
      approved: true,
      transactionInput: buildPretInput(300_000),
    });
    expect(result).toBeUndefined();
    expect(transactions.length).toBe(before);
  });

  it('DENY: approbation requise mais non cochée — aucune transaction créée', async () => {
    const before = transactions.length;
    const result = await creditService.createLoanTransaction('T-001', {
      memberId: 'M-001',
      principal: 300_000,
      guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: 300_000, relation: 'Ami' }],
      approved: false,
      transactionInput: buildPretInput(300_000),
    });
    expect(result).toBeUndefined();
    expect(transactions.length).toBe(before);
  });
});

describe('creditService — createRepaymentTransaction (chemin direct, atomique)', () => {
  it('ALLOW: crée Transaction + Repayment, met à jour le prêt, lie transaction.loanId', async () => {
    const before = await creditService.getLoan('T-001', 'L-001');
    const beforePaid = before?.paidAmount ?? 0;
    const result = await creditService.createRepaymentTransaction('T-001', {
      loanId: 'L-001',
      paymentDate: '2026-09-20',
      principalPart: 50_000,
      interestPart: 5_000,
      transactionInput: { cashboxNumber: 'CS-001-CX-004', memberId: 'M-001', memberName: 'Fatou Ndiaye', category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit', amount: 55_000, description: 'Remboursement test service' },
    });
    expect(result).not.toBeUndefined();
    expect(result?.transaction?.loanId).toBe('L-001');
    const after = await creditService.getLoan('T-001', 'L-001');
    expect(after?.paidAmount).toBe(beforePaid + 55_000);
  });

  it('DENY: dépassement du solde dû — aucune transaction créée (atomicité)', async () => {
    const before = transactions.length;
    const loan = await creditService.getLoan('T-001', 'L-004');
    const remaining = (loan?.totalRepayable ?? 0) - (loan?.paidAmount ?? 0);
    const result = await creditService.createRepaymentTransaction('T-001', {
      loanId: 'L-004',
      paymentDate: '2026-09-20',
      principalPart: remaining + 500_000,
      interestPart: 0,
      transactionInput: { cashboxNumber: 'CS-001-CX-004', memberId: 'M-006', memberName: 'Cheikh Diop', category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit', amount: remaining + 500_000, description: 'Remboursement excessif' },
    });
    expect(result).toBeUndefined();
    expect(transactions.length).toBe(before);
  });
});
