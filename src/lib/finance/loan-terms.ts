import type { LoanRule } from '@/mocks/finance/loan-rules';

/**
 * Calcul des conditions d'un prêt à partir de la politique de la caisse
 * (`LoanRule`) — fonction pure, aucune lecture de mock, aucune mutation.
 *
 * Convention adoptée (documentée ici faute de formule déjà sourcée dans le
 * projet avant ce mandat) :
 *   - `durationMonths` est TOUJOURS exprimée en mois (champ `LoanRule.durationMonths`,
 *     déjà ainsi dans tout le modèle existant).
 *   - `periodsInDuration` convertit cette durée dans l'unité de `interestPeriod`
 *     (MONTHLY → durationMonths tel quel ; YEARLY → /12 ; WEEKLY → ×4.345 ;
 *     DAILY → ×30, mois normalisé à 30 jours, cohérent avec l'absence de
 *     calendrier réel dans les autres modules financiers du projet).
 *   - FIXED et FLAT : intérêt simple sur le capital initial, jamais recalculé
 *     sur un solde restant — `interestAmount = principal × (taux/100) ×
 *     periodsInDuration`. Les deux types sont mathématiquement identiques dans
 *     ce modèle (« taux fixe » = « taux à plat » = pas de dégressivité) ; le
 *     projet ne distingue les deux qu'à l'affichage, aucune règle sourcée ne
 *     les différencie autrement.
 *   - REDUCING (dégressif/amortissable) : formule d'amortissement standard à
 *     mensualité constante, `r` = taux périodique (taux/100, déjà exprimé
 *     « par periode » par `LoanRule.interestPeriod`) :
 *       mensualité = principal × r / (1 − (1 + r)⁻ⁿ), n = durée en périodes.
 *     Cas particulier `r = 0` : mensualité = principal / n (aucun intérêt).
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

function periodsInDuration(durationMonths: number, period: LoanRule['interestPeriod']): number {
  switch (period) {
    case 'YEARLY':
      return durationMonths / 12;
    case 'WEEKLY':
      return durationMonths * 4.345;
    case 'DAILY':
      return durationMonths * 30;
    case 'MONTHLY':
    default:
      return durationMonths;
  }
}

function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/**
 * `principal` doit déjà avoir été validé positif et dans les bornes de la
 * règle par l'appelant (`isStrictlyPositiveNumber`, `minAmount`/`maxAmount`) —
 * cette fonction ne revalide rien, elle calcule seulement.
 */
export function computeLoanTerms(
  principal: number,
  rule: Pick<LoanRule, 'interestRate' | 'interestType' | 'interestPeriod' | 'durationMonths'>,
  disbursementDate: string,
): LoanTerms {
  const n = Math.max(rule.durationMonths, 1);
  let interestAmount: number;
  let monthlyPayment: number;

  if (rule.interestType === 'REDUCING') {
    const periods = periodsInDuration(n, rule.interestPeriod);
    const r = rule.interestRate / 100 / (n / Math.max(periods, 1)); // taux ramené « par mois » pour une mensualité constante
    if (r === 0) {
      monthlyPayment = principal / n;
    } else {
      monthlyPayment = (principal * r) / (1 - Math.pow(1 + r, -n));
    }
    const totalRepayableRaw = monthlyPayment * n;
    interestAmount = totalRepayableRaw - principal;
  } else {
    // FIXED / FLAT — intérêt simple sur le capital initial.
    const periods = periodsInDuration(n, rule.interestPeriod);
    interestAmount = principal * (rule.interestRate / 100) * periods;
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
