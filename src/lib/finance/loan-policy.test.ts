import { describe, it, expect } from 'vitest';
import { loanPolicyViolations, type LoanPolicyInput } from './loan-policy';
import type { LoanRule } from '@/mocks/finance/loan-rules';

/** Règle de crédit = source de vérité des conditions d'octroi (mandat 2026-09-25). */
const baseRule: LoanRule = {
  id: 'LR-T', tenantId: 'T-1', name: 'Règle test',
  allowLoans: true, loanMode: 'SIMPLE', minAmount: 50_000, maxAmount: 1_000_000, interestRate: 10, interestPeriod: 'MONTHLY', durationMonths: 12,
  maxActiveLoans: 2, maxLoanExposure: 1_500_000, requiresGuarantor: true, minGuarantors: 2, maxGuarantors: 2, guaranteeTypeRequired: 'PERSONAL', guaranteeRatio: 100, allowSelfGuarantee: false,
  requiresApproval: true, approvalLevel: 'ADMIN', status: 'ACTIVE', deletedAt: null, version: 1,
};
const base: LoanPolicyInput = {
  principal: 400_000, borrowerName: 'Modou Faye', activeLoanCount: 0, activeOutstanding: 0, approved: true,
  guarantors: [{ name: 'Fatou Ndiaye', amount: 200_000 }, { name: 'Cheikh Diop', amount: 200_000 }],
};
const codes = (rule: Partial<LoanRule>, input: Partial<LoanPolicyInput>) => loanPolicyViolations({ ...baseRule, ...rule }, { ...base, ...input }).map((violation) => violation.code);

describe('loanPolicyViolations', () => {
  it('prêt conforme : aucune violation', () => {
    expect(codes({}, {})).toEqual([]);
  });

  it('montant minimum / maximum', () => {
    expect(codes({}, { principal: 49_999 })).toContain('AMOUNT_OUT_OF_RANGE');
    expect(codes({}, { principal: 1_000_001 })).toContain('AMOUNT_OUT_OF_RANGE');
    expect(codes({}, { principal: 50_000, guarantors: [{ name: 'A', amount: 25_000 }, { name: 'B', amount: 25_000 }] })).toEqual([]);
  });

  it('prêts actifs maximum', () => {
    expect(codes({}, { activeLoanCount: 1 })).toEqual([]);
    expect(codes({}, { activeLoanCount: 2 })).toContain('MAX_ACTIVE_LOANS');
  });

  it('exposition maximum : encours + nouveau principal ≤ plafond ; plafond absent = pas de contrôle', () => {
    expect(codes({}, { activeOutstanding: 1_100_000 })).toEqual([]);
    expect(loanPolicyViolations(baseRule, { ...base, activeOutstanding: 1_100_001 })).toContainEqual({ code: 'MAX_EXPOSURE', max: 1_500_000, current: 1_100_001 });
    expect(codes({ maxLoanExposure: null }, { activeOutstanding: 99_000_000 })).toEqual([]);
  });

  it('garant non requis : aucun contrôle de nombre ni de ratio', () => {
    expect(codes({ requiresGuarantor: false }, { guarantors: [] })).toEqual([]);
  });

  it('garant non requis : les paramètres de garantie conservés (min, max, ratio, auto-caution) ne sont jamais appliqués', () => {
    const selfAndMore = [{ name: 'Modou Faye', amount: 1 }, { name: 'A', amount: 1 }, { name: 'B', amount: 1 }];
    expect(codes({ requiresGuarantor: false, minGuarantors: 2, maxGuarantors: 2, guaranteeRatio: 100, allowSelfGuarantee: false }, { guarantors: selfAndMore })).toEqual([]);
    expect(codes({ requiresGuarantor: false, minGuarantors: 2 }, { guarantors: [] })).toEqual([]);
    // valeurs conservées incohérentes (min 3 > max 1, ratio hors bornes) : toujours ignorées
    expect(codes({ requiresGuarantor: false, minGuarantors: 3, maxGuarantors: 1, guaranteeRatio: 150 }, { guarantors: [] })).toEqual([]);
  });

  it('garants requis : minimum respecté / non respecté, maximum respecté / dépassé', () => {
    expect(codes({}, { guarantors: [{ name: 'Fatou Ndiaye', amount: 400_000 }] })).toContain('MIN_GUARANTORS');
    expect(codes({ minGuarantors: 1, maxGuarantors: 2 }, {})).toEqual([]);
    expect(codes({ minGuarantors: 1, maxGuarantors: 1 }, {})).toContain('MAX_GUARANTORS');
    // un garant sans nom ou sans montant ne compte pas
    expect(codes({}, { guarantors: [{ name: 'Fatou Ndiaye', amount: 400_000 }, { name: '', amount: 100 }] })).toContain('MIN_GUARANTORS');
  });

  it('ratio de garantie : Σ montants garantis ≥ ratio % du principal', () => {
    expect(loanPolicyViolations(baseRule, { ...base, guarantors: [{ name: 'Fatou Ndiaye', amount: 200_000 }, { name: 'Cheikh Diop', amount: 199_999 }] })).toContainEqual({ code: 'GUARANTEE_RATIO', ratio: 100, required: 400_000 });
    expect(codes({ guaranteeRatio: 50 }, { guarantors: [{ name: 'Fatou Ndiaye', amount: 100_000 }, { name: 'Cheikh Diop', amount: 100_000 }] })).toEqual([]);
  });

  it('auto-caution interdite / autorisée', () => {
    const self = [{ name: 'modou faye ', amount: 200_000 }, { name: 'Cheikh Diop', amount: 200_000 }];
    expect(codes({}, { guarantors: self })).toContain('SELF_GUARANTEE');
    expect(codes({ allowSelfGuarantee: true }, { guarantors: self })).toEqual([]);
  });

  it('approbation requise / non requise', () => {
    expect(codes({}, { approved: false })).toContain('APPROVAL_REQUIRED');
    expect(codes({ requiresApproval: false, approvalLevel: null }, { approved: false })).toEqual([]);
  });
});
