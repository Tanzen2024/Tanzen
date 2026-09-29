import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { creditService, collectionTransactionOf, disbursementTransactionOf, sessionOfTransaction } from './credit.service';
import { fiscalSessionService } from './fiscal-session.service';
import { workflowService } from './workflow.service';
import { transactions } from '@/mocks/finance/transactions';
import { loanRules } from '@/mocks/finance/loan-rules';
import { fiscalSessions } from '@/mocks/settings/fiscal-sessions';
import { applications } from '@/mocks/finance/applications';
import { loans } from '@/mocks/finance/loans';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { repayments } from '@/mocks/finance/repayments';
import { guarantors } from '@/mocks/finance/guarantors';
import type { TransactionInput } from './finance.service';

// Workflow d'approbation des prêts (2026-09-27) : un prêt n'est enregistré DIRECTEMENT que si la règle n'exige
// pas d'approbation (sinon il passe par `submitLoanApplication`) — ces tests portent sur ce chemin direct.
const RULES_SEED = structuredClone(loanRules);
beforeEach(() => { loanRules.splice(0, loanRules.length, ...structuredClone(RULES_SEED)); loanRules.find((rule) => rule.id === 'LR-001')!.requiresApproval = false; });
afterEach(() => { loanRules.splice(0, loanRules.length, ...structuredClone(RULES_SEED)); });

/**
 * Mandat « Gestion des séances » — décision 3 : la séance d'un prêt / d'un
 * remboursement n'est JAMAIS stockée sur `Loan` / `Repayment` ; elle se lit
 * toujours via la transaction (`Transaction.sessionId`, source de vérité unique).
 */
// Chaque cas repart des données seed (séances ET crédit) : un prêt décaissé par un cas ne doit jamais compter dans les « prêts actifs » du suivant.
const stores = { fiscalSessions, transactions, applications, loans, repayments, guarantors, loanFundingAllocations } as const;
const SEED = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as Record<keyof typeof stores, unknown[]>;
const restoreSeed = () => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(SEED[name as keyof typeof stores])); };
beforeEach(restoreSeed);
afterEach(restoreSeed);

/** Séance de l'exercice 2026 de T-001 — strictement après le seed FS-001 (14/07/2026). */
const createSession2026 = async (date = '2026-09-01') => (await fiscalSessionService.createSession('T-001', 'FY-T001-2026', date))!;

const pretInput = (amount: number, sessionId?: string): TransactionInput => ({ cashboxNumber: 'CS-001-CX-004', memberId: 'M-001', memberName: 'Fatou Ndiaye', category: 'AUTRES', subcategory: 'PRET', type: 'debit', amount, description: 'Prêt test séance', ...(sessionId ? { sessionId } : {}) });


/** Approuve la demande de workflow d'un dossier (approbateur U-001, distinct du demandeur) — seul chemin menant à un décaissement. */
async function approveThroughWorkflow(tenantId: string, requestId: string) {
  const approved = (await workflowService.submitAction(tenantId, requestId, 'approve', 'Amadou Mbaye', undefined, 'U-001'))!;
  creditService.applyLoanApplicationDecision(tenantId, approved);
}

describe('Prêt × séance — via la transaction de décaissement', () => {
  it('le prêt garde sa caisse via le décaissement, et sa séance se lit via Transaction.sessionId — aucun Loan.sessionId', async () => {
    const session = await createSession2026();
    const result = await creditService.createLoanTransaction('T-001', { memberId: 'M-001', principal: 300_000, guarantors: [{ guarantorName: 'Cheikh Diop', guaranteedAmount: 300_000, relation: 'Ami' }], approved: true, approvedBy: 'Amadou Mbaye', transactionInput: pretInput(300_000, session.id) });
    expect(result).toBeTruthy();
    const disbursement = disbursementTransactionOf(result!.loan)!;
    expect(disbursement.id).toBe(result!.transaction.id);
    expect(disbursement.source).toBe('CS-001-CX-001'); // le mouvement financier est rattaché à la caisse (Épargne, prioritaire), jamais le prêt
    expect(disbursement.sessionId).toBe(session.id);
    expect(sessionOfTransaction(disbursement)?.sessionNumber).toBe(session.sessionNumber);
    expect((await creditService.getLoanSession('T-001', result!.loan.id))?.id).toBe(session.id);
    expect(result!.loan).not.toHaveProperty('sessionId');
    expect(await creditService.getLoanSession('T-002', result!.loan.id)).toBeNull(); // isolation tenant
  });

  it('disburseLoan accepte une séance de l’exercice courant et la pose sur la seule transaction de décaissement', async () => {
    const session = await createSession2026();
    const submitted = await creditService.submitLoanApplication('T-001', { memberId: 'M-006', requestedAmount: 100_000, purpose: 'Décaissement en séance', guarantors: [{ guarantorName: 'Fatou Ndiaye', guaranteedAmount: 100_000, relation: 'Membre' }] } /* règle unique LR-001 : 1 garant couvrant 100 % */, 'Cheikh Diop');
    await approveThroughWorkflow('T-001', submitted!.request.id); // l'approbation elle-même est testée dans loan-approval-workflow.test.ts
    const disbursed = await creditService.disburseLoan('T-001', submitted!.application.id, session.id);
    expect(disbursed).toBeTruthy();
    expect(disbursementTransactionOf(disbursed!.loan)?.sessionId).toBe(session.id);
    expect((await creditService.getLoanSession('T-001', disbursed!.loan.id))?.id).toBe(session.id);
    expect(disbursed!.loan).not.toHaveProperty('sessionId');
  });

  it('disburseLoan refuse une séance d’un AUTRE exercice, d’un AUTRE tenant ou inexistante — mêmes contrôles que les transactions, rien n’est créé', async () => {
    const otherYear = (await fiscalSessionService.createSession('T-001', 'FY-T001-2027', '2027-02-01'))!;
    const otherTenant = (await fiscalSessionService.createSession('T-002', 'FY-T002-2026', '2026-09-01'))!;
    for (const sessionId of [otherYear.id, otherTenant.id, 'FS-DOES-NOT-EXIST']) {
      const submitted = await creditService.submitLoanApplication('T-001', { memberId: 'M-006', requestedAmount: 100_000, purpose: 'Séance invalide', guarantors: [{ guarantorName: 'Fatou Ndiaye', guaranteedAmount: 100_000, relation: 'Membre' }] } /* dossier conforme : seul le refus de séance est testé */, 'Cheikh Diop');
      await approveThroughWorkflow('T-001', submitted!.request.id);
      const application = applications.find((item) => item.id === submitted!.application.id)!;
      const before = transactions.length;
      expect(await creditService.disburseLoan('T-001', application.id, sessionId)).toBeUndefined();
      expect(transactions.length).toBe(before);
      expect(application.stage).toBe('stageApproved'); // n'avance pas
    }
  });

  it('un prêt sans décaissement rattaché à une séance n’a pas de séance (champ optionnel)', async () => {
    // L-004 (seed) : aucune transaction de décaissement ; L-001 est décaissé en séance FS-001 (TR-002).
    expect(await creditService.getLoanSession('T-001', 'L-004')).toBeNull();
    expect((await creditService.getLoanSession('T-001', 'L-001'))?.id).toBe('FS-001');
  });
});

describe('Remboursement × séance — via la transaction d’encaissement', () => {
  it('remboursement lié au prêt, encaissé sur une caisse, séance lue via la transaction (Transaction.repaymentId) — aucun Repayment.sessionId', async () => {
    const session = await createSession2026('2026-09-02');
    const result = await creditService.createRepaymentTransaction('T-001', {
      loanId: 'L-001', paymentDate: '2026-09-20', principalPart: 10_000, interestPart: 1_000,
      transactionInput: { cashboxNumber: 'CS-001-CX-004', memberId: 'M-001', memberName: 'Fatou Ndiaye', category: 'AUTRES', subcategory: 'REMBOURSEMENT', type: 'credit', amount: 11_000, description: 'Remboursement en séance', sessionId: session.id },
    });
    expect(result).toBeTruthy();
    expect(result!.repayment.loanId).toBe('L-001');
    const collection = collectionTransactionOf(result!.repayment)!;
    expect(collection.id).toBe(result!.transaction.id);
    expect(collection.repaymentId).toBe(result!.repayment.id);
    expect(collection.loanId).toBe('L-001');
    expect(collection.destination).toBe('CS-001-CX-004'); // encaissement rattaché à la caisse
    expect((await creditService.getRepaymentSession('T-001', result!.repayment.id))?.id).toBe(session.id);
    expect(result!.repayment).not.toHaveProperty('sessionId');
    // Mandat 2026-09-25 (Loan → Repayment → transactionId) : lien réciproque de Transaction.repaymentId.
    expect(result!.repayment.transactionId).toBe(result!.transaction.id);
    // Le remboursement ne déplace jamais la séance du prêt : L-001 reste rattaché à FS-001 (son décaissement).
    expect((await creditService.getLoanSession('T-001', 'L-001'))?.id).toBe('FS-001');
  });
});
