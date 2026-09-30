import { describe, it, expect } from 'vitest';
import { computeLoanTerms } from './loan-terms';
import { LOAN_MODES, loanRules, type LoanRuleLoanMode } from '@/mocks/finance/loan-rules';

const monthlyRule = (overrides: Partial<{ interestRate: number; loanMode: LoanRuleLoanMode; durationMonths: number }> = {}) => ({
  interestRate: 12,
  loanMode: 'SIMPLE' as LoanRuleLoanMode,
  interestPeriod: 'MONTHLY' as const,
  durationMonths: 12,
  ...overrides,
});

describe('Modes de prêt — référentiel', () => {
  it('exactement Simple, Composé, Global, dans cet ordre', () => {
    expect([...LOAN_MODES]).toEqual(['SIMPLE', 'COMPOUND', 'GLOBAL']);
  });

  it('toutes les règles seedées utilisent un mode valide (plus aucune valeur Interne / Externe / Aucun)', () => {
    expect(loanRules.every((rule) => (LOAN_MODES as readonly string[]).includes(rule.loanMode))).toBe(true);
  });
});

describe('computeLoanTerms — SIMPLE (intérêt sur le montant initial, à chaque période)', () => {
  it('intérêt = principal × taux × durée (mois)', () => {
    const terms = computeLoanTerms(100_000, monthlyRule({ interestRate: 10, durationMonths: 1 }), '2026-01-01');
    expect(terms.interestAmount).toBe(10_000);
    expect(terms.totalRepayable).toBe(110_000);
  });

  it('sur 6 mois, l’intérêt est calculé 6 fois sur le capital initial', () => {
    const terms = computeLoanTerms(500_000, monthlyRule({ interestRate: 8, durationMonths: 6 }), '2026-01-01');
    expect(terms.interestAmount).toBe(240_000); // 500 000 × 8 % × 6
  });

  it('taux 0 → aucun intérêt, total = principal', () => {
    const terms = computeLoanTerms(200_000, monthlyRule({ interestRate: 0, durationMonths: 12 }), '2026-01-01');
    expect(terms.interestAmount).toBe(0);
    expect(terms.totalRepayable).toBe(200_000);
  });

  it('taux TOUJOURS mensuel (règle du 2026-09-29) : une ancienne périodicité YEARLY de la règle est ignorée', () => {
    const legacyYearlyRule = { interestRate: 10, loanMode: 'SIMPLE' as const, interestPeriod: 'YEARLY' as const, durationMonths: 12 };
    const terms = computeLoanTerms(100_000, legacyYearlyRule, '2026-01-01');
    // 12 mois × 10 % par mois — plus aucune conversion en années.
    expect(terms.interestAmount).toBe(120_000);
  });
});

describe('computeLoanTerms — COMPOUND « Composé » (intérêt sur le montant net de la dette)', () => {
  it('mensualité constante, total remboursable > principal quand taux > 0', () => {
    const terms = computeLoanTerms(1_000_000, monthlyRule({ loanMode: 'COMPOUND', interestRate: 12, durationMonths: 12 }), '2026-01-01');
    expect(terms.totalRepayable).toBeGreaterThan(1_000_000);
    expect(terms.monthlyPayment).toBeGreaterThan(0);
    // mensualité × durée ≈ total remboursable (à l'arrondi près)
    expect(Math.abs(terms.monthlyPayment * 12 - terms.totalRepayable)).toBeLessThan(12);
  });

  it('taux 0 → mensualité = principal / durée, aucun intérêt', () => {
    const terms = computeLoanTerms(120_000, monthlyRule({ loanMode: 'COMPOUND', interestRate: 0, durationMonths: 12 }), '2026-01-01');
    expect(terms.interestAmount).toBe(0);
    expect(terms.monthlyPayment).toBe(10_000);
  });

  it('produit moins d’intérêt total que SIMPLE au même taux (la dette nette diminue à chaque échéance)', () => {
    const compound = computeLoanTerms(1_000_000, monthlyRule({ loanMode: 'COMPOUND', interestRate: 12, durationMonths: 12 }), '2026-01-01');
    const simple = computeLoanTerms(1_000_000, monthlyRule({ loanMode: 'SIMPLE', interestRate: 12, durationMonths: 12 }), '2026-01-01');
    expect(compound.interestAmount).toBeLessThan(simple.interestAmount);
  });
});

describe('computeLoanTerms — GLOBAL (intérêt calculé une seule fois sur la période)', () => {
  it('intérêt = principal × taux, une seule fois, quelle que soit la durée', () => {
    const sixMonths = computeLoanTerms(500_000, monthlyRule({ loanMode: 'GLOBAL', interestRate: 10, durationMonths: 6 }), '2026-01-01');
    const twelveMonths = computeLoanTerms(500_000, monthlyRule({ loanMode: 'GLOBAL', interestRate: 10, durationMonths: 12 }), '2026-01-01');
    expect(sixMonths.interestAmount).toBe(50_000);
    expect(twelveMonths.interestAmount).toBe(50_000);
    // Règles de référence : capital + intérêt déterminés à l'origine (100 000 à 25 % → 125 000).
    expect(sixMonths.totalRepayable).toBe(550_000);
    expect(sixMonths.monthlyPayment).toBe(Math.round(550_000 / 6));
    expect(computeLoanTerms(100_000, monthlyRule({ loanMode: 'GLOBAL', interestRate: 25, durationMonths: 6 }), '2026-01-01').totalRepayable).toBe(125_000);
  });

  it('pour 1 période, GLOBAL = SIMPLE ; au-delà, GLOBAL < SIMPLE', () => {
    const one = (loanMode: LoanRuleLoanMode) => computeLoanTerms(100_000, monthlyRule({ loanMode, interestRate: 10, durationMonths: 1 }), '2026-01-01').interestAmount;
    expect(one('GLOBAL')).toBe(one('SIMPLE'));
    const twelve = (loanMode: LoanRuleLoanMode) => computeLoanTerms(100_000, monthlyRule({ loanMode, interestRate: 10, durationMonths: 12 }), '2026-01-01').interestAmount;
    expect(twelve('GLOBAL')).toBeLessThan(twelve('SIMPLE'));
  });

  it('taux 0 → aucun intérêt', () => {
    expect(computeLoanTerms(100_000, monthlyRule({ loanMode: 'GLOBAL', interestRate: 0 }), '2026-01-01').interestAmount).toBe(0);
  });
});

describe('computeLoanTerms — dates', () => {
  it('maturityDate = disbursementDate + durationMonths, nextPaymentDate = +1 mois', () => {
    const terms = computeLoanTerms(100_000, monthlyRule({ durationMonths: 6 }), '2026-01-15');
    expect(terms.maturityDate).toBe('2026-07-15');
    expect(terms.nextPaymentDate).toBe('2026-02-15');
  });

  it('gère le changement d’année', () => {
    const terms = computeLoanTerms(100_000, monthlyRule({ durationMonths: 3 }), '2026-11-01');
    expect(terms.maturityDate).toBe('2027-02-01');
  });
});
