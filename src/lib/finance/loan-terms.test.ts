import { describe, it, expect } from 'vitest';
import { computeLoanTerms } from './loan-terms';

const monthlyRule = (overrides: Partial<{ interestRate: number; interestType: 'FIXED' | 'REDUCING' | 'FLAT'; durationMonths: number }> = {}) => ({
  interestRate: 12,
  interestType: 'FLAT' as const,
  interestPeriod: 'MONTHLY' as const,
  durationMonths: 12,
  ...overrides,
});

describe('computeLoanTerms — FIXED/FLAT (intérêt simple)', () => {
  it('calcule un intérêt simple = principal × taux × durée (mois)', () => {
    const terms = computeLoanTerms(100_000, monthlyRule({ interestRate: 10, durationMonths: 1 }), '2026-01-01');
    expect(terms.interestAmount).toBe(10_000);
    expect(terms.totalRepayable).toBe(110_000);
  });

  it('FIXED et FLAT produisent le même résultat (aucune règle sourcée ne les distingue)', () => {
    const flat = computeLoanTerms(500_000, monthlyRule({ interestType: 'FLAT', interestRate: 8, durationMonths: 6 }), '2026-01-01');
    const fixed = computeLoanTerms(500_000, monthlyRule({ interestType: 'FIXED', interestRate: 8, durationMonths: 6 }), '2026-01-01');
    expect(flat.interestAmount).toBe(fixed.interestAmount);
    expect(flat.totalRepayable).toBe(fixed.totalRepayable);
  });

  it('taux 0 → aucun intérêt, total = principal', () => {
    const terms = computeLoanTerms(200_000, monthlyRule({ interestRate: 0, durationMonths: 12 }), '2026-01-01');
    expect(terms.interestAmount).toBe(0);
    expect(terms.totalRepayable).toBe(200_000);
  });

  it('convertit correctement une période YEARLY (durée en mois vers années)', () => {
    const terms = computeLoanTerms(100_000, { interestRate: 10, interestType: 'FLAT', interestPeriod: 'YEARLY', durationMonths: 12 }, '2026-01-01');
    // 12 mois = 1 an → 10 % une fois.
    expect(terms.interestAmount).toBe(10_000);
  });
});

describe('computeLoanTerms — REDUCING (amortissement dégressif)', () => {
  it('mensualité constante, total remboursable > principal quand taux > 0', () => {
    const terms = computeLoanTerms(1_000_000, monthlyRule({ interestType: 'REDUCING', interestRate: 12, durationMonths: 12 }), '2026-01-01');
    expect(terms.totalRepayable).toBeGreaterThan(1_000_000);
    expect(terms.monthlyPayment).toBeGreaterThan(0);
    // mensualité × durée ≈ total remboursable (à l'arrondi près)
    expect(Math.abs(terms.monthlyPayment * 12 - terms.totalRepayable)).toBeLessThan(12);
  });

  it('taux 0 → mensualité = principal / durée, aucun intérêt', () => {
    const terms = computeLoanTerms(120_000, monthlyRule({ interestType: 'REDUCING', interestRate: 0, durationMonths: 12 }), '2026-01-01');
    expect(terms.interestAmount).toBe(0);
    expect(terms.monthlyPayment).toBe(10_000);
  });

  it('produit moins d’intérêt total que FLAT au même taux (règle attendue d’un amortissement dégressif)', () => {
    const reducing = computeLoanTerms(1_000_000, monthlyRule({ interestType: 'REDUCING', interestRate: 12, durationMonths: 12 }), '2026-01-01');
    const flat = computeLoanTerms(1_000_000, monthlyRule({ interestType: 'FLAT', interestRate: 12, durationMonths: 12 }), '2026-01-01');
    expect(reducing.interestAmount).toBeLessThan(flat.interestAmount);
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
