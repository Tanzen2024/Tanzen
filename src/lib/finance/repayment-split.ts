import type { Loan } from '@/mocks/finance/loans';

/**
 * RÉPARTITION CAPITAL / INTÉRÊTS D'UN REMBOURSEMENT — règle métier validée
 * explicitement (mandat « Séparation Caisses / Crédit », 2026-09-25) : chaque
 * versement est imputé AU PRORATA de la composition du prêt, soit
 *   intérêts = arrondi(montant × interestAmount / totalRepayable)
 *   capital  = montant − intérêts.
 * Seul point de calcul du projet (appelé par `creditService.createRepaymentTransaction`) ;
 * aucun écran ne recalcule cette répartition. La dette restante n'en dépend pas
 * (`applyRepaymentToLoan` : `outstanding = totalRepayable − paidAmount`).
 */
export type RepaymentSplit = { principalPart: number; interestPart: number };

export function splitRepaymentProRata(loan: Pick<Loan, 'interestAmount' | 'totalRepayable'>, amount: number): RepaymentSplit {
  if (!Number.isFinite(amount) || amount <= 0 || !(loan.totalRepayable > 0)) return { principalPart: Math.max(0, amount || 0), interestPart: 0 };
  const interestPart = Math.min(amount, Math.round((amount * loan.interestAmount) / loan.totalRepayable));
  return { principalPart: amount - interestPart, interestPart };
}
