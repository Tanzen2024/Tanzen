import { mockRequest } from './api-client';
import { getTenantScoped } from './tenant-scope';
import { loanRules, type LoanRule, type LoanRuleApprovalLevel, type LoanRuleGuaranteeType, type LoanRuleInterestPeriod, type LoanRuleInterestType, type LoanRuleLoanMode } from '@/mocks/finance/loan-rules';
import { accounts } from '@/mocks/finance/accounts';

/** accountId reste immuable après création — jamais reproposé par UPDATE (§9 du mandat : "intégrité account_id"). */
export type LoanRuleInput = {
  accountId: string;
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
};
export type LoanRuleUpdateInput = Partial<Omit<LoanRuleInput, 'accountId'>>;

function isLive(rule: LoanRule): boolean {
  return rule.deletedAt === null;
}

/** Contraintes CHECK nommées de la fiche canonique #14 — refuse (undefined) toute écriture qui les violerait. */
function violatesCanonicalConstraints(input: Pick<LoanRuleInput, 'minAmount' | 'maxAmount' | 'interestRate' | 'durationMonths' | 'maxLoanExposure' | 'minGuarantors' | 'maxGuarantors' | 'guaranteeRatio'>): boolean {
  if (input.maxAmount < input.minAmount) return true; // ck_amount_valid
  if (input.interestRate < 0) return true; // ck_interest_valid
  if (input.durationMonths <= 0) return true; // ck_duration_valid
  if (input.maxLoanExposure !== null && input.maxLoanExposure < 0) return true; // ck_exposure_valid
  if (input.maxGuarantors < input.minGuarantors) return true; // ck_guarantor_count
  if (input.guaranteeRatio < 0 || input.guaranteeRatio > 100) return true; // ck_guarantee_ratio
  return false;
}

export const loanRuleService = {
  /** Par défaut, n'affiche jamais les lignes deleted_at != NULL (§16 du mandat). */
  listLoanRules: (tenantId: string) => mockRequest(() => loanRules.filter((rule) => rule.tenantId === tenantId && isLive(rule))),

  getLoanRule: (tenantId: string, ruleId: string) =>
    mockRequest(() => {
      const rule = getTenantScoped(loanRules, (item) => item.id === ruleId, tenantId);
      if (!rule || !isLive(rule)) return undefined;
      return rule;
    }),

  /**
   * uq_loan_rules_account (UNIQUE(tenant_id, account_id)) et uq_loan_rules_name (UNIQUE(tenant_id, name))
   * ne sont vérifiées que contre les règles vivantes (deleted_at IS NULL) : RESTORE étant hors périmètre,
   * une contrainte incluant les lignes supprimées bloquerait définitivement tout nouveau LoanRule pour un
   * compte dont l'ancienne règle a été supprimée — un résultat auto-contradictoire avec CREATE/DELETE tous
   * deux prévus comme opérations disponibles (cf. docs/P1_CREDIT_LOAN_RULES_DECISION_ANALYSIS.md §12/§22).
   */
  createLoanRule: (tenantId: string, input: LoanRuleInput) =>
    mockRequest(() => {
      const account = getTenantScoped(accounts, (item) => item.id === input.accountId, tenantId);
      if (!account) return undefined;
      if (violatesCanonicalConstraints(input)) return undefined;
      const duplicateAccount = loanRules.some((rule) => rule.tenantId === tenantId && rule.accountId === input.accountId && isLive(rule));
      if (duplicateAccount) return undefined;
      const duplicateName = loanRules.some((rule) => rule.tenantId === tenantId && rule.name === input.name && isLive(rule));
      if (duplicateName) return undefined;
      const rule: LoanRule = { id: `LR-${String(loanRules.length + 1).padStart(3, '0')}`, tenantId, accountNumber: account.accountNumber, status: 'ACTIVE', deletedAt: null, ...input };
      loanRules.push(rule);
      return rule;
    }),

  updateLoanRule: (tenantId: string, ruleId: string, patch: LoanRuleUpdateInput) =>
    mockRequest(() => {
      const rule = getTenantScoped(loanRules, (item) => item.id === ruleId, tenantId);
      if (!rule || !isLive(rule)) return undefined;
      const merged = { ...rule, ...patch };
      if (violatesCanonicalConstraints(merged)) return undefined;
      if (patch.name && patch.name !== rule.name) {
        const duplicateName = loanRules.some((item) => item.tenantId === tenantId && item.name === patch.name && isLive(item) && item.id !== rule.id);
        if (duplicateName) return undefined;
      }
      Object.assign(rule, patch);
      return rule;
    }),

  /** ACTIVATE : status = ACTIVE uniquement. deleted_at n'est jamais touché par une simple (dés)activation (§10 du mandat). */
  activateLoanRule: (tenantId: string, ruleId: string) =>
    mockRequest(() => {
      const rule = getTenantScoped(loanRules, (item) => item.id === ruleId, tenantId);
      if (!rule || !isLive(rule)) return undefined;
      rule.status = 'ACTIVE';
      return rule;
    }),

  deactivateLoanRule: (tenantId: string, ruleId: string) =>
    mockRequest(() => {
      const rule = getTenantScoped(loanRules, (item) => item.id === ruleId, tenantId);
      if (!rule || !isLive(rule)) return undefined;
      rule.status = 'INACTIVE';
      return rule;
    }),

  /** DELETE = suppression logique uniquement (§11 du mandat) : deleted_at horodaté ET status forcé à INACTIVE. Jamais de suppression physique. RESTORE non implémenté. */
  deleteLoanRule: (tenantId: string, ruleId: string) =>
    mockRequest(() => {
      const rule = getTenantScoped(loanRules, (item) => item.id === ruleId, tenantId);
      if (!rule || !isLive(rule)) return undefined;
      rule.deletedAt = new Date().toISOString();
      rule.status = 'INACTIVE';
      return rule;
    }),
};
