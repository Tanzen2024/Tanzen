import { describe, it, expect } from 'vitest';
import { memberPeriodStatements, type BalanceSheetCtx } from './member-balance-sheet';
import { addMonths, distributeInterest, INTEREST_PERIOD, loanDebtAt, loanInterestAccruals, loanPenaltyAccruals, loanSchedule, loanState } from './interest-distribution';
import { computeLoanTerms } from './loan-terms';
import { splitRepayment, splitRepaymentProRata } from './repayment-split';
import { makeCashbox, makeLoan, makeRepayment, makeTransaction } from './__fixtures__/factories';
import { loans as demoLoans } from '@/mocks/finance/loans';
import { repayments as demoRepayments } from '@/mocks/finance/repayments';
import type { Loan } from '@/mocks/finance/loans';
import type { LoanRule } from '@/mocks/finance/loan-rules';

/**
 * MOTEUR D'INTÉRÊTS ET DE PÉNALITÉS — RÈGLES DÉFINITIVES du 2026-09-29 :
 *   1. intérêts TOUJOURS mensuels (`INTEREST_PERIOD`), indépendants de toute fréquence (réunion, séance, tontine) ;
 *   2. `maturityDate` n'arrête plus les intérêts : ils continuent tant que la dette > 0, jusqu'à la date limite ;
 *   3. pénalité de retard ON/OFF, FIXED ou PERCENTAGE, CHAQUE mois de retard, base PERCENTAGE = dette à
 *      `maturityDate` hors pénalités, FIGÉE ; les pénalités ne portent pas intérêt et ne sont jamais redistribuées ;
 *   4. paramètres historisés sur le prêt.
 */
const CX = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A', title: 'Épargne' });
const base140 = { id: 'L-140', memberId: 'EMP', principal: 140_000, interestRate: 15, interestPeriod: 'MONTHLY' as const, disbursementDate: '2026-01-01', maturityDate: '2027-01-01' };
const repay = (amount: number, paymentDate: string, loanId = 'L-140') => makeRepayment({ loanId, paymentDate, amount });
const disbursementTx = (loan: Loan) => makeTransaction({ memberId: loan.memberId, loanId: loan.id, amount: loan.principal, date: loan.disbursementDate, type: 'debit', category: 'AUTRES', subcategory: 'PRET', source: 'CX-A', destination: 'MEMBRE' });
const statementLines = (context: BalanceSheetCtx, memberId: string, from: string, to: string) =>
  memberPeriodStatements(context, { memberIds: [memberId], from, to, withLines: true })[0].end.lines!;
const dates = (loan: Loan, until: string) => loanInterestAccruals(loan, [], until).map((accrual) => accrual.date);

/** L-004 de la démo T-001 (Cheikh Diop) : COMPOSÉ 11 %/mois, décaissé le 25/07/2026, échéance 25/07/2027. */
const L004 = demoLoans.find((item) => item.id === 'L-004')!;
const L004_REPAYMENTS = demoRepayments.filter((item) => item.loanId === 'L-004');
const withPenalty = (penaltyType: 'FIXED' | 'PERCENTAGE', penaltyValue: number): Loan => ({ ...L004, penaltyEnabled: true, penaltyType, penaltyValue });
const L004_INTEREST_2027 = [353_243, 392_100, 435_231, 483_106, 536_248, 595_235, 660_711, 733_389, 814_062, 903_609, 1_003_006, 1_113_336];
const DEBT_AT_MATURITY = 6_667_174;
const LATE_MONTHS = ['2027-08-25', '2027-09-25', '2027-10-25', '2027-11-25', '2027-12-25'];

describe('Bornes de période (addMonths)', () => {
  it('fin de mois : 31/01 + 1 mois = 28/02 (jamais 03/03 : aucun mois sauté)', () => {
    expect([1, 2, 3, 4].map((k) => addMonths('2026-01-31', k))).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-07-25', 12)).toBe('2027-07-25');
  });

  it('durée du prêt : échéance finale bornée elle aussi (31/01 + 1 mois = 28/02)', () => {
    const rule = { loanMode: 'SIMPLE', interestRate: 10, durationMonths: 1 } as LoanRule;
    expect(computeLoanTerms(100_000, rule, '2026-01-31').maturityDate).toBe('2026-02-28');
  });

  it('date limite OBLIGATOIRE : aucun calendrier sans borne', () => {
    const loan = makeLoan({ ...base140, loanMode: 'COMPOUND' });
    expect(() => loanSchedule(loan, [], '')).toThrow();
    // Une borne lointaine se termine (une échéance par mois, rien au-delà).
    expect(loanInterestAccruals(loan, [], '2036-01-01')).toHaveLength(120);
  });
});

describe('TEST 1 — intérêts TOUJOURS mensuels', () => {
  it('ancienne périodicité DAILY / WEEKLY / YEARLY du prêt ignorée : une échéance par mois, au quantième du décaissement', () => {
    expect(INTEREST_PERIOD).toBe('MONTHLY');
    const monthly = dates(makeLoan({ ...base140, loanMode: 'COMPOUND' }), '2026-06-30');
    expect(monthly).toEqual(['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']);
    for (const interestPeriod of ['DAILY', 'WEEKLY', 'YEARLY'] as const) {
      expect(dates(makeLoan({ ...base140, loanMode: 'COMPOUND', interestPeriod }), '2026-06-30')).toEqual(monthly);
    }
  });

  it('mois sans aucune transaction : prêt du 31/01, une échéance CHAQUE mois (février compris)', () => {
    const loan = makeLoan({ ...base140, loanMode: 'COMPOUND', disbursementDate: '2026-01-31', maturityDate: '2026-07-31' });
    expect(dates(loan, '2026-07-31')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31']);
    const lines = statementLines({ transactions: [disbursementTx(loan)], loans: [loan], repayments: [], cashboxes: [CX], loanMode: 'COMPOUND' }, 'EMP', '2026-02-01', '2026-07-31');
    expect(lines.map((line) => line.interest)).toEqual([21_000, 24_150, 27_773, 31_938, 36_729, 42_239]);
  });

  it('taux des conditions contractuelles lu comme mensuel (computeLoanTerms)', () => {
    const legacyYearly = { loanMode: 'SIMPLE' as const, interestRate: 10, interestPeriod: 'YEARLY' as const, durationMonths: 6 };
    expect(computeLoanTerms(100_000, legacyYearly, '2026-01-01').interestAmount).toBe(60_000);
  });
});

describe('TEST 2 — L-004 (scénario de l’État financier 2027)', () => {
  it('paramètres historisés : COMPOSÉ 11 %/mois, échéance 25/07/2027, pénalité OFF (prêt antérieur au dispositif)', () => {
    expect(L004).toMatchObject({ principal: 2_100_000, loanMode: 'COMPOUND', interestRate: 11, disbursementDate: '2026-07-25', maturityDate: '2027-07-25', penaltyEnabled: false, penaltyType: null, penaltyValue: 0 });
  });

  it('juillet : dette début 6 006 463, intérêt 660 711, dette 6 667 174 ; août : 6 667 174 × 11 % = 733 389', () => {
    const accruals = loanInterestAccruals(L004, L004_REPAYMENTS, '2027-12-31');
    expect(accruals.find((accrual) => accrual.date === '2027-07-25')).toMatchObject({ debtBefore: 6_006_463, base: 6_006_463, amount: 660_711 });
    expect(loanDebtAt(L004, L004_REPAYMENTS, '2027-07-25')).toBe(DEBT_AT_MATURITY);
    expect(accruals.find((accrual) => accrual.date === '2027-08-25')).toMatchObject({ debtBefore: DEBT_AT_MATURITY, base: DEBT_AT_MATURITY, amount: 733_389 });
  });

  it('État financier 2027, toutes caisses : intérêts NON NULS jusqu’en décembre, dette restante cohérente avec le moteur', () => {
    const context: BalanceSheetCtx = { transactions: [disbursementTx(L004)], loans: [L004], repayments: L004_REPAYMENTS, cashboxes: [CX], loanMode: 'COMPOUND' };
    const lines = statementLines(context, 'M-006', '2027-01-01', '2027-12-31');
    expect(lines.map((line) => line.interest)).toEqual(L004_INTEREST_2027);
    expect(lines.every((line) => line.penalties === 0)).toBe(true);
    for (const line of lines) expect(line.debtRemaining).toBe(loanDebtAt(L004, L004_REPAYMENTS, line.end));
    expect(lines[0].debtCarried).toBe(3_211_300);
    expect(lines.slice(6).map((line) => line.debtRemaining)).toEqual([6_667_174, 7_400_563, 8_214_625, 9_118_234, 10_121_240, 11_234_576]);
  });
});

describe('TEST 3 / 4 — intérêts après maturityDate, arrêt à dette = 0', () => {
  it('TEST 3 — prêt échu le 01/04/2026, non soldé : les intérêts continuent chaque mois après l’échéance', () => {
    for (const loanMode of ['SIMPLE', 'COMPOUND'] as const) {
      const loan = makeLoan({ ...base140, loanMode, maturityDate: '2026-04-01' });
      const after = loanInterestAccruals(loan, [], '2026-12-31').filter((accrual) => accrual.date > loan.maturityDate);
      expect(after.map((accrual) => accrual.date)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01']);
      expect(after.every((accrual) => accrual.amount > 0)).toBe(true);
      expect(loanDebtAt(loan, [], '2026-12-31')).toBeGreaterThan(loanDebtAt(loan, [], '2026-04-01'));
    }
  });

  it('TEST 4 — dette soldée : plus aucun intérêt, avant comme après l’échéance', () => {
    const loan = makeLoan({ ...base140, loanMode: 'COMPOUND', maturityDate: '2026-04-01' });
    const settledBefore = [repay(161_000, '2026-02-10')];
    expect(loanInterestAccruals(loan, settledBefore, '2027-12-31')).toHaveLength(1);
    expect(loanDebtAt(loan, settledBefore, '2027-12-31')).toBe(0);
    const settledAfter = [repay(loanDebtAt(loan, [], '2026-06-15'), '2026-06-15')];
    expect(loanInterestAccruals(loan, settledAfter, '2027-12-31').map((accrual) => accrual.date).at(-1)).toBe('2026-06-01');
    expect(loanDebtAt(loan, settledAfter, '2027-12-31')).toBe(0);
  });
});

describe('Modes de calcul inchangés (base COMPOSÉ / SIMPLE / GLOBAL)', () => {
  it('COMPOSÉ 140 000 à 15 % : 21 000, 24 150, 27 773 ; remboursement de 75 000 → base 86 000', () => {
    const loan = makeLoan({ ...base140, loanMode: 'COMPOUND' });
    expect(loanInterestAccruals(loan, [], '2026-04-01').map((accrual) => [accrual.base, accrual.amount])).toEqual([[140_000, 21_000], [161_000, 24_150], [185_150, 27_773]]);
    const accruals = loanInterestAccruals(loan, [repay(75_000, '2026-02-15')], '2026-04-01');
    expect(accruals.map((accrual) => [accrual.base, accrual.amount])).toEqual([[140_000, 21_000], [86_000, 12_900], [98_900, 14_835]]);
  });

  it('SIMPLE : base = capital de référence, intérêts non capitalisés', () => {
    const loan = makeLoan({ ...base140, loanMode: 'SIMPLE' });
    expect(loanInterestAccruals(loan, [repay(75_000, '2026-02-15')], '2026-05-01').map((accrual) => [accrual.base, accrual.amount])).toEqual([[140_000, 21_000], [86_000, 12_900], [86_000, 12_900], [86_000, 12_900]]);
  });

  it('GLOBAL : intérêt unique à l’origine, aucun intérêt périodique même après l’échéance', () => {
    const loan = makeLoan({ ...base140, loanMode: 'GLOBAL', maturityDate: '2026-04-01' });
    expect(loanInterestAccruals(loan, [], '2027-12-31')).toEqual([expect.objectContaining({ date: '2026-01-01', base: 140_000, amount: 21_000 })]);
    for (const date of ['2026-01-01', '2026-06-01', '2027-06-01']) expect(loanDebtAt(loan, [], date)).toBe(161_000);
  });
});

describe('TEST 5 à 9 — pénalité de retard', () => {
  it('TEST 5 — pénalité OFF : aucune pénalité après l’échéance', () => {
    expect(loanPenaltyAccruals(L004, L004_REPAYMENTS, '2027-12-31')).toEqual([]);
    expect(loanSchedule(L004, L004_REPAYMENTS, '2027-12-31').some((event) => event.kind === 'PENALTY')).toBe(false);
  });

  it('TEST 6 — FIXED 50 000 : 50 000 exactement, chaque mois de retard (août → décembre), jamais avant l’échéance', () => {
    const loan = withPenalty('FIXED', 50_000);
    const penalties = loanPenaltyAccruals(loan, L004_REPAYMENTS, '2027-12-31');
    expect(penalties.map((penalty) => [penalty.date, penalty.amount, penalty.lateMonth])).toEqual(LATE_MONTHS.map((date, index) => [date, 50_000, index + 1]));
    expect(loanDebtAt(loan, L004_REPAYMENTS, '2027-12-31')).toBe(11_234_576 + 5 * 50_000);
  });

  it('TEST 7 — PERCENTAGE 2 % : 6 667 174 × 2 % = 133 343, chaque mois de retard', () => {
    const loan = withPenalty('PERCENTAGE', 2);
    const penalties = loanPenaltyAccruals(loan, L004_REPAYMENTS, '2027-12-31');
    expect(penalties.map((penalty) => [penalty.date, penalty.amount])).toEqual(LATE_MONTHS.map((date) => [date, 133_343]));
    expect(loanDebtAt(loan, L004_REPAYMENTS, '2027-12-31')).toBe(11_234_576 + 5 * 133_343);
  });

  it('TEST 8 — base FIGÉE : 6 667 174 à chaque mois de retard, même après un remboursement partiel postérieur à l’échéance', () => {
    const loan = withPenalty('PERCENTAGE', 2);
    const repayments = [...L004_REPAYMENTS, makeRepayment({ loanId: 'L-004', paymentDate: '2027-09-10', amount: 3_000_000 })];
    const penalties = loanPenaltyAccruals(loan, repayments, '2027-12-31');
    expect(penalties).toHaveLength(5);
    expect(penalties.every((penalty) => penalty.base === DEBT_AT_MATURITY && penalty.amount === 133_343)).toBe(true);
  });

  it('TEST 9 — la base n’inclut ni les intérêts postérieurs à l’échéance, ni les pénalités précédentes, ni le seul capital initial', () => {
    const loan = withPenalty('PERCENTAGE', 2);
    const [first, second] = loanPenaltyAccruals(loan, L004_REPAYMENTS, '2027-12-31');
    const debtAtAugust = loanDebtAt(loan, L004_REPAYMENTS, '2027-08-25'); // intérêt d'août + 1re pénalité
    expect(first.base).toBe(loanDebtAt(L004, L004_REPAYMENTS, loan.maturityDate));
    expect(first.base).not.toBe(first.debtBefore); // debtBefore inclut l'intérêt d'août (7 400 563)
    expect(first.debtBefore).toBe(DEBT_AT_MATURITY + 733_389);
    expect(second.base).not.toBe(debtAtAugust);
    expect(second.base).toBe(DEBT_AT_MATURITY);
    expect(first.base).not.toBe(L004.principal);
  });

  it('ordre du mois : intérêt, PUIS pénalité, deux événements distincts', () => {
    const events = loanSchedule(withPenalty('PERCENTAGE', 2), L004_REPAYMENTS, '2027-08-31').filter((event) => event.date === '2027-08-25');
    expect(events.map((event) => [event.kind, event.amount, event.debtBefore, event.debtAfter])).toEqual([
      ['INTEREST', 733_389, 6_667_174, 7_400_563],
      ['PENALTY', 133_343, 7_400_563, 7_533_906],
    ]);
  });
});

describe('TEST 10 — les pénalités ne produisent pas d’intérêts composés', () => {
  it('COMPOSÉ : intérêts identiques pénalité ON / OFF ; base = capital + intérêts − remboursements, hors pénalités', () => {
    const off = loanInterestAccruals(L004, L004_REPAYMENTS, '2027-12-31');
    for (const loan of [withPenalty('PERCENTAGE', 2), withPenalty('FIXED', 50_000)]) {
      expect(loanInterestAccruals(loan, L004_REPAYMENTS, '2027-12-31')).toEqual(off);
      const state = loanState(loan, L004_REPAYMENTS, '2027-12-31');
      expect(state.interestDebt).toBe(11_234_576);
      expect(state.debt).toBe(state.interestDebt + state.penaltyDebt);
    }
    expect(off.find((accrual) => accrual.date === '2027-09-25')!.base).toBe(7_400_563); // jamais 7 533 906 (avec pénalité)
  });

  it('un remboursement s’impute d’abord sur la dette hors pénalités, le reliquat sur les pénalités', () => {
    const loan = withPenalty('FIXED', 50_000);
    const debt = loanDebtAt(loan, L004_REPAYMENTS, '2027-08-30'); // 7 400 563 + 50 000
    const events = loanSchedule(loan, [...L004_REPAYMENTS, makeRepayment({ loanId: 'L-004', paymentDate: '2027-08-30', amount: debt - 20_000 })], '2027-12-31');
    const repayment = events.filter((event) => event.kind === 'REPAYMENT').at(-1)!;
    expect(repayment.penaltyPart).toBe(30_000);
    // Dette hors pénalités soldée : plus d'intérêt ; il reste 20 000 de pénalités, le retard continue.
    expect(events.filter((event) => event.kind === 'INTEREST' && event.date > '2027-08-30')).toEqual([]);
    expect(events.filter((event) => event.kind === 'PENALTY' && event.date > '2027-08-30').map((event) => event.amount)).toEqual([50_000, 50_000, 50_000, 50_000]);
  });
});

describe('TEST 11 — les pénalités ne sont pas redistribuées', () => {
  it('Σ gains redistribués = Σ intérêts ; pénalités = 0 dans les gains ; gains identiques pénalité ON / OFF', () => {
    const saver = makeTransaction({ memberId: 'SAVER', amount: 500_000, date: '2026-07-01', type: 'credit', category: 'EPARGNE', destination: 'CX-A' });
    const gains = (loan: Loan) => {
      const distribution = distributeInterest({ transactions: [saver, disbursementTx(loan)], loans: [loan], repayments: L004_REPAYMENTS, cashboxes: [CX] }, '2027-12-31');
      return [...distribution.gainsByMember.values()].flat();
    };
    const interestTotal = loanInterestAccruals(L004, L004_REPAYMENTS, '2027-12-31').reduce((sum, accrual) => sum + accrual.amount, 0);
    const penalised = withPenalty('PERCENTAGE', 2);
    const penaltyTotal = loanPenaltyAccruals(penalised, L004_REPAYMENTS, '2027-12-31').reduce((sum, penalty) => sum + penalty.amount, 0);
    expect(penaltyTotal).toBe(5 * 133_343);
    for (const loan of [L004, penalised]) {
      const lines = gains(loan);
      expect(lines.reduce((sum, line) => sum + line.gain, 0)).toBe(interestTotal);
      expect(lines.every((line) => line.source.kind === 'LOAN' && line.source.loanInterest === loanInterestAccruals(L004, L004_REPAYMENTS, '2027-12-31').find((accrual) => accrual.date === line.date)!.amount)).toBe(true);
    }
    expect(gains(penalised)).toEqual(gains(L004));
  });
});

describe('TEST 12 / 13 — historisation des paramètres de pénalité', () => {
  it('TEST 12 — le moteur lit UNIQUEMENT les paramètres du prêt (aucune règle en entrée)', () => {
    expect(loanPenaltyAccruals(withPenalty('PERCENTAGE', 2), L004_REPAYMENTS, '2027-08-31')).toEqual([expect.objectContaining({ penaltyType: 'PERCENTAGE', penaltyValue: 2, base: DEBT_AT_MATURITY, amount: 133_343 })]);
    expect(loanPenaltyAccruals(withPenalty('PERCENTAGE', 5), L004_REPAYMENTS, '2027-08-31')[0].amount).toBe(333_359);
  });

  it('TEST 13 — une configuration désactivée sur le prêt ne produit rien, même si une valeur y subsiste', () => {
    expect(loanPenaltyAccruals({ ...withPenalty('PERCENTAGE', 2), penaltyEnabled: false }, L004_REPAYMENTS, '2027-12-31')).toEqual([]);
  });
});

describe('TEST 14 — prêt remboursé', () => {
  it('soldé pendant le retard : plus d’intérêt ni de pénalité ensuite', () => {
    const loan = withPenalty('PERCENTAGE', 2);
    const due = loanDebtAt(loan, L004_REPAYMENTS, '2027-09-30');
    const repayments = [...L004_REPAYMENTS, makeRepayment({ loanId: 'L-004', paymentDate: '2027-09-30', amount: due })];
    const events = loanSchedule(loan, repayments, '2028-12-31');
    expect(events.filter((event) => (event.kind === 'INTEREST' || event.kind === 'PENALTY') && event.date > '2027-09-30')).toEqual([]);
    expect(loanDebtAt(loan, repayments, '2028-12-31')).toBe(0);
  });
});

describe('TEST 15 / 16 — prêts complets avec pénalité', () => {
  const short = { ...base140, id: 'L-PEN', maturityDate: '2026-04-01' };

  it('TEST 15 — SIMPLE 15 % avec pénalité FIXED 10 000 : intérêts continus, 10 000 par mois de retard', () => {
    const loan = makeLoan({ ...short, loanMode: 'SIMPLE', penaltyEnabled: true, penaltyType: 'FIXED', penaltyValue: 10_000 });
    const events = loanSchedule(loan, [], '2026-07-01').filter((event) => event.kind === 'INTEREST' || event.kind === 'PENALTY');
    expect(events.map((event) => [event.date, event.kind, event.amount])).toEqual([
      ['2026-02-01', 'INTEREST', 21_000], ['2026-03-01', 'INTEREST', 21_000], ['2026-04-01', 'INTEREST', 21_000],
      ['2026-05-01', 'INTEREST', 21_000], ['2026-05-01', 'PENALTY', 10_000],
      ['2026-06-01', 'INTEREST', 21_000], ['2026-06-01', 'PENALTY', 10_000],
      ['2026-07-01', 'INTEREST', 21_000], ['2026-07-01', 'PENALTY', 10_000],
    ]);
    expect(loanDebtAt(loan, [], '2026-07-01')).toBe(140_000 + 6 * 21_000 + 3 * 10_000);
  });

  it('TEST 16 — COMPOSÉ 15 % avec pénalité PERCENTAGE 3 % : base = dette au 01/04 (212 923), 6 388 par mois de retard', () => {
    const loan = makeLoan({ ...short, loanMode: 'COMPOUND', penaltyEnabled: true, penaltyType: 'PERCENTAGE', penaltyValue: 3 });
    expect(loanDebtAt({ ...loan, penaltyEnabled: false }, [], '2026-04-01')).toBe(212_923);
    const penalties = loanPenaltyAccruals(loan, [], '2026-07-01');
    expect(penalties.map((penalty) => [penalty.date, penalty.base, penalty.amount])).toEqual([['2026-05-01', 212_923, 6_388], ['2026-06-01', 212_923, 6_388], ['2026-07-01', 212_923, 6_388]]);
  });
});

describe('TEST 17 / 18 / 19 — la fréquence des réunions n’a aucun impact sur les intérêts', () => {
  const loan = makeLoan({ ...base140, loanMode: 'COMPOUND' });
  const everyDays = (days: number, count: number) => Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, 5 + index * days));
    return date.toISOString().slice(0, 10);
  });
  const meetingRepayments = (meetings: string[]) => meetings.map((date) => repay(1_000, date));
  const monthlyDates = ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01'];

  it.each([
    ['TEST 17 — réunions hebdomadaires', everyDays(7, 50)],
    ['TEST 18 — réunions trimestrielles', ['2026-03-15', '2026-06-15', '2026-09-15', '2026-12-15']],
    ['TEST 19 — réunion annuelle', ['2026-12-15']],
  ])('%s : versements aux dates de séance, intérêts MENSUELS au quantième du décaissement', (_label, meetings) => {
    const accruals = loanInterestAccruals(loan, meetingRepayments(meetings), '2026-12-31');
    expect(accruals.map((accrual) => accrual.date)).toEqual(monthlyDates);
  });
});

describe('TEST 20 — État financier : Intérêts et Pénalités dans deux colonnes distinctes', () => {
  it('chaque mois de retard porte son intérêt dans `interest` et sa pénalité dans `penalties` ; dette = report + intérêts + pénalités − remboursements', () => {
    const loan = withPenalty('PERCENTAGE', 2);
    const context: BalanceSheetCtx = { transactions: [disbursementTx(loan)], loans: [loan], repayments: L004_REPAYMENTS, cashboxes: [CX], loanMode: 'COMPOUND' };
    const [statement] = memberPeriodStatements(context, { memberIds: ['M-006'], from: '2027-01-01', to: '2027-12-31', withLines: true });
    const lines = statement.end.lines!;
    expect(lines.map((line) => line.interest)).toEqual(L004_INTEREST_2027);
    expect(lines.map((line) => line.penalties)).toEqual([0, 0, 0, 0, 0, 0, 0, 133_343, 133_343, 133_343, 133_343, 133_343]);
    for (const line of lines) expect(line.debtRemaining).toBe(line.debtCarried + line.loansDisbursed + line.interest + line.penalties - line.repayments);
    expect(statement.movements.interestAccrued).toBe(L004_INTEREST_2027.reduce((sum, value) => sum + value, 0));
    expect(statement.movements.penaltiesAccrued).toBe(5 * 133_343);
    expect(statement.end.penaltyLines.map((line) => [line.date, line.base, line.penaltyType, line.penaltyValue, line.amount])).toEqual(LATE_MONTHS.map((date) => [date, DEBT_AT_MATURITY, 'PERCENTAGE', 2, 133_343]));
    expect(statement.closing.debt).toBe(11_234_576 + 5 * 133_343);
  });
});

describe('Date limite `until` (horizon explicite)', () => {
  it('aucun événement après `until` ; la dette à `until` = celle du calendrier borné', () => {
    const loan = withPenalty('PERCENTAGE', 2);
    for (const until of ['2027-07-24', '2027-08-24', '2027-08-25', '2027-10-10']) {
      const events = loanSchedule(loan, L004_REPAYMENTS, until);
      expect(events.every((event) => event.date <= until)).toBe(true);
      expect(loanDebtAt(loan, L004_REPAYMENTS, until)).toBe(loanState(loan, L004_REPAYMENTS, until).debt);
    }
    expect(loanPenaltyAccruals(loan, L004_REPAYMENTS, '2027-08-24')).toEqual([]);
    expect(loanPenaltyAccruals(loan, L004_REPAYMENTS, '2027-08-25')).toHaveLength(1);
    expect(loanSchedule(loan, L004_REPAYMENTS, '2026-07-24')).toEqual([]); // avant le décaissement
  });
});

/** RÈGLE DÉFINITIVE (2026-09-30) : 1re pénalité à la PREMIÈRE date mensuelle du calendrier du prêt postérieure à `maturityDate`. */
describe('Échéance NON alignée (décaissement le 25/01, échéance le 10/07) — règle définitive', () => {
  const loan = makeLoan({ ...base140, id: 'L-NA', loanMode: 'COMPOUND', disbursementDate: '2026-01-25', maturityDate: '2026-07-10', penaltyEnabled: true, penaltyType: 'PERCENTAGE', penaltyValue: 2 });

  it('intérêts toujours mensuels au quantième du décaissement (25), rien le 10/07', () => {
    expect(dates(loan, '2026-09-30')).toEqual(['2026-02-25', '2026-03-25', '2026-04-25', '2026-05-25', '2026-06-25', '2026-07-25', '2026-08-25', '2026-09-25']);
  });

  it('pas de pénalité le 10/07 ; 1re pénalité le 25/07, 2e le 25/08, 3e le 25/09 ; base = dette au 10/07, figée', () => {
    expect(loanSchedule(loan, [], '2026-07-10').some((event) => event.date === '2026-07-10')).toBe(false); // ni intérêt ni pénalité le 10/07
    expect(loanPenaltyAccruals(loan, [], '2026-07-24')).toEqual([]);
    expect(loanPenaltyAccruals(loan, [], '2026-07-25').map((penalty) => penalty.date)).toEqual(['2026-07-25']);
    const penalties = loanPenaltyAccruals(loan, [], '2026-09-30');
    const baseAtMaturity = loanDebtAt({ ...loan, penaltyEnabled: false }, [], '2026-07-10');
    expect(baseAtMaturity).toBe(loanDebtAt({ ...loan, penaltyEnabled: false }, [], '2026-06-25')); // pas d'intérêt entre le 25/06 et le 10/07
    // Sans attendre un mois complet de retard : 25/07 = 1re date mensuelle du prêt postérieure au 10/07.
    expect(penalties.map((penalty) => [penalty.date, penalty.base, penalty.lateMonth])).toEqual([['2026-07-25', baseAtMaturity, 1], ['2026-08-25', baseAtMaturity, 2], ['2026-09-25', baseAtMaturity, 3]]);
  });
});

/** RÈGLE DÉFINITIVE (2026-09-30) : GLOBAL = EXCEPTION aux intérêts mensuels, y compris après l'échéance ; pénalités indépendantes. */
describe('GLOBAL + pénalité : pénalités indépendantes de l’intérêt unique', () => {
  it('GLOBAL + pénalité OFF, longtemps après l’échéance : intérêt GLOBAL historique uniquement, aucun intérêt périodique, aucune pénalité', () => {
    const loan = makeLoan({ ...base140, loanMode: 'GLOBAL', maturityDate: '2026-04-01' });
    const events = loanSchedule(loan, [], '2028-12-31');
    expect(events.filter((event) => event.kind === 'INTEREST')).toEqual([expect.objectContaining({ date: '2026-01-01', amount: 21_000 })]);
    expect(events.some((event) => event.kind === 'PENALTY')).toBe(false);
    expect(loanDebtAt(loan, [], '2028-12-31')).toBe(161_000);
  });

  it('intérêt unique à l’origine, aucun intérêt mensuel après l’échéance ; pénalité 10 % de la dette à l’échéance chaque mois de retard', () => {
    const loan = makeLoan({ ...base140, loanMode: 'GLOBAL', maturityDate: '2026-04-01', penaltyEnabled: true, penaltyType: 'PERCENTAGE', penaltyValue: 10 });
    const events = loanSchedule(loan, [], '2026-07-01').filter((event) => event.kind === 'INTEREST' || event.kind === 'PENALTY');
    expect(events.map((event) => [event.date, event.kind, event.amount])).toEqual([
      ['2026-01-01', 'INTEREST', 21_000],
      ['2026-05-01', 'PENALTY', 16_100], ['2026-06-01', 'PENALTY', 16_100], ['2026-07-01', 'PENALTY', 16_100], // 161 000 × 10 %
    ]);
  });
});

describe('Décomposition d’un versement (splitRepayment) — partagée par le service et la saisie rapide', () => {
  it('dette hors pénalités d’abord, reliquat en pénalités ; capital / intérêts au prorata sur le reste', () => {
    const contract = { interestAmount: 102_000, totalRepayable: 952_000 };
    expect(splitRepayment(contract, 100_000, 500_000)).toEqual({ principalPart: 89_286, interestPart: 10_714, penaltyPart: 0 });
    expect(splitRepayment(contract, 530_000, 500_000)).toEqual({ ...splitRepaymentProRata(contract, 500_000), penaltyPart: 30_000 });
    expect(splitRepayment(contract, 30_000, 0)).toEqual({ principalPart: 0, interestPart: 0, penaltyPart: 30_000 });
  });
});
