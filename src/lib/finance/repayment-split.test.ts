import { describe, it, expect } from 'vitest';
import { splitRepaymentProRata } from './repayment-split';

/** Répartition capital / intérêts au prorata du prêt — règle validée le 2026-09-25. */
describe('splitRepaymentProRata', () => {
  const loan = { interestAmount: 102_000, totalRepayable: 952_000 };

  it('intérêts = arrondi(montant × intérêts / total dû), capital = le reste — la somme vaut toujours le montant', () => {
    expect(splitRepaymentProRata(loan, 100_000)).toEqual({ principalPart: 89_286, interestPart: 10_714 });
    expect(splitRepaymentProRata(loan, 952_000)).toEqual({ principalPart: 850_000, interestPart: 102_000 });
    for (const amount of [1, 999, 158_667, 523_600]) {
      const split = splitRepaymentProRata(loan, amount);
      expect(split.principalPart + split.interestPart).toBe(amount);
    }
  });

  it('prêt sans intérêts : tout en capital ; montant invalide : aucune part d’intérêts', () => {
    expect(splitRepaymentProRata({ interestAmount: 0, totalRepayable: 500_000 }, 100_000)).toEqual({ principalPart: 100_000, interestPart: 0 });
    expect(splitRepaymentProRata(loan, 0)).toEqual({ principalPart: 0, interestPart: 0 });
    expect(splitRepaymentProRata({ interestAmount: 0, totalRepayable: 0 }, 5_000)).toEqual({ principalPart: 5_000, interestPart: 0 });
  });
});
