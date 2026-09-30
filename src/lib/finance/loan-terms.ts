import type { LoanRule } from '@/mocks/finance/loan-rules';
import { addMonths } from './interest-distribution';

/**
 * Calcul des conditions d'un prêt à partir de la politique de la caisse
 * (`LoanRule`) — fonction pure, aucune lecture de mock, aucune mutation.
 *
 * Convention adoptée (documentée ici faute de formule déjà sourcée dans le
 * projet avant ce mandat) :
 *   - `durationMonths` est TOUJOURS exprimée en mois (champ `LoanRule.durationMonths`,
 *     déjà ainsi dans tout le modèle existant).
 *   - Le taux est TOUJOURS mensuel (règle définitive du 2026-09-29, `INTEREST_PERIOD`) : la durée en mois
 *     est directement le nombre de périodes ; `LoanRule.interestPeriod` n'est plus lu.
 *   - Le calcul est piloté par le MODE DE PRÊT (`LoanRule.loanMode`) :
 *   - SIMPLE : intérêt sur le capital INITIAL, à chaque période, jamais
 *     recalculé sur un solde restant — `interestAmount = principal × (taux/100) × durationMonths`.
 *   - COMPOUND (« Composé ») : intérêt sur le montant NET de la dette — formule
 *     d'amortissement standard à mensualité constante, `r` = taux mensuel (taux/100) :
 *       mensualité = principal × r / (1 − (1 + r)⁻ⁿ), n = durée en périodes.
 *     Cas particulier `r = 0` : mensualité = principal / n (aucun intérêt).
 *   - GLOBAL : intérêt calculé UNE SEULE FOIS sur la période définie —
 *     `interestAmount = principal × (taux/100)`, quelle que soit la durée, déterminé à l'origine
 *     (RÈGLES DE RÉFÉRENCE du 2026-09-28 : 100 000 à 25 % → 125 000 à rembourser ; aucun intérêt
 *     périodique ensuite) : `totalRepayable = principal + interestAmount`.
 *   - Tous les montants sont arrondis à l'entier le plus proche (FCFA, pas de
 *     sous-unité utilisée ailleurs dans les mocks existants).
 */

export type LoanTerms = {
  interestAmount: number;
  totalRepayable: number;
  monthlyPayment: number;
  /** `disbursementDate + durationMonths` (mois calendaires). */
  maturityDate: string;
  /** `disbursementDate` + une période (mois), première échéance. */
  nextPaymentDate: string;
};

/**
 * `principal` doit déjà avoir été validé positif et dans les bornes de la
 * règle par l'appelant (`isStrictlyPositiveNumber`, `minAmount`/`maxAmount`) —
 * cette fonction ne revalide rien, elle calcule seulement.
 */
export function computeLoanTerms(
  principal: number,
  rule: Pick<LoanRule, 'interestRate' | 'loanMode' | 'durationMonths'>,
  disbursementDate: string,
): LoanTerms {
  const n = Math.max(rule.durationMonths, 1);
  let interestAmount: number;
  let monthlyPayment: number;

  if (rule.loanMode === 'COMPOUND') {
    const r = rule.interestRate / 100; // taux mensuel (INTEREST_PERIOD)
    if (r === 0) {
      monthlyPayment = principal / n;
    } else {
      monthlyPayment = (principal * r) / (1 - Math.pow(1 + r, -n));
    }
    const totalRepayableRaw = monthlyPayment * n;
    interestAmount = totalRepayableRaw - principal;
  } else if (rule.loanMode === 'GLOBAL') {
    // GLOBAL — intérêt calculé une seule fois sur la période définie.
    interestAmount = principal * (rule.interestRate / 100);
    monthlyPayment = (principal + interestAmount) / n;
  } else {
    // SIMPLE — intérêt sur le capital initial, chaque mois.
    interestAmount = principal * (rule.interestRate / 100) * n;
    monthlyPayment = (principal + interestAmount) / n;
  }

  const roundedInterest = Math.round(interestAmount);
  const totalRepayable = principal + roundedInterest;
  const roundedMonthlyPayment = Math.round(totalRepayable / n);

  return {
    interestAmount: roundedInterest,
    totalRepayable,
    monthlyPayment: roundedMonthlyPayment,
    maturityDate: addMonths(disbursementDate, n),
    nextPaymentDate: addMonths(disbursementDate, 1),
  };
}
