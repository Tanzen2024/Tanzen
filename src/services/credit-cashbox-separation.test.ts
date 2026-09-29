import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { creditService } from './credit.service';
import { financeService, type TransactionInput } from './finance.service';
import { transactions } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { applications } from '@/mocks/finance/applications';
import { repayments } from '@/mocks/finance/repayments';
import { guarantors } from '@/mocks/finance/guarantors';
import { auditEvents } from '@/mocks/audit/audit-events';
import { loanRules } from '@/mocks/finance/loan-rules';
import { computeLoanTerms, loanDebtAt, splitRepaymentProRata } from '@/lib/finance';

// Workflow d'approbation des prêts (2026-09-27) : un prêt n'est enregistré DIRECTEMENT que si la règle n'exige
// pas d'approbation (sinon il passe par `submitLoanApplication`) — ces tests portent sur ce chemin direct.
const RULES_SEED = structuredClone(loanRules);
beforeEach(() => { loanRules.splice(0, loanRules.length, ...structuredClone(RULES_SEED)); loanRules.find((rule) => rule.id === 'LR-001')!.requiresApproval = false; });
afterEach(() => { loanRules.splice(0, loanRules.length, ...structuredClone(RULES_SEED)); });

/**
 * SÉPARATION CAISSES / CRÉDIT (mandat 2026-09-25) :
 *   - le PRÊT et le REMBOURSEMENT sont des objets du métier Crédit, sans caisse ;
 *   - le DÉCAISSEMENT et l'ENCAISSEMENT sont des transactions, rattachées à une caisse
 *     et qui RÉFÉRENCENT le prêt / le remboursement qui les a produites.
 * Seed T-001 : Transport AC-012 (CS-001-CX-004), Épargne AC-009 (CS-001-CX-001, caisse système SAVINGS : finance
 * TOUJOURS les prêts en premier, mandat du 2026-09-27) ;
 * Fatou Ndiaye (M-001) doit 523 600 sur L-001 (interestAmount 102 000 / totalRepayable 952 000).
 */
const stores = { transactions, loans, applications, repayments, guarantors, auditEvents, loanFundingAllocations } as const;
let snapshot: Record<keyof typeof stores, unknown[]>;
beforeEach(() => { snapshot = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as typeof snapshot; });
afterEach(() => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(snapshot[name as keyof typeof stores])); });

const balanceOf = async (cashboxId: string) => (await financeService.getCashbox('T-001', cashboxId))!.balance;
const globalBalance = async () => (await financeService.listCashboxes('T-001')).reduce((sum, cashbox) => sum + cashbox.balance, 0);
const loanTx = (over: Partial<TransactionInput> = {}): TransactionInput => ({ cashboxNumber: 'CS-001-CX-004', memberId: 'M-016', memberName: 'Modou Faye', category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount: 400_000, description: '', ...over });
const loanInput = (over: Partial<Parameters<typeof creditService.createLoanTransaction>[1]> = {}) => ({
  cashboxId: 'AC-012', memberId: 'M-016', principal: 400_000, approved: true, approvedBy: 'Amadou Mbaye',
  guarantors: [{ guarantorName: 'Fatou Ndiaye', guaranteedAmount: 400_000, relation: '' }], transactionInput: loanTx(), ...over,
});
const repaymentTx = (amount: number, cashboxNumber = 'CS-001-CX-004'): TransactionInput => ({ cashboxNumber, memberId: 'M-001', memberName: 'Fatou Ndiaye', category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit', amount, description: '' });

describe('PRÊT — objet du métier Crédit, sans caisse', () => {
  it('le prêt créé ne porte aucune caisse ; la règle et les intérêts sont ceux de la règle de crédit (calcul inchangé)', async () => {
    const result = (await creditService.createLoanTransaction('T-001', loanInput()))!;
    const rule = loanRules.find((item) => item.id === 'LR-001')!;
    expect(Object.keys(result.loan)).not.toEqual(expect.arrayContaining(['cashboxId']));
    expect(Object.keys(result.loan).some((key) => /cashbox|account|caisse/i.test(key))).toBe(false);
    const terms = computeLoanTerms(400_000, rule, result.transaction.date);
    expect(result.loan).toMatchObject({ memberId: 'M-016', principal: 400_000, interestRate: rule.interestRate, interestAmount: terms.interestAmount, totalRepayable: terms.totalRepayable, outstanding: terms.totalRepayable, status: 'active' });
    // Garanties et approbation inchangées : garant enregistré sur le prêt, demande au stade décaissé.
    expect(guarantors.at(-1)).toMatchObject({ loanId: result.loan.id, guarantorName: 'Fatou Ndiaye', guaranteedAmount: 400_000 });
    expect(result.application).toMatchObject({ stage: 'stageDisbursed', cashboxId: 'AC-009' });
  });

  it('règles inchangées : approbation, garanties, exposition, prêts actifs refusent toujours', async () => {
    loanRules.find((rule) => rule.id === 'LR-001')!.requiresGuarantor = true; // LR-001 est OFF dans les données DEMO : ce test porte sur une règle qui EXIGE un garant.
    for (const over of [{ guarantors: [] }, { memberId: 'M-006', principal: 1_400_000, transactionInput: loanTx({ memberId: 'M-006', memberName: 'Cheikh Diop', amount: 1_400_000 }), guarantors: [{ guarantorName: 'Fatou Ndiaye', guaranteedAmount: 1_400_000, relation: '' }] }]) {
      expect(await creditService.createLoanTransaction('T-001', loanInput(over))).toBeUndefined();
    }
  });

  it('approbation requise : aucun prêt direct, même avec une attestation « approuvé » — le prêt passe par le workflow', async () => {
    loanRules.find((rule) => rule.id === 'LR-001')!.requiresApproval = true;
    expect(await creditService.createLoanTransaction('T-001', loanInput({ approved: true }))).toBeUndefined();
  });

  it('cohérence du décaissement : toujours un DÉBIT (sinon rien n’est créé), et toujours depuis Épargne — la caisse saisie par l’appelant est ignorée', async () => {
    const counts = { loans: loans.length, transactions: transactions.length };
    expect(await creditService.createLoanTransaction('T-001', loanInput({ transactionInput: loanTx({ type: 'credit' }) }))).toBeUndefined();
    expect({ loans: loans.length, transactions: transactions.length }).toEqual(counts);
    const result = (await creditService.createLoanTransaction('T-001', loanInput({ transactionInput: loanTx({ cashboxNumber: 'CS-001-CX-003' }) })))!;
    expect(result.transactions.map((tx) => tx.source)).toEqual(['CS-001-CX-001']);
  });

  it('classification du décaissement imposée par le service : seule AUTRES / PRET est acceptée', async () => {
    const counts = { loans: loans.length, transactions: transactions.length };
    expect(await creditService.createLoanTransaction('T-001', loanInput({ transactionInput: loanTx({ subcategory: 'FRAIS' }) }))).toBeUndefined();
    expect(await creditService.createLoanTransaction('T-001', loanInput({ transactionInput: loanTx({ subcategory: 'REMBOURSEMENT' }) }))).toBeUndefined();
    expect({ loans: loans.length, transactions: transactions.length }).toEqual(counts);
  });
});

describe('DÉCAISSEMENT — transaction de débit rattachée à la caisse', () => {
  it('débit du montant du prêt, sur la caisse de décaissement, référençant le prêt ; le prêt peut lister ses mouvements', async () => {
    const before = { epargne: await balanceOf('AC-009'), global: await globalBalance() };
    const { loan, transaction } = (await creditService.createLoanTransaction('T-001', loanInput()))!;
    expect(transaction).toMatchObject({ type: 'debit', category: 'AUTRES', subcategory: 'PRET', amount: 400_000, source: 'CS-001-CX-001', destination: 'Modou Faye', loanId: loan.id });
    expect(transaction.repaymentId).toBeUndefined();
    expect((await financeService.listTransactionsByLoan('T-001', loan.id)).map((tx) => tx.id)).toEqual([transaction.id]);
    // La caisse baisse du PRINCIPAL décaissé — jamais de la dette (principal + intérêts) : le prêt n'est pas assimilé au solde.
    expect(await balanceOf('AC-009')).toBe(before.epargne - 400_000);
    expect(await globalBalance()).toBe(before.global - 400_000);
    expect(loan.totalRepayable).toBeGreaterThan(400_000);
  });
});

describe('REMBOURSEMENT — objet du métier Crédit ; ENCAISSEMENT — transaction de crédit', () => {
  it('montant seul : le métier Crédit répartit capital / intérêts au prorata, réduit la dette, et l’encaissement référence remboursement + prêt', async () => {
    const loan = loans.find((item) => item.id === 'L-001')!;
    const { paidAmount } = loan;
    // Règles de référence (2026-09-28) : la dette réduite est la DETTE COURANTE à la date du paiement.
    const debtBefore = loanDebtAt(loan, repayments.filter((item) => item.loanId === 'L-001'), '2026-09-15');
    const before = await balanceOf('AC-012');
    const result = (await creditService.createRepaymentTransaction('T-001', { loanId: 'L-001', paymentDate: '2026-09-15', amount: 100_000, transactionInput: repaymentTx(100_000) }))!;
    const expected = splitRepaymentProRata(loan, 100_000);
    expect(expected).toEqual({ principalPart: 89_286, interestPart: 10_714 }); // 100 000 × 102 000 / 952 000 = 10 714
    expect(result.repayment).toMatchObject({ loanId: 'L-001', amount: 100_000, ...expected, status: 'completed' });
    expect(Object.keys(result.repayment).some((key) => /cashbox|account|caisse/i.test(key))).toBe(false);
    expect(loan.paidAmount).toBe(paidAmount + 100_000);
    expect(loan.outstanding).toBe(debtBefore - 100_000);
    expect(result.transaction).toMatchObject({ type: 'credit', category: 'AUTRES', subcategory: 'REMBOURSEMENT', amount: 100_000, destination: 'CS-001-CX-004', loanId: 'L-001', repaymentId: result.repayment.id });
    // Lien réciproque : le remboursement référence SA transaction d'encaissement (Loan → Repayment → transactionId).
    expect(result.repayment.transactionId).toBe(result.transaction.id);
    expect(await balanceOf('AC-012')).toBe(before + 100_000);
  });

  it('classification de l’encaissement imposée par le service : seule AUTRES / REMBOURSEMENT est acceptée', async () => {
    const counts = { repayments: repayments.length, transactions: transactions.length };
    for (const subcategory of ['FRAIS', 'PRET'] as const) {
      const transactionInput = { ...repaymentTx(100_000), subcategory };
      expect(await creditService.createRepaymentTransaction('T-001', { loanId: 'L-001', paymentDate: '2026-09-15', amount: 100_000, transactionInput })).toBeUndefined();
    }
    expect({ repayments: repayments.length, transactions: transactions.length }).toEqual(counts);
  });

  it('le remboursement est indépendant de la caisse du décaissement : encaissement possible dans une autre caisse (Épargne)', async () => {
    const before = { transport: await balanceOf('AC-012'), epargne: await balanceOf('AC-009'), global: await globalBalance() };
    const result = await creditService.createRepaymentTransaction('T-001', { loanId: 'L-001', paymentDate: '2026-09-15', amount: 50_000, transactionInput: repaymentTx(50_000, 'CS-001-CX-001') });
    expect(result?.transaction).toMatchObject({ destination: 'CS-001-CX-001', loanId: 'L-001' });
    expect(await balanceOf('AC-009')).toBe(before.epargne + 50_000);
    expect(await balanceOf('AC-012')).toBe(before.transport);
    expect(await globalBalance()).toBe(before.global + 50_000);
  });

  it('encaissement incohérent (sens débit, ou montant ≠ remboursement) : refusé, dette intacte', async () => {
    const loan = loans.find((item) => item.id === 'L-001')!;
    const before = structuredClone(loan);
    expect(await creditService.createRepaymentTransaction('T-001', { loanId: 'L-001', paymentDate: '2026-09-15', amount: 50_000, transactionInput: { ...repaymentTx(50_000), type: 'debit' } })).toBeUndefined();
    expect(await creditService.createRepaymentTransaction('T-001', { loanId: 'L-001', paymentDate: '2026-09-15', amount: 50_000, transactionInput: repaymentTx(60_000) })).toBeUndefined();
    expect(loan).toEqual(before);
  });

  it('compatibilité : une répartition explicite (principalPart / interestPart) reste acceptée telle quelle', async () => {
    const result = await creditService.createRepaymentTransaction('T-001', { loanId: 'L-001', paymentDate: '2026-09-15', principalPart: 90_000, interestPart: 10_000, transactionInput: repaymentTx(100_000) });
    expect(result?.repayment).toMatchObject({ principalPart: 90_000, interestPart: 10_000, amount: 100_000 });
  });
});

describe('SOLDES — individuel et global indépendants', () => {
  it('solde global = Σ des soldes individuels ; un mouvement de crédit ne touche que SA caisse', async () => {
    const cashboxes = await financeService.listCashboxes('T-001');
    expect(await globalBalance()).toBe(cashboxes.reduce((sum, cashbox) => sum + cashbox.balance, 0));
    const others = cashboxes.filter((cashbox) => cashbox.id !== 'AC-009').map((cashbox) => [cashbox.id, cashbox.balance] as const);
    await creditService.createLoanTransaction('T-001', loanInput());
    for (const [id, balance] of others) expect(await balanceOf(id)).toBe(balance);
  });
});

describe('HISTORIQUE — liens conservés et complétés', () => {
  it('les mouvements de crédit historiques référencent leur prêt (transaction → caisse → prêt)', async () => {
    const byId = (id: string) => transactions.find((tx) => tx.id === id)!;
    expect(byId('TR-002')).toMatchObject({ loanId: 'L-001', source: 'CS-001-CX-001', type: 'debit' });
    expect(byId('TR-004')).toMatchObject({ loanId: 'L-004', destination: 'CS-001-CX-001', type: 'credit' });
    expect(byId('TR-011')).toMatchObject({ loanId: 'L-003' });
    expect(byId('TR-013')).toMatchObject({ loanId: 'L-002' });
    expect((await financeService.listTransactionsByLoan('T-001', 'L-001')).map((tx) => tx.id)).toContain('TR-002');
  });

  it('remboursement → prêt conservé ; lecture des mouvements d’un prêt cloisonnée par tenant', async () => {
    expect(repayments.find((repayment) => repayment.id === 'RP-001')?.loanId).toBe('L-001');
    expect(await financeService.listTransactionsByLoan('T-002', 'L-001')).toEqual([]);
  });
});

/**
 * ARCHITECTURE (mandat « Prêts / remboursements indépendants des caisses », 2026-09-25) :
 * Caisse ← Transaction → Prêt. Le seed historique est migré sans perte (seule la
 * classification change : PRET / REMBOURSEMENT deviennent des sous-catégories d'AUTRES).
 */
describe('ARCHITECTURE — Caisse ← Transaction → Prêt', () => {
  it('un Loan existe indépendamment de toute caisse (aucun champ caisse, même sans transaction de décaissement)', () => {
    for (const loan of loans) expect(Object.keys(loan).some((key) => /cashbox|account|caisse/i.test(key))).toBe(false);
    // L-004 (Cheikh Diop) n'a aucune transaction de décaissement dans le seed : le prêt existe quand même.
    expect(loans.find((loan) => loan.id === 'L-004')).toBeDefined();
    expect(transactions.some((tx) => tx.loanId === 'L-004' && tx.subcategory === 'PRET')).toBe(false);
  });

  it('seed migré : chaque décaissement est AUTRES / PRET en DÉBIT depuis une caisse, chaque encaissement AUTRES / REMBOURSEMENT en CRÉDIT vers une caisse', () => {
    const loanMovements = transactions.filter((tx) => tx.loanId);
    expect(loanMovements.length).toBeGreaterThan(0);
    for (const tx of loanMovements) {
      expect(tx.category).toBe('AUTRES');
      if (tx.subcategory === 'PRET') expect(tx).toMatchObject({ type: 'debit', source: expect.stringMatching(/-/) });
      else expect(tx).toMatchObject({ subcategory: 'REMBOURSEMENT', type: 'credit', destination: expect.stringMatching(/-/) });
    }
    expect(transactions.some((tx) => (tx.category as string) === 'PRET' || (tx.category as string) === 'REMBOURSEMENT')).toBe(false);
  });

  it('la caisse est celle du MOUVEMENT : un prêt financé par Épargne est remboursé à Épargne (prorata de son financement), et ne se rattache à aucune caisse', async () => {
    const { loan, transaction: disbursement } = (await creditService.createLoanTransaction('T-001', loanInput()))!;
    const repaymentInput = { ...repaymentTx(50_000, 'CS-001-CX-004'), memberId: 'M-016', memberName: 'Modou Faye' };
    // Paiement daté du décaissement (aujourd'hui) : avant, la dette vaut 0 et tout remboursement est refusé.
    const { transaction: collection } = (await creditService.createRepaymentTransaction('T-001', { loanId: loan.id, paymentDate: loan.disbursementDate, amount: 50_000, transactionInput: repaymentInput }))!;
    expect(disbursement).toMatchObject({ loanId: loan.id, source: 'CS-001-CX-001', type: 'debit' });
    // Financement multi-caisses (2026-09-26) : l'encaissement revient aux caisses qui ont financé le prêt, au prorata — ici 100 % Épargne, quelle que soit la caisse d'encaissement saisie.
    expect(collection).toMatchObject({ loanId: loan.id, destination: 'CS-001-CX-001', type: 'credit', amount: 50_000 });
    expect(Object.keys(loan).some((key) => /cashbox|account|caisse/i.test(key))).toBe(false);
  });
});
