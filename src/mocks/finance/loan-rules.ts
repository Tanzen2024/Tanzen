/**
 * Modèle canonique : dictionnaire de données, fiche #14 `loan_rules`
 * (docs/audit/excel_dictionary_dump.txt). Terminologie verrouillée par
 * docs/LOAN_RULES_NORMALIZATION_REPORT.md — `loan_rules`/`LoanRule`
 * uniquement, `LoanPolicy` abandonné.
 *
 * Champs volontairement exclus (cohérent avec les autres entités de ce
 * dossier — aucune n'expose ces colonnes techniques) : `uuid`, `sync_status`,
 * `version`, `created_at`/`updated_at`, `created_by`/`updated_by`.
 */
/**
 * MODE DE PRÊT (mandat « Modes de prêt », 2026-09-25, validé par Hugues) — pilote SEUL le calcul
 * des intérêts (`computeLoanTerms`) et remplace à la fois l'ancien `loan_mode` du dictionnaire
 * (NONE/INTERNAL/EXTERNAL/BOTH, « qui peut emprunter », sans aucun effet dans le code) et l'ancien
 * « type d'intérêt » (FIXED/REDUCING/FLAT) :
 *   - SIMPLE   : intérêt calculé sur le montant INITIAL du prêt, à chaque période ;
 *   - COMPOUND : « Composé » — intérêt calculé sur le montant NET de la dette (solde restant) ;
 *   - GLOBAL   : intérêt calculé UNE SEULE FOIS sur la période définie.
 * Écart assumé avec docs/audit/excel_dictionary_dump.txt (fiche #14, `loan_mode`).
 */
export type LoanRuleLoanMode = 'SIMPLE' | 'COMPOUND' | 'GLOBAL';
/** Ordre d'affichage IMPOSÉ partout : Simple, Composé, Global. */
export const LOAN_MODES = ['SIMPLE', 'COMPOUND', 'GLOBAL'] as const satisfies readonly LoanRuleLoanMode[];
/**
 * Périodicité HISTORIQUE du taux (compatibilité des données uniquement). RÈGLE DÉFINITIVE du 2026-09-29 :
 * les intérêts sont TOUJOURS mensuels (`INTEREST_PERIOD`, src/lib/finance/interest-distribution.ts), quelle
 * que soit la fréquence des réunions, séances ou tontines ; cette valeur n'est plus choisie ni lue par le calcul.
 */
export type LoanRuleInterestPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
/**
 * PÉNALITÉ DE RETARD (règle définitive du 2026-09-29) — distincte de l'intérêt, appliquée CHAQUE mois de
 * retard (échéance mensuelle postérieure à `maturityDate`, dette > 0) :
 *   - FIXED      : `penaltyValue` FCFA par mois de retard ;
 *   - PERCENTAGE : `penaltyValue` % de la dette À `maturityDate` (hors pénalités), base FIGÉE pour tout le retard.
 */
export type LoanPenaltyType = 'FIXED' | 'PERCENTAGE';
export const LOAN_PENALTY_TYPES = ['FIXED', 'PERCENTAGE'] as const satisfies readonly LoanPenaltyType[];
export type LoanRuleGuaranteeType = 'PERSONAL' | 'GROUP' | 'COLLATERAL';
export type LoanRuleApprovalLevel = 'MEMBER' | 'BOARD' | 'ADMIN';
/** D-CREDIT-LR-02 (validée) : status = état métier utilisable (ACTIVE/INACTIVE) — distinct de deletedAt (suppression logique). */
export type LoanRuleStatus = 'ACTIVE' | 'INACTIVE';

/**
 * RÈGLE DE CRÉDIT UNIQUE PAR TENANT (décision définitive du 2026-09-26) : une seule règle
 * vivante (`deletedAt === null`) par tenant, applicable à TOUS ses prêts — jamais liée à une
 * caisse (l'ancienne relation vers la caisse a été retirée : la caisse n'intervient qu'au
 * décaissement, sur la transaction) et jamais référencée par le prêt (règle du prêt = règle de
 * `Loan.tenantId`). Unicité garantie par `loanRuleService.createLoanRule`.
 */
export type LoanRule = {
  id: string;
  tenantId: string;
  name: string;
  allowLoans: boolean;
  loanMode: LoanRuleLoanMode;
  minAmount: number;
  maxAmount: number;
  interestRate: number;
  /** Compatibilité uniquement — valeur effective toujours `'MONTHLY'`, jamais lue par le calcul (voir `LoanRuleInterestPeriod`). */
  interestPeriod: LoanRuleInterestPeriod;
  durationMonths: number;
  /** Pénalité de retard (ON/OFF) — historisée sur chaque prêt à l'octroi. */
  penaltyEnabled: boolean;
  /** Obligatoire si `penaltyEnabled` ; `null` possible sinon. */
  penaltyType: LoanPenaltyType | null;
  /** FCFA (FIXED) ou % (PERCENTAGE) ; > 0 si `penaltyEnabled`, 0 possible sinon. */
  penaltyValue: number;
  maxActiveLoans: number;
  maxLoanExposure: number | null;
  requiresGuarantor: boolean;
  minGuarantors: number;
  maxGuarantors: number;
  guaranteeTypeRequired: LoanRuleGuaranteeType;
  guaranteeRatio: number;
  allowSelfGuarantee: boolean;
  requiresApproval: boolean;
  approvalLevel: LoanRuleApprovalLevel | null;
  status: LoanRuleStatus;
  /** Suppression logique (D-CREDIT-LR-02). RESTORE hors périmètre — aucune fonction ne remet ce champ à null. */
  deletedAt: string | null;
  /** Version de la règle (verrou optimiste de la double approbation) : +1 à chaque modification ACTIVÉE. */
  version: number;
};

export const loanRules: LoanRule[] = [
  {
    id: 'LR-001', tenantId: 'T-001', name: 'Politique Trésorerie Sutura',
    allowLoans: true, loanMode: 'COMPOUND', minAmount: 50_000, maxAmount: 2_000_000, interestRate: 12, interestPeriod: 'MONTHLY', durationMonths: 24, penaltyEnabled: false, penaltyType: null, penaltyValue: 0,
    // Données DEMO (2026-09-27) : « Garant requis » à OFF ; Garants min./max. volontairement conservés tels quels.
    maxActiveLoans: 2, maxLoanExposure: 3_000_000, requiresGuarantor: false, minGuarantors: 1, maxGuarantors: 2, guaranteeTypeRequired: 'PERSONAL', guaranteeRatio: 100, allowSelfGuarantee: false,
    requiresApproval: true, approvalLevel: 'ADMIN', status: 'ACTIVE', deletedAt: null, version: 1,
  },
  {
    id: 'LR-002', tenantId: 'T-002', name: 'Politique Trésorerie Horizon',
    allowLoans: true, loanMode: 'SIMPLE', minAmount: 30_000, maxAmount: 1_500_000, interestRate: 10, interestPeriod: 'MONTHLY', durationMonths: 18, penaltyEnabled: false, penaltyType: null, penaltyValue: 0,
    maxActiveLoans: 1, maxLoanExposure: 1_500_000, requiresGuarantor: true, minGuarantors: 1, maxGuarantors: 1, guaranteeTypeRequired: 'GROUP', guaranteeRatio: 80, allowSelfGuarantee: false,
    requiresApproval: true, approvalLevel: 'BOARD', status: 'ACTIVE', deletedAt: null, version: 1,
  },
  {
    id: 'LR-003', tenantId: 'T-001', name: 'Politique Épargne Sutura',
    allowLoans: false, loanMode: 'SIMPLE', minAmount: 0, maxAmount: 500_000, interestRate: 8, interestPeriod: 'YEARLY', durationMonths: 12, penaltyEnabled: false, penaltyType: null, penaltyValue: 0,
    maxActiveLoans: 1, maxLoanExposure: null, requiresGuarantor: false, minGuarantors: 0, maxGuarantors: 1, guaranteeTypeRequired: 'PERSONAL', guaranteeRatio: 100, allowSelfGuarantee: true,
    // Consolidation « règle unique » (2026-09-26) : T-001 garde LR-001 ; LR-003 (ex-caisse Épargne AC-002) et LR-004 (ex-caisse Epargne AC-009) sont supprimées LOGIQUEMENT — conservées pour l'historique, jamais appliquées.
    requiresApproval: false, approvalLevel: null, status: 'INACTIVE', deletedAt: '2026-09-26T00:00:00.000Z', version: 1,
  },
  {
    id: 'LR-004', tenantId: 'T-001', name: 'Politique Épargne volontaire Sutura',
    allowLoans: true, loanMode: 'SIMPLE', minAmount: 20_000, maxAmount: 1_000_000, interestRate: 9, interestPeriod: 'MONTHLY', durationMonths: 12, penaltyEnabled: false, penaltyType: null, penaltyValue: 0,
    maxActiveLoans: 3, maxLoanExposure: 2_000_000, requiresGuarantor: false, minGuarantors: 0, maxGuarantors: 2, guaranteeTypeRequired: 'PERSONAL', guaranteeRatio: 100, allowSelfGuarantee: true,
    requiresApproval: false, approvalLevel: null, status: 'INACTIVE', deletedAt: '2026-09-26T00:00:00.000Z', version: 1,
  },
];

/** LA règle de crédit du tenant (la seule vivante), `undefined` si aucune n'est encore configurée. Fonction pure. */
export function tenantCreditRule(tenantId: string): LoanRule | undefined {
  return loanRules.find((rule) => rule.tenantId === tenantId && rule.deletedAt === null);
}
