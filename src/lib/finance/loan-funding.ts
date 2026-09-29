/**
 * FINANCEMENT MULTI-CAISSES D'UN PRÊT — calcul PUR, partagé par le service (qui fait foi)
 * et par les formulaires (qui l'affichent). Aucune lecture de mock, aucune écriture.
 *
 * Règles (mandat du 2026-09-26 ; caisse prioritaire = Épargne depuis le 2026-09-27) :
 *   1. La caisse PRIORITAIRE — toujours la caisse système Épargne (`SAVINGS`, `savingsCashboxOf`),
 *      jamais choisie par l'utilisateur — finance en premier, autant que possible :
 *      `min(capital, disponible Épargne)`. Les champs `current*` du plan désignent cette caisse.
 *   2. Le reliquat n'est couvert QUE par des caisses complémentaires choisies par
 *      l'utilisateur, chacune dans la limite de son disponible, sans doublon ni retour
 *      vers Épargne. AUCUNE restriction par caisse : toute caisse ACTIVE peut compléter
 *      (le sens débit / crédit dépend de l'opération, jamais de la caisse).
 *   3. Σ allocations ne dépasse JAMAIS le capital ; le prêt n'est finançable que si
 *      Σ allocations = capital (jamais de prêt partiellement financé).
 *
 * « Disponible » = solde de la caisse tel que le calcule déjà le projet (`resolveCashbox`,
 * aucune notion de fonds réservés n'existe) — fourni par l'appelant, jamais recalculé ici.
 */

import type { Cashbox } from '@/mocks/finance/cashboxes';

export type FundingAllocationInput = { cashboxId: string; amount: number };

export type FundingIssue =
  | 'invalidAmount'
  | 'complementIsCurrent'
  | 'duplicateComplement'
  | 'complementExceedsAvailable'
  | 'exceedsPrincipal'
  | 'shortfall';

export type LoanFundingPlan = {
  principal: number;
  currentCashboxId: string;
  /** Disponible de la caisse courante (jamais négatif). */
  currentAvailable: number;
  /** Part automatiquement prise sur la caisse courante. */
  currentAmount: number;
  /** Reste à financer après la caisse courante (0 = caisse courante suffisante). */
  remainingAfterCurrent: number;
  /** Allocations retenues (caisse courante d'abord, puis compléments), montants > 0 uniquement. */
  allocations: FundingAllocationInput[];
  /** Σ allocations. */
  allocatedTotal: number;
  /** Reste à financer après les compléments (≥ 0). */
  remaining: number;
  issues: FundingIssue[];
  /** Financement intégral et cohérent : le prêt peut être créé. */
  isComplete: boolean;
};

/**
 * @param availableByCashbox disponible de CHAQUE caisse (courante et candidates) ; une caisse
 *        absente est considérée à 0.
 */
export function planLoanFunding(principal: number, currentCashboxId: string, complements: FundingAllocationInput[], availableByCashbox: Record<string, number>): LoanFundingPlan {
  const available = (cashboxId: string) => Math.max(0, availableByCashbox[cashboxId] ?? 0);
  const issues = new Set<FundingIssue>();
  const validPrincipal = Number.isFinite(principal) && principal > 0;
  const currentAvailable = available(currentCashboxId);
  const currentAmount = validPrincipal ? Math.min(principal, currentAvailable) : 0;
  const remainingAfterCurrent = validPrincipal ? principal - currentAmount : 0;

  const allocations: FundingAllocationInput[] = currentAmount > 0 ? [{ cashboxId: currentCashboxId, amount: currentAmount }] : [];
  const seen = new Set<string>();
  let complementTotal = 0;
  for (const complement of complements) {
    if (!Number.isFinite(complement.amount) || complement.amount < 0) { issues.add('invalidAmount'); continue; }
    if (complement.amount === 0) continue;
    if (complement.cashboxId === currentCashboxId) { issues.add('complementIsCurrent'); continue; }
    if (seen.has(complement.cashboxId)) { issues.add('duplicateComplement'); continue; }
    seen.add(complement.cashboxId);
    if (complement.amount > available(complement.cashboxId)) issues.add('complementExceedsAvailable');
    complementTotal += complement.amount;
    allocations.push({ cashboxId: complement.cashboxId, amount: complement.amount });
  }
  if (!validPrincipal) issues.add('invalidAmount');
  if (complementTotal > remainingAfterCurrent) issues.add('exceedsPrincipal');
  const allocatedTotal = currentAmount + complementTotal;
  const remaining = Math.max(0, (validPrincipal ? principal : 0) - allocatedTotal);
  if (validPrincipal && remaining > 0) issues.add('shortfall');
  return { principal, currentCashboxId, currentAvailable, currentAmount, remainingAfterCurrent, allocations, allocatedTotal, remaining, issues: [...issues], isComplete: validPrincipal && issues.size === 0 && allocatedTotal === principal };
}

/**
 * Montant qui MANQUE ENCORE même en mobilisant tout le disponible des autres caisses
 * (message « Financement insuffisant… il manque encore X ») — 0 si le reliquat peut être couvert.
 */
export function unfundableAmount(remainingAfterCurrent: number, otherAvailable: number[]): number {
  const total = otherAvailable.reduce((sum, value) => sum + Math.max(0, value), 0);
  return Math.max(0, remainingAfterCurrent - total);
}

/**
 * Partage d'un montant (un remboursement) entre les caisses de financement AU PRORATA de
 * leur allocation (décision du 2026-09-26). Montants entiers (FCFA) ; les unités
 * d'arrondi restantes vont aux plus grands restes, de sorte que Σ parts = montant exact.
 * Ex. 11 000 sur (110 000 ; 40 000) → (8 067 ; 2 933).
 */
export function splitByAllocations(amount: number, allocations: FundingAllocationInput[]): FundingAllocationInput[] {
  const total = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (total <= 0 || amount <= 0) return [];
  const raw = allocations.map((allocation) => (amount * allocation.amount) / total);
  const shares = raw.map(Math.floor);
  let leftover = amount - shares.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (leftover <= 0) break;
    shares[index] += 1;
    leftover -= 1;
  }
  return allocations.map((allocation, index) => ({ cashboxId: allocation.cashboxId, amount: shares[index] })).filter((share) => share.amount > 0);
}

/** Caisse Épargne du tenant — identifiée par son code système `SAVINGS`, jamais par son libellé. */
export function savingsCashboxOf<C extends Pick<Cashbox, 'systemCode'>>(cashboxes: C[]): C | undefined {
  return cashboxes.find((cashbox) => cashbox.systemCode === 'SAVINGS');
}

/**
 * Disponible de chaque caisse ACTIVE = son solde (`Cashbox.balance`, calculé par `resolveCashbox`).
 * Une caisse inactive (Épargne comprise) en est absente : disponible 0, jamais débitée.
 */
export function fundingAvailabilityOf(cashboxes: Cashbox[]): Record<string, number> {
  return Object.fromEntries(cashboxes.filter((cashbox) => cashbox.status === 'active').map((cashbox) => [cashbox.id, cashbox.balance]));
}

/** Montants saisis pour les caisses complémentaires cochées → entrée du plan de financement. */
export function complementsFrom(values: Record<string, string>): FundingAllocationInput[] {
  return Object.entries(values).map(([cashboxId, amount]) => ({ cashboxId, amount: Number(amount) || 0 }));
}
