import { transactions, type Transaction } from '@/mocks/finance/transactions';
import { loans } from '@/mocks/finance/loans';
import { applications } from '@/mocks/finance/applications';
import { repayments } from '@/mocks/finance/repayments';
import { guarantors } from '@/mocks/finance/guarantors';
import { auditEvents } from '@/mocks/audit/audit-events';
import { loanFundingAllocations } from '@/mocks/finance/loan-funding-allocations';
import { insertTransaction, type TransactionInput } from './finance.service';
import { creditService, type CreateLoanTransactionInput, type CreateRepaymentTransactionInput, type SubmitLoanApplicationInput } from './credit.service';
import { workflowRequests, type WorkflowRequest } from '@/mocks/operations/workflow-requests';

/**
 * Une ligne d'un lot de SAISIE RAPIDE (mandat « Saisie rapide des
 * transactions », 2026-09-25). Chaque genre est routé vers EXACTEMENT le même
 * chemin métier que la saisie détaillée (`TransactionCreate`) :
 *   - `transaction` → `insertTransaction` (logique pure de `financeService.createTransaction`) ;
 *   - `loan` → `creditService.createLoanTransaction` (politique, Loan, intérêts, garants, approbation) ;
 *   - `repayment` → `creditService.createRepaymentTransaction` (dette, Repayment, solde du prêt).
 * Aucune règle financière n'est réécrite ici.
 */
export type TransactionBatchLine =
  | { kind: 'transaction'; input: TransactionInput }
  | { kind: 'loan'; input: CreateLoanTransactionInput }
  | { kind: 'repayment'; input: CreateRepaymentTransactionInput }
  /** Prêt dont la règle exige une approbation : soumis au workflow (`creditService.submitLoanApplication`), aucun décaissement avant la décision. */
  | { kind: 'loanApplication'; input: SubmitLoanApplicationInput; requestedBy: string; requestedByUserId?: string };

export type TransactionBatchResult =
  | { ok: true; transactions: Transaction[]; submittedRequests: WorkflowRequest[] }
  /** `failedIndex` = index (dans `lines`) de la première ligne refusée par le métier ; -1 = lot vide. */
  | { ok: false; failedIndex: number };

/**
 * Point de reprise du stockage mock : tout ce que les trois chemins ci-dessus
 * peuvent écrire. Les tableaux ne font que croître (`push`) → on mémorise leur
 * longueur ; seul un `Loan` EXISTANT est muté en place (remboursement) → on en
 * garde une copie profonde. Sans vraie transaction DB, c'est ce qui garantit
 * le « tout ou rien » d'un lot.
 */
function takeCheckpoint() {
  const appendOnly: unknown[][] = [transactions, applications, loans, repayments, guarantors, auditEvents, loanFundingAllocations, workflowRequests];
  const lengths = appendOnly.map((list) => list.length);
  const loanSnapshots = loans.map((loan) => [loan, structuredClone(loan)] as const);
  return function rollback() {
    appendOnly.forEach((list, index) => { list.splice(lengths[index]); });
    for (const [loan, snapshot] of loanSnapshots) {
      for (const key of Object.keys(loan)) if (!(key in snapshot)) delete (loan as Record<string, unknown>)[key];
      Object.assign(loan, snapshot);
    }
  };
}

/**
 * Ce qu'écrit une ligne — un prêt financé par plusieurs caisses (ou son remboursement) produit une
 * transaction par caisse ; une demande de prêt soumise à approbation produit une demande de workflow
 * et AUCUNE transaction. `undefined` = ligne refusée.
 */
async function runLine(tenantId: string, line: TransactionBatchLine): Promise<{ transactions: Transaction[]; request?: WorkflowRequest } | undefined> {
  if (line.kind === 'loanApplication') {
    const submitted = await creditService.submitLoanApplication(tenantId, line.input, line.requestedBy, line.requestedByUserId);
    return submitted ? { transactions: [], request: submitted.request } : undefined;
  }
  const written = line.kind === 'loan'
    ? (await creditService.createLoanTransaction(tenantId, line.input))?.transactions
    : line.kind === 'repayment'
      ? (await creditService.createRepaymentTransaction(tenantId, line.input))?.transactions
      : (() => { const transaction = insertTransaction(tenantId, line.input); return transaction ? [transaction] : undefined; })();
  return written && written.length > 0 ? { transactions: written } : undefined;
}

export const transactionBatchService = {
  /**
   * Enregistre un lot TOUT OU RIEN : les lignes sont appliquées dans l'ordre,
   * chacune par son chemin métier habituel (les règles cumulatives — plafond de
   * prêts actifs, solde dû d'un prêt remboursé deux fois dans le lot — sont
   * donc appliquées exactement comme en saisie successive). Au premier refus
   * (ou exception), tout ce que le lot a déjà écrit est annulé et l'index
   * fautif est retourné : jamais « 70 sur 100 » enregistrées en silence.
   * Limite assumée du stockage mock : une écriture concurrente faite PENDANT le
   * lot serait elle aussi annulée — un vrai backend exposera un endpoint de lot
   * transactionnel derrière cette même signature.
   */
  createTransactionsBatch: async (tenantId: string, lines: TransactionBatchLine[]): Promise<TransactionBatchResult> => {
    if (lines.length === 0) return { ok: false, failedIndex: -1 };
    const rollback = takeCheckpoint();
    const created: Transaction[] = [];
    const submittedRequests: WorkflowRequest[] = [];
    for (const [index, line] of lines.entries()) {
      let written: Awaited<ReturnType<typeof runLine>>;
      try {
        written = await runLine(tenantId, line);
      } catch {
        written = undefined;
      }
      if (!written) {
        rollback();
        return { ok: false, failedIndex: index };
      }
      created.push(...written.transactions);
      if (written.request) submittedRequests.push(written.request);
    }
    return { ok: true, transactions: created, submittedRequests };
  },
};
