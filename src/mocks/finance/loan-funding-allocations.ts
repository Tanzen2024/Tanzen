/**
 * FINANCEMENT MULTI-CAISSES D'UN PRÊT (mandat du 2026-09-26) — un prêt reste UN SEUL `Loan` ;
 * chaque allocation dit quelle caisse a financé quelle part de son capital. Invariant :
 * Σ allocations d'un prêt = `Loan.principal` (garanti par `creditService`). Chaque allocation
 * produit exactement UNE transaction de décaissement (DÉBIT, AUTRES / PRÊT) sur sa caisse
 * (`transactionId`) : chaque caisse ne supporte que sa part.
 *
 * Les prêts antérieurs à ce mandat (seed L-001…) n'ont aucune allocation : leur décaissement
 * historique reste porté par leur transaction, sans réécriture.
 *
 * Ces allocations servent aussi de base au partage des remboursements (prorata, décision
 * du 2026-09-26) et, plus tard, à l'attribution des revenus du prêt à chaque caisse.
 */
export type LoanFundingAllocation = {
  id: string;
  tenantId: string;
  loanId: string;
  cashboxId: string;
  /** Part du capital du prêt financée par cette caisse (> 0). */
  amount: number;
  /** Transaction de décaissement produite par cette allocation. */
  transactionId: string;
  createdAt: string;
};

export const loanFundingAllocations: LoanFundingAllocation[] = [];
