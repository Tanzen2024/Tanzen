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
export type LoanRuleLoanMode = 'NONE' | 'INTERNAL' | 'EXTERNAL' | 'BOTH';
export type LoanRuleInterestType = 'FIXED' | 'REDUCING' | 'FLAT';
export type LoanRuleInterestPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type LoanRuleGuaranteeType = 'PERSONAL' | 'GROUP' | 'COLLATERAL';
export type LoanRuleApprovalLevel = 'MEMBER' | 'BOARD' | 'ADMIN';
/** D-CREDIT-LR-02 (validée) : status = état métier utilisable (ACTIVE/INACTIVE) — distinct de deletedAt (suppression logique). */
export type LoanRuleStatus = 'ACTIVE' | 'INACTIVE';

export type LoanRule = {
  id: string;
  tenantId: string;
  /** Relation canonique : loan_rules.account_id -> accounts.id. Jamais Loan -> loan_rules (aucune FK directe confirmée). */
  accountId: string;
  /** Dénormalisé pour l'affichage, même convention que Loan.tenantName / Guarantor.borrowerName. */
  accountNumber: string;
  name: string;
  allowLoans: boolean;
  loanMode: LoanRuleLoanMode;
  minAmount: number;
  maxAmount: number;
  interestRate: number;
  interestType: LoanRuleInterestType;
  interestPeriod: LoanRuleInterestPeriod;
  durationMonths: number;
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
};

export const loanRules: LoanRule[] = [
  {
    id: 'LR-001', tenantId: 'T-001', accountId: 'AC-001', accountNumber: 'CS-001-TRÉS', name: 'Politique Trésorerie Sutura',
    allowLoans: true, loanMode: 'INTERNAL', minAmount: 50_000, maxAmount: 2_000_000, interestRate: 12, interestType: 'REDUCING', interestPeriod: 'MONTHLY', durationMonths: 24,
    maxActiveLoans: 2, maxLoanExposure: 3_000_000, requiresGuarantor: true, minGuarantors: 1, maxGuarantors: 2, guaranteeTypeRequired: 'PERSONAL', guaranteeRatio: 100, allowSelfGuarantee: false,
    requiresApproval: true, approvalLevel: 'ADMIN', status: 'ACTIVE', deletedAt: null,
  },
  {
    id: 'LR-002', tenantId: 'T-002', accountId: 'AC-004', accountNumber: 'TH-002-TRÉS', name: 'Politique Trésorerie Horizon',
    allowLoans: true, loanMode: 'BOTH', minAmount: 30_000, maxAmount: 1_500_000, interestRate: 10, interestType: 'FLAT', interestPeriod: 'MONTHLY', durationMonths: 18,
    maxActiveLoans: 1, maxLoanExposure: 1_500_000, requiresGuarantor: true, minGuarantors: 1, maxGuarantors: 1, guaranteeTypeRequired: 'GROUP', guaranteeRatio: 80, allowSelfGuarantee: false,
    requiresApproval: true, approvalLevel: 'BOARD', status: 'ACTIVE', deletedAt: null,
  },
  {
    id: 'LR-003', tenantId: 'T-001', accountId: 'AC-002', accountNumber: 'CS-001-ÉPG', name: 'Politique Épargne Sutura',
    allowLoans: false, loanMode: 'NONE', minAmount: 0, maxAmount: 500_000, interestRate: 8, interestType: 'FIXED', interestPeriod: 'YEARLY', durationMonths: 12,
    maxActiveLoans: 1, maxLoanExposure: null, requiresGuarantor: false, minGuarantors: 0, maxGuarantors: 1, guaranteeTypeRequired: 'PERSONAL', guaranteeRatio: 100, allowSelfGuarantee: true,
    requiresApproval: false, approvalLevel: null, status: 'INACTIVE', deletedAt: null,
  },
];
