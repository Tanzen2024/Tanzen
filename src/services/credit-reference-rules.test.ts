import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { creditService } from './credit.service';
import { loans, type Loan } from '@/mocks/finance/loans';
import { repayments } from '@/mocks/finance/repayments';
import type { LoanRuleLoanMode } from '@/mocks/finance/loan-rules';

/**
 * RÈGLES MÉTIER DE RÉFÉRENCE (2026-09-28) appliquées par le MODULE CRÉDIT (service), pas seulement par le bilan :
 * la dette d'un prêt = capital + intérêts générés selon son type − remboursements ; un remboursement la réduit,
 * ne crée jamais d'intérêt, et ne peut pas la dépasser. Prêt fictif décaissé le 01/01/2026, taux mensuel,
 * échéances le 1er de chaque mois ; un remboursement daté d'une échéance est appliqué APRÈS l'intérêt du mois.
 */
const stores = { loans, repayments } as const;
let snapshot: Record<keyof typeof stores, unknown[]>;
beforeEach(() => { snapshot = Object.fromEntries(Object.entries(stores).map(([name, list]) => [name, structuredClone(list)])) as typeof snapshot; });
afterEach(() => { for (const [name, list] of Object.entries(stores)) (list as unknown[]).splice(0, list.length, ...structuredClone(snapshot[name as keyof typeof stores])); });

async function referenceLoan(loanMode: LoanRuleLoanMode, interestRate: number): Promise<Loan> {
  const interestAmount = loanMode === 'GLOBAL' ? (100_000 * interestRate) / 100 : 0;
  const created = await creditService.createLoan({ tenantId: 'T-001', memberId: 'M-016', borrower: 'Modou Faye', principal: 100_000, loanMode, interestRate, interestPeriod: 'MONTHLY', interestAmount, totalRepayable: 100_000 + interestAmount, maturityDate: '2026-12-31', monthlyPayment: 0, nextPaymentDate: '2026-02-01', applicationId: 'AP-REF', tenantName: 'Coopérative Sutura' });
  const loan = loans.find((item) => item.id === created.id)!;
  loan.disbursementDate = '2026-01-01'; // prêt de référence : origine fixe, indépendante de la date du jour
  return loan;
}
const repay = (loan: Loan, paymentDate: string, amount: number) => creditService.createRepayment('T-001', { loanId: loan.id, paymentDate, principalPart: amount, interestPart: 0, status: 'completed' });
/** Dette exposée par le module Crédit à une date (`listLoans(tenant, date)`), indépendante de la date du jour. */
const debtAt = async (loan: Loan, date = '2026-12-31') => (await creditService.listLoans('T-001', date)).find((item) => item.id === loan.id)!.outstanding;

describe('Module Crédit — INTÉRÊT GLOBAL 25 %', () => {
  it('100 000 → 125 000 dès l’origine, aucun intérêt périodique, les remboursements réduisent la dette jusqu’à 0', async () => {
    const loan = await referenceLoan('GLOBAL', 25);
    expect(await debtAt(loan)).toBe(125_000);
    expect(await repay(loan, '2026-03-01', 25_000)).not.toBeNull();
    expect(loan.outstanding).toBe(100_000);
    expect(await repay(loan, '2026-12-31', 100_001)).toBeNull(); // supérieur à la dette : refusé
    expect(await repay(loan, '2026-12-31', 100_000)).not.toBeNull();
    expect(loan).toMatchObject({ outstanding: 0, status: 'repaid', paidAmount: 125_000, progress: 100 });
  });
});

describe('Module Crédit — INTÉRÊT SIMPLE 15 % (scénario de référence)', () => {
  it('M2 115 000 → 95 000 ; M6 152 000 → 52 000 ; M7 59 800 → 29 800 ; M8 34 270 → 0', async () => {
    const loan = await referenceLoan('SIMPLE', 15);
    await repay(loan, '2026-02-01', 20_000);
    expect(loan.outstanding).toBe(95_000); // 115 000 − 20 000
    expect(await repay(loan, '2026-06-01', 152_001)).toBeNull(); // M6 : dette 152 000 (95 000 + 4 × 14 250)
    await repay(loan, '2026-06-01', 100_000);
    expect(loan.outstanding).toBe(52_000);
    await repay(loan, '2026-07-01', 30_000);
    expect(loan.outstanding).toBe(29_800); // 52 000 + 7 800 − 30 000
    await repay(loan, '2026-08-01', 34_270); // 29 800 + 4 470
    expect(loan).toMatchObject({ outstanding: 0, status: 'repaid' });
    expect(await debtAt(loan, '2026-09-01')).toBe(0); // M9 : plus aucun intérêt
    expect(await debtAt(loan)).toBe(0);
    expect(await repay(loan, '2026-09-01', 1)).toBeNull();
  });

  it('sans remboursement : la base reste le capital (100 000 + 15 000 par échéance, jusqu’à l’échéance finale)', async () => {
    const loan = await referenceLoan('SIMPLE', 15);
    expect(await debtAt(loan)).toBe(100_000 + 12 * 15_000); // 11 échéances mensuelles + l'échéance du 31/12
  });
});

describe('Module Crédit — INTÉRÊT COMPOSÉ 10 %', () => {
  it('110 000 → 90 000 → 99 000 → 108 900 → 119 790 → 131 769 → 31 769 → 34 946 → 4 946 → 5 441 → 0', async () => {
    const loan = await referenceLoan('COMPOUND', 10);
    await repay(loan, '2026-02-01', 20_000);
    expect(loan.outstanding).toBe(90_000);
    await repay(loan, '2026-06-01', 100_000); // 90 000 → 99 000 → 108 900 → 119 790 → 131 769
    expect(loan.outstanding).toBe(31_769);
    await repay(loan, '2026-07-01', 30_000); // 34 945,90 arrondi à 34 946
    expect(loan.outstanding).toBe(4_946);
    expect(await repay(loan, '2026-08-01', 5_442)).toBeNull(); // 4 946 + 494,60 → 5 441
    await repay(loan, '2026-08-01', 5_441);
    expect(loan).toMatchObject({ outstanding: 0, status: 'repaid' });
  });

  it('plusieurs remboursements dans la même période : chacun réduit la dette, l’intérêt suivant porte sur la dette restante', async () => {
    const loan = await referenceLoan('COMPOUND', 10);
    await repay(loan, '2026-01-10', 30_000);
    await repay(loan, '2026-01-20', 20_000);
    expect(loan.outstanding).toBe(50_000);
    await repay(loan, '2026-02-01', 5_000); // 50 000 + 5 000 − 5 000
    expect(loan.outstanding).toBe(50_000);
  });
});

describe('Module Crédit — garde-fous', () => {
  it('un remboursement antérieur au décaissement est refusé (dette nulle à cette date)', async () => {
    const loan = await referenceLoan('SIMPLE', 15);
    expect(await repay(loan, '2025-12-31', 1_000)).toBeNull();
  });

  it('`outstanding` exposé = dette courante recalculée, jamais l’encours contractuel stocké', async () => {
    const loan = await referenceLoan('SIMPLE', 15);
    loan.outstanding = 999_999; // valeur stockée incohérente : ignorée par les lectures
    expect(await debtAt(loan)).toBe(280_000);
    expect(await debtAt(loan, '2026-03-01')).toBe(130_000);
    expect((await creditService.getLoan('T-001', loan.id))?.outstanding).not.toBe(999_999); // getLoan : dette du jour
  });
});
