/**
 * Financial Position Engine — fonctions PURES de calcul de position financière.
 *
 *   balanceAsOf(scope, ctx, asOfDate)   → solde à l'instant T (stock cumulatif)
 *   flows(scope, ctx, from, to)         → flux sur une période (mouvements)
 *   computeFiscalYearClosing(ctx, fy)   → clôture d'exercice (étape 6, par caisse)
 *   recomputeClosingEntry(ctx, fy, id)  → recalcul explicite d'une clôture
 *   computeCarryForward(ctx, from, to)  → report à nouveau (étape 6, par caisse)
 *   verifyCarryForwardIntegrity(...)    → détecte closing(N) ≠ opening(N+1)
 *   memberFinancialPosition(scope, ...) → position d'un membre (étape 7 — savings/credit/distributions)
 *   memberFinancialPositions(...)       → version batch
 *
 * Le contexte `ctx` est toujours fourni DÉJÀ filtré par tenant. Ces fonctions ne
 * lisent aucun singleton — c'est `finance-position.service.ts` qui les branche
 * sur les mocks (et qui persiste les `OpeningEntry`/`ClosingEntry` calculés ici,
 * ces fonctions restant pures).
 */
export type {
  FinancialScope,
  FinanceCtx,
  BalanceLine,
  BalanceResult,
  FlowAccountLine,
  FlowResult,
  BaselineResolution,
  ClosingComputation,
  CloseFiscalYearOutcome,
  RecomputeClosingOutcome,
  OpeningComputation,
  CarryForwardOutcome,
  IntegrityMismatch,
  MemberAccountLine,
  MemberCreditSummary,
  MemberFinancialPosition,
} from './types';
export { scopeKey, accountsOfAsOf, accountsOfDuring, type Perimeter } from './scope';
export { balanceAsOf, resolveBaseline } from './balance';
export { flows } from './flows';
export { referenceDate } from './reference-date';
export { computeFiscalYearClosing, recomputeClosingEntry } from './closing';
export { computeCarryForward, verifyCarryForwardIntegrity } from './carry-forward';
export { memberFinancialPosition, memberFinancialPositions } from './member-position';
export { computeLoanTerms, type LoanTerms } from './loan-terms';
