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
  FlowCashboxLine,
  FlowResult,
  BaselineResolution,
  ClosingComputation,
  CloseFiscalYearOutcome,
  RecomputeClosingOutcome,
  OpeningComputation,
  CarryForwardOutcome,
  IntegrityMismatch,
  MemberCashboxLine,
  MemberCreditSummary,
  MemberFinancialPosition,
} from './types';
export { scopeKey, cashboxesOfAsOf, cashboxesOfDuring, type Perimeter } from './scope';
export { balanceAsOf, resolveBaseline } from './balance';
export { flows } from './flows';
export { referenceDate } from './reference-date';
export { computeFiscalYearClosing, recomputeClosingEntry } from './closing';
export { computeCarryForward, verifyCarryForwardIntegrity } from './carry-forward';
export { memberFinancialPosition, memberFinancialPositions } from './member-position';
export { memberBalanceSheets, summarizeBalanceSheets, defaultBalancePeriod, memberPeriodStatements, summarizePeriodStatements, type MemberPeriodStatement, type PeriodSummary, type PeriodPosition, type PeriodMovements, type PeriodParams, loanInterestAccruals, type BalanceSheetCtx, type BalanceSheetParams, type MemberBalanceSheet, type MemberLoanLine, type BalanceMonthLine, type BalanceSheetSummary, type InterestAccrual, type StatementLine, type MemberInterestLine, periodBuckets } from './member-balance-sheet';
export { distributeInterest, loanFundingShares, loanDebtAt, roundMoney, allocateInteger, cashboxPortion, type GainLine, type InterestSource, type InterestDistribution, type TontinePurchaseGroup, type UndistributedInterest } from './interest-distribution';
export { computeLoanTerms, type LoanTerms } from './loan-terms';
export { cashboxesFiscalYearSummary, cashboxesSessionSummary, isCashboxInFiscalYear, type CashboxFiscalYearLine } from './fiscal-year-summary';
export { guaranteeCoverage, loanPolicyViolations } from './loan-policy';
export type { GuaranteeCoverage, LoanPolicyInput, LoanPolicyGuarantor, LoanPolicyViolation } from './loan-policy';
export { splitRepaymentProRata, type RepaymentSplit } from './repayment-split';
export { planLoanFunding, unfundableAmount, splitByAllocations, fundingAvailabilityOf, savingsCashboxOf, complementsFrom, type LoanFundingPlan, type FundingAllocationInput, type FundingIssue } from './loan-funding';
export { LOAN_APPROVAL_PERMISSION, loanApprovalStep, loanApprovalSteps } from './loan-approval';
