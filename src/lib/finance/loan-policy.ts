import type { LoanRule } from '@/mocks/finance/loan-rules';

/**
 * CONFORMITÉ D'UN PRÊT À SA RÈGLE DE CRÉDIT — fonction PURE, source unique des
 * conditions d'octroi (mandat « Règles de crédit = source de vérité », 2026-09-25).
 * Appelée par `creditService.createLoanTransaction` (qui REFUSE tout prêt non
 * conforme) et par les formulaires (saisie détaillée, saisie rapide) pour
 * afficher la raison — aucune de ces couches ne réécrit une règle.
 *
 * Règles lues sur `LoanRule` :
 *   - montant ∈ [minAmount, maxAmount] ;
 *   - prêts actifs de l'emprunteur < maxActiveLoans ;
 *   - EXPOSITION : encours actuel de l'emprunteur (Σ `outstanding` de ses prêts
 *     actifs) + nouveau principal ≤ maxLoanExposure (si renseigné) ;
 *   - si `requiresGuarantor` : garants valides (nom + montant > 0) entre
 *     minGuarantors et maxGuarantors, et Σ montants garantis ≥ guaranteeRatio %
 *     du principal ; auto-caution interdite (`allowSelfGuarantee = false`) :
 *     l'emprunteur ne figure jamais parmi ses garants. Garant non requis →
 *     AUCUNE exigence de garantie (ni nombre, ni ratio, ni auto-caution) ;
 *   - si `requiresApproval` : approbation attestée.
 * `guaranteeTypeRequired` reste informatif : aucune donnée de garantie ne porte
 * de type à contrôler.
 */
export type LoanPolicyGuarantor = { name: string; amount: number };

export type LoanPolicyInput = {
  principal: number;
  borrowerName: string;
  /** Prêts actifs de l'emprunteur AVANT ce prêt. */
  activeLoanCount: number;
  /** Encours (Σ `outstanding`) de ses prêts actifs AVANT ce prêt. */
  activeOutstanding: number;
  guarantors: LoanPolicyGuarantor[];
  approved: boolean;
};

export type LoanPolicyViolation =
  | { code: 'AMOUNT_OUT_OF_RANGE'; min: number; max: number }
  | { code: 'MAX_ACTIVE_LOANS'; max: number }
  | { code: 'MAX_EXPOSURE'; max: number; current: number }
  | { code: 'MIN_GUARANTORS'; min: number }
  | { code: 'MAX_GUARANTORS'; max: number }
  | { code: 'GUARANTEE_RATIO'; ratio: number; required: number }
  | { code: 'SELF_GUARANTEE' }
  | { code: 'APPROVAL_REQUIRED' };

const normalizeName = (name: string) => name.trim().toLowerCase();
/** Un garant ne compte que s'il est complet : nom renseigné ET montant garanti > 0. */
const completeGuarantors = (guarantors: LoanPolicyGuarantor[]) => guarantors.filter((guarantor) => guarantor.name.trim() && guarantor.amount > 0);

export type GuaranteeCoverage = { ratio: number; required: number; covered: number; missing: number; guarantorCount: number };

/**
 * COUVERTURE DE GARANTIE — seule définition du projet (utilisée par `loanPolicyViolations`
 * et affichée telle quelle par la saisie rapide) : couverture requise = ⌈principal × ratio / 100⌉,
 * couverture actuelle = Σ montants garantis des garants complets. Le modèle ne porte aucune
 * « capacité » propre à un garant : la couverture est la seule notion à contrôler.
 */
export function guaranteeCoverage(rule: Pick<LoanRule, 'guaranteeRatio'>, principal: number, guarantors: LoanPolicyGuarantor[]): GuaranteeCoverage {
  const complete = completeGuarantors(guarantors);
  const required = Math.ceil(((Number.isFinite(principal) ? principal : 0) * rule.guaranteeRatio) / 100);
  const covered = complete.reduce((sum, guarantor) => sum + guarantor.amount, 0);
  return { ratio: rule.guaranteeRatio, required, covered, missing: Math.max(0, required - covered), guarantorCount: complete.length };
}

export function loanPolicyViolations(rule: LoanRule, input: LoanPolicyInput): LoanPolicyViolation[] {
  const violations: LoanPolicyViolation[] = [];
  const { principal } = input;
  if (!Number.isFinite(principal) || principal < rule.minAmount || principal > rule.maxAmount) violations.push({ code: 'AMOUNT_OUT_OF_RANGE', min: rule.minAmount, max: rule.maxAmount });
  if (input.activeLoanCount >= rule.maxActiveLoans) violations.push({ code: 'MAX_ACTIVE_LOANS', max: rule.maxActiveLoans });
  if (rule.maxLoanExposure !== null && input.activeOutstanding + principal > rule.maxLoanExposure) violations.push({ code: 'MAX_EXPOSURE', max: rule.maxLoanExposure, current: input.activeOutstanding });

  const valid = completeGuarantors(input.guarantors);
  if (rule.requiresGuarantor) {
    if (valid.length < rule.minGuarantors) violations.push({ code: 'MIN_GUARANTORS', min: rule.minGuarantors });
    if (valid.length > rule.maxGuarantors) violations.push({ code: 'MAX_GUARANTORS', max: rule.maxGuarantors });
    const coverage = guaranteeCoverage(rule, principal, input.guarantors);
    if (valid.length >= rule.minGuarantors && coverage.missing > 0) violations.push({ code: 'GUARANTEE_RATIO', ratio: rule.guaranteeRatio, required: coverage.required });
    if (!rule.allowSelfGuarantee && input.borrowerName.trim() && valid.some((guarantor) => normalizeName(guarantor.name) === normalizeName(input.borrowerName))) violations.push({ code: 'SELF_GUARANTEE' });
  }
  if (rule.requiresApproval && !input.approved) violations.push({ code: 'APPROVAL_REQUIRED' });
  return violations;
}
