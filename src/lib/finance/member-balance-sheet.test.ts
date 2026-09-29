import { describe, it, expect } from 'vitest';
import { loanInterestAccruals, memberBalanceSheets, memberPeriodStatements, summarizeBalanceSheets, summarizePeriodStatements, type BalanceSheetCtx } from './member-balance-sheet';
import { allocateInteger, distributeInterest, loanDebtAt, roundMoney } from './interest-distribution';
import { makeCashbox, makeLoan, makeRepayment, makeTransaction } from './__fixtures__/factories';

/**
 * BILAN FINANCIER DES ADHÉRENTS — épargne / situation nette (2026-09-27) et RÈGLES MÉTIER DE
 * RÉFÉRENCE des prêts (2026-09-28) : GLOBAL = capital + intérêt déterminé à l'origine ; SIMPLE = base
 * « capital de référence » (dette restante après le dernier remboursement) ; COMPOUND = base dette
 * courante ; redistribution calculée séparément, en montants entiers (Σ parts = montant).
 */
const CX_A = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A', title: 'Épargne' });
const CX_B = makeCashbox({ id: 'AC-B', cashboxNumber: 'CX-B', title: 'Transport' });
const CX_T = makeCashbox({ id: 'AC-T', cashboxNumber: 'CX-T', title: 'Achat tontine', systemCode: 'TONTINE_PURCHASE' });

function ctx(over: Partial<BalanceSheetCtx> = {}): BalanceSheetCtx {
  return { transactions: [], loans: [], repayments: [], cashboxes: [CX_A, CX_B, CX_T], loanMode: 'SIMPLE', ...over };
}
const saving = (memberId: string, amount: number, date: string, cashboxNumber = 'CX-A') =>
  makeTransaction({ memberId, amount, date, type: 'credit', category: 'EPARGNE', source: 'MEMBRE', destination: cashboxNumber });
const withdrawal = (memberId: string, amount: number, date: string, cashboxNumber = 'CX-A') =>
  makeTransaction({ memberId, amount, date, type: 'debit', category: 'AUTRES', subcategory: 'RETRAIT', source: cashboxNumber, destination: 'MEMBRE' });
const disbursement = (memberId: string, loanId: string, amount: number, date: string, cashboxNumber = 'CX-A') =>
  makeTransaction({ memberId, loanId, amount, date, type: 'debit', category: 'AUTRES', subcategory: 'PRET', source: cashboxNumber, destination: 'MEMBRE' });
const sheetOf = (context: BalanceSheetCtx, memberId: string, asOfDate: string, cashboxId?: string) =>
  memberBalanceSheets(context, { memberIds: [memberId], asOfDate, cashboxId })[0];
const gainsOf = (context: BalanceSheetCtx, memberId: string, upTo: string) => (distributeInterest(context, upTo).gainsByMember.get(memberId) ?? []).map((line) => Math.round(line.gain));

/** Exemple du mandat : Paul 20 000, Jean 80 000, Lamat emprunte 90 000 à 10 % par mois dans la caisse Épargne. */
const lamat = makeLoan({ id: 'L-LAM', memberId: 'LAMAT', principal: 90_000, interestRate: 10, interestAmount: 0, disbursementDate: '2026-01-01', maturityDate: '2026-04-01' });
const example = (loanMode: BalanceSheetCtx['loanMode'], extra: Partial<BalanceSheetCtx> = {}) => ctx({
  loanMode,
  loans: [{ ...lamat, loanMode }],
  transactions: [saving('PAUL', 20_000, '2025-12-01'), saving('JEAN', 80_000, '2025-12-01'), disbursement('LAMAT', 'L-LAM', 90_000, '2026-01-01')],
  ...extra,
});

/**
 * RÈGLES MÉTIER DE RÉFÉRENCE (Hugues, 2026-09-28) — scénarios reproduits EXACTEMENT. Prêt de 100 000
 * décaissé le 01/01/2026 (mois 1), intérêt mensuel à chaque échéance (01/02 = mois 2, 01/03 = mois 3…),
 * remboursements en cours de mois (après l'intérêt du mois). `debtAfterInterest` = dette à l'échéance,
 * `debtAfterRepayment` = dette en fin de mois.
 */
const REF = makeLoan({ id: 'L-REF', memberId: 'EMP', principal: 100_000, disbursementDate: '2026-01-01', maturityDate: '2027-01-01', interestPeriod: 'MONTHLY' });
const refRepay = (amount: number, paymentDate: string) => makeRepayment({ loanId: 'L-REF', paymentDate, amount });
const MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
/** Mois M2 → M9 : [dette après intérêt, remboursé dans le mois, dette en fin de mois]. */
function monthlyTrace(loan: typeof REF, repayments: ReturnType<typeof refRepay>[]) {
  return MONTHS.map((month) => {
    const repaid = repayments.filter((repayment) => repayment.paymentDate.startsWith(month)).reduce((sum, repayment) => sum + repayment.amount, 0);
    return [loanDebtAt(loan, repayments, `${month}-01`), repaid, loanDebtAt(loan, repayments, `${month}-28`)];
  });
}

describe('Arrondi monétaire et répartition entière (règle de référence)', () => {
  it('arrondi à l’entier : 4 945,90 → 4 946 ; 494,59 → 495 ; 5 440,49 → 5 440 ; 2 333,33 → 2 333 ; 2 333,67 → 2 334', () => {
    expect([4_945.9, 494.59, 5_440.49, 2_333.33, 2_333.67].map(roundMoney)).toEqual([4_946, 495, 5_440, 2_333, 2_334]);
  });

  it('répartition d’un montant entier : parts entières, Σ parts = montant, reliquat déterministe et tracé', () => {
    const equal = allocateInteger(7_000, [1, 1, 1]);
    expect(equal.map((part) => part.amount)).toEqual([2_334, 2_333, 2_333]);
    expect(equal.map((part) => part.adjustment)).toEqual([1, 0, 0]);
    expect(equal.reduce((sum, part) => sum + part.amount, 0)).toBe(7_000);
    const proportional = allocateInteger(21_000, [130_000, 75_000, 15_000]);
    expect(proportional.map((part) => part.amount)).toEqual([12_409, 7_159, 1_432]);
    expect(proportional.reduce((sum, part) => sum + part.amount, 0)).toBe(21_000);
    // Mêmes entrées → même résultat (déterministe).
    expect(allocateInteger(21_000, [130_000, 75_000, 15_000])).toEqual(proportional);
  });
});

describe('GLOBAL 25 % — intérêt déterminé à la base, puis aucun intérêt périodique', () => {
  const global = { ...REF, loanMode: 'GLOBAL' as const, interestRate: 25 };
  const repayments = [refRepay(50_000, '2026-03-15'), refRepay(25_000, '2026-05-15'), refRepay(50_000, '2026-07-15')];

  it('100 000 → 125 000 à rembourser ; une seule ligne d’intérêt, à l’origine', () => {
    expect(loanInterestAccruals(global, repayments)).toEqual([{ date: '2026-01-01', amount: 25_000, base: 100_000, rate: 25, periodStart: '2026-01-01', debtBefore: 100_000 }]);
    expect(loanDebtAt(global, [], '2026-01-01')).toBe(125_000);
    expect(loanDebtAt(global, [], '2026-12-31')).toBe(125_000); // aucun nouvel intérêt périodique
  });

  it('remboursements successifs jusqu’au remboursement total : 125 000 → 75 000 → 50 000 → 0, sans nouvel intérêt', () => {
    expect(monthlyTrace(global, repayments).map(([, repaid, end]) => [repaid, end])).toEqual([
      [0, 125_000], [50_000, 75_000], [0, 75_000], [25_000, 50_000], [0, 50_000], [50_000, 0], [0, 0], [0, 0],
    ]);
    const sheet = sheetOf(ctx({ loans: [global], repayments }), 'EMP', '2026-12-31');
    expect(sheet).toMatchObject({ interestAccrued: 25_000, repayments: 125_000, debt: 0 });
    expect(sheet.loans[0]).toMatchObject({ principal: 100_000, interestAccrued: 25_000, outstanding: 0, status: 'repaid' });
  });
});

describe('SIMPLE 15 % — base = capital de référence restant après remboursement', () => {
  const simple = { ...REF, loanMode: 'SIMPLE' as const, interestRate: 15 };
  const repayments = [refRepay(20_000, '2026-02-15'), refRepay(100_000, '2026-06-15'), refRepay(30_000, '2026-07-15'), refRepay(34_270, '2026-08-15')];

  it('scénario de référence M2 → M9 : 115 000, 95 000, 109 250, 123 500, 137 750, 152 000, 52 000, 59 800, 29 800, 34 270, 0', () => {
    expect(monthlyTrace(simple, repayments)).toEqual([
      [115_000, 20_000, 95_000],
      [109_250, 0, 109_250],
      [123_500, 0, 123_500],
      [137_750, 0, 137_750],
      [152_000, 100_000, 52_000],
      [59_800, 30_000, 29_800],
      [34_270, 34_270, 0],
      [0, 0, 0],
    ]);
  });

  it('bases : 100 000 puis 95 000 (M3 à M6, intérêts NON capitalisés), 52 000, 29 800 ; plus d’intérêt une fois soldé', () => {
    expect(loanInterestAccruals(simple, repayments).map((accrual) => [accrual.date, accrual.base, accrual.amount])).toEqual([
      ['2026-02-01', 100_000, 15_000],
      ['2026-03-01', 95_000, 14_250],
      ['2026-04-01', 95_000, 14_250],
      ['2026-05-01', 95_000, 14_250],
      ['2026-06-01', 95_000, 14_250],
      ['2026-07-01', 52_000, 7_800],
      ['2026-08-01', 29_800, 4_470],
    ]);
  });

  it('aucun remboursement : base = 100 000 à chaque période (jamais la dette courante)', () => {
    expect(loanInterestAccruals(simple, []).slice(0, 4).map((accrual) => [accrual.base, accrual.amount])).toEqual([[100_000, 15_000], [100_000, 15_000], [100_000, 15_000], [100_000, 15_000]]);
    expect(loanDebtAt(simple, [], '2026-05-01')).toBe(160_000);
  });

  it('plusieurs remboursements dans une même période : même capital de référence qu’un remboursement unique', () => {
    const split = [refRepay(10_000, '2026-02-10'), refRepay(10_000, '2026-02-20')];
    expect(loanInterestAccruals(simple, split).slice(1, 3).map((accrual) => accrual.base)).toEqual([95_000, 95_000]);
  });

  it('remboursement le jour même de l’échéance : appliqué APRÈS l’intérêt du mois (mois M : intérêt, puis remboursement)', () => {
    expect(loanInterestAccruals(simple, [refRepay(20_000, '2026-02-01')]).slice(0, 2).map((accrual) => [accrual.base, accrual.amount])).toEqual([[100_000, 15_000], [95_000, 14_250]]);
  });

  it('remboursement total puis au-delà : plus aucun intérêt (la dette ne génère rien quand elle est nulle ou négative)', () => {
    expect(loanInterestAccruals(simple, [refRepay(115_000, '2026-02-15')])).toHaveLength(1);
    expect(loanInterestAccruals(simple, [refRepay(200_000, '2026-02-15')])).toHaveLength(1);
  });
});

describe('COMPOSÉ 10 % — base = dette courante (intérêts capitalisés)', () => {
  const compound = { ...REF, loanMode: 'COMPOUND' as const, interestRate: 10 };
  const repayments = [refRepay(20_000, '2026-02-15'), refRepay(100_000, '2026-06-15'), refRepay(30_000, '2026-07-15'), refRepay(5_441, '2026-08-15')];

  it('scénario de référence : 110 000 → 90 000 → 99 000 → 108 900 → 119 790 → 131 769 → 31 769 → 34 946 → 4 946 → 5 441 → 0', () => {
    expect(monthlyTrace(compound, repayments)).toEqual([
      [110_000, 20_000, 90_000],
      [99_000, 0, 99_000],
      [108_900, 0, 108_900],
      [119_790, 0, 119_790],
      [131_769, 100_000, 31_769],
      [34_946, 30_000, 4_946], // 31 769 × 10 % = 3 176,9 → 3 177 : 34 946
      [5_441, 5_441, 0], // 4 946 × 10 % = 494,6 → 495
      [0, 0, 0],
    ]);
  });

  it('bases = dette courante ; intérêts entiers', () => {
    const accruals = loanInterestAccruals(compound, repayments);
    expect(accruals.map((accrual) => [accrual.base, accrual.amount])).toEqual([[100_000, 10_000], [90_000, 9_000], [99_000, 9_900], [108_900, 10_890], [119_790, 11_979], [31_769, 3_177], [4_946, 495]]);
    expect(accruals.every((accrual) => Number.isInteger(accrual.amount) && Number.isInteger(accrual.base))).toBe(true);
  });

  it('aucun remboursement : capitalisation 100 000 → 110 000 → 121 000 → 133 100', () => {
    expect([2, 3, 4].map((month) => loanDebtAt(compound, [], `2026-0${month}-01`))).toEqual([110_000, 121_000, 133_100]);
  });

  it('plusieurs remboursements dans une même période ; remboursement total ; au-delà : plus aucun intérêt', () => {
    const split = [refRepay(15_000, '2026-02-10'), refRepay(5_000, '2026-02-25')];
    expect(loanInterestAccruals(compound, split)[1].base).toBe(90_000);
    expect(loanInterestAccruals(compound, [refRepay(110_000, '2026-02-15')])).toHaveLength(1);
    expect(loanInterestAccruals(compound, [refRepay(500_000, '2026-02-15')])).toHaveLength(1);
  });
});

describe('Redistribution séparée de la dette (flux 2) et Achat tontine (flux 3)', () => {
  it('redistribution ≠ réduction de la dette : l’emprunteur épargnant reçoit un gain, sa dette reste celle du prêt', () => {
    const withSavings = example('COMPOUND', { transactions: [...example('COMPOUND').transactions, saving('LAMAT', 100_000, '2025-12-01')] });
    const borrower = sheetOf(withSavings, 'LAMAT', '2026-03-15');
    expect(borrower.gains).toBeGreaterThan(0);
    expect(borrower.debt).toBe(sheetOf(example('COMPOUND'), 'LAMAT', '2026-03-15').debt);
    expect(borrower.debt).toBe(108_900);
  });

  it('parts entières, reliquat tracé, Σ gains = intérêt généré (prorata)', () => {
    const context = ctx({ loans: [{ ...lamat, loanMode: 'SIMPLE', principal: 100_000, interestRate: 7 }], transactions: [saving('A', 10_000, '2025-12-01'), saving('B', 10_000, '2025-12-01'), saving('C', 10_000, '2025-12-01'), disbursement('LAMAT', 'L-LAM', 100_000, '2026-01-01')] });
    const result = distributeInterest(context, '2026-02-01');
    const lines = ['A', 'B', 'C'].map((id) => result.gainsByMember.get(id)![0]);
    expect(lines.map((line) => line.gain)).toEqual([2_334, 2_333, 2_333]);
    expect(lines.map((line) => line.roundingAdjustment)).toEqual([1, 0, 0]);
    expect(lines.reduce((sum, line) => sum + line.gain, 0)).toBe(7_000);
  });

  it('Achat tontine : 7 000 entre A, D, E → 2 334 / 2 333 / 2 333, Σ = 7 000, jamais au prorata', () => {
    const purchase = makeTransaction({ id: 'TR-ACH7', memberId: 'E', amount: 7_000, date: '2026-01-10', category: 'AUTRES', subcategory: 'ACHAT_TONTINE', destination: 'CX-T' });
    const context = ctx({ transactions: [purchase, saving('A', 900_000, '2026-01-01', 'CX-T')], tontinePurchases: [{ transactionId: 'TR-ACH7', tontineId: 'TON-50K', tontineName: 'Tontine 50 000', memberIds: ['E', 'A', 'D'] }] });
    const result = distributeInterest(context, '2026-01-31');
    const gains = ['A', 'D', 'E'].map((id) => result.gainsByMember.get(id)![0].gain);
    expect(gains).toEqual([2_334, 2_333, 2_333]);
    expect(gains.reduce((sum, gain) => sum + gain, 0)).toBe(7_000);
    expect(sheetOf(context, 'A', '2026-01-31')).toMatchObject({ gains: 2_334 });
  });

  it('multi-caisses : intérêt réparti en parts ENTIÈRES entre caisses (Σ = intérêt), puis redistribué dans chacune', () => {
    const loan = { ...lamat, loanMode: 'SIMPLE' as const, principal: 100_000, interestRate: 10 };
    const context = ctx({ loans: [loan], transactions: [saving('PAUL', 20_000, '2025-12-01', 'CX-A'), saving('ZOE', 10_000, '2025-12-01', 'CX-B'), disbursement('LAMAT', 'L-LAM', 33_333, '2026-01-01', 'CX-A'), disbursement('LAMAT', 'L-LAM', 66_667, '2026-01-01', 'CX-B')] });
    const result = distributeInterest(context, '2026-02-01');
    const paul = result.gainsByMember.get('PAUL')![0].gain;
    const zoe = result.gainsByMember.get('ZOE')![0].gain;
    expect([paul, zoe]).toEqual([3_333, 6_667]);
    expect(paul + zoe).toBe(10_000);
    const inA = sheetOf(context, 'LAMAT', '2026-02-01', 'AC-A');
    const inB = sheetOf(context, 'LAMAT', '2026-02-01', 'AC-B');
    expect([inA.interestAccrued, inB.interestAccrued]).toEqual([3_333, 6_667]);
    expect(Number.isInteger(inA.debt) && Number.isInteger(inB.debt)).toBe(true);
  });
});

describe('Redistribution des intérêts par caisse', () => {
  it('4. prorata des soldes positifs de LA caisse : Paul 20 % → 1 800, Jean 80 % → 7 200', () => {
    expect(gainsOf(example('COMPOUND'), 'PAUL', '2026-02-01')).toEqual([1_800]);
    expect(gainsOf(example('COMPOUND'), 'JEAN', '2026-02-01')).toEqual([7_200]);
    const [line] = distributeInterest(example('COMPOUND'), '2026-02-01').gainsByMember.get('PAUL')!;
    expect(line).toMatchObject({ cashboxId: 'AC-A', rule: 'PROPORTIONAL', generated: 9_000, memberBalance: 20_000, eligibleTotal: 100_000, share: 0.2 });
    expect(line.source).toMatchObject({ kind: 'LOAN', loanId: 'L-LAM', base: 90_000, rate: 10 });
  });

  it('6. mois suivant (composé) : 9 900 redistribués sur les soldes mis à jour (21 800 / 87 200 → toujours 20 / 80)', () => {
    expect(gainsOf(example('COMPOUND'), 'PAUL', '2026-03-01')).toEqual([1_800, 1_980]);
    expect(gainsOf(example('COMPOUND'), 'JEAN', '2026-03-01')).toEqual([7_200, 7_920]);
    const paul = sheetOf(example('COMPOUND'), 'PAUL', '2026-03-01');
    expect(paul).toMatchObject({ savings: 20_000, gains: 3_780, netPosition: 23_780 });
  });

  it('SIMPLE : 9 000 redistribués chaque mois selon la même règle de caisse', () => {
    expect(gainsOf(example('SIMPLE'), 'JEAN', '2026-03-01')).toEqual([7_200, 7_200]);
  });

  it('5. solde = 0 ou négatif → non éligible ; l’emprunteur sans épargne ne reçoit rien', () => {
    const context = example('SIMPLE', { transactions: [...example('SIMPLE').transactions, saving('MARC', 10_000, '2025-12-01'), withdrawal('MARC', 10_000, '2025-12-15'), withdrawal('LUC', 5_000, '2025-12-15')] });
    expect(gainsOf(context, 'MARC', '2026-02-01')).toEqual([]);
    expect(gainsOf(context, 'LUC', '2026-02-01')).toEqual([]);
    expect(gainsOf(context, 'LAMAT', '2026-02-01')).toEqual([]);
    expect(gainsOf(context, 'PAUL', '2026-02-01')).toEqual([1_800]);
  });

  it('jamais le solde global : un membre qui n’épargne que dans une autre caisse ne reçoit rien', () => {
    const context = example('SIMPLE', { transactions: [...example('SIMPLE').transactions, saving('ZOE', 500_000, '2025-12-01', 'CX-B')] });
    expect(gainsOf(context, 'ZOE', '2026-02-01')).toEqual([]);
  });

  it('10. plusieurs caisses : un prêt financé 60 % / 40 % génère l’intérêt dans chaque caisse au prorata', () => {
    const context = ctx({
      loanMode: 'SIMPLE',
      loans: [lamat],
      transactions: [saving('PAUL', 20_000, '2025-12-01', 'CX-A'), saving('ZOE', 10_000, '2025-12-01', 'CX-B'), disbursement('LAMAT', 'L-LAM', 54_000, '2026-01-01', 'CX-A'), disbursement('LAMAT', 'L-LAM', 36_000, '2026-01-01', 'CX-B')],
    });
    expect(gainsOf(context, 'PAUL', '2026-02-01')).toEqual([5_400]);
    expect(gainsOf(context, 'ZOE', '2026-02-01')).toEqual([3_600]);
    // Bilan filtré sur une caisse : seuls les gains de cette caisse.
    expect(sheetOf(context, 'ZOE', '2026-02-01', 'AC-A').gains).toBe(0);
    expect(sheetOf(context, 'ZOE', '2026-02-01', 'AC-B').gains).toBe(3_600);
  });

  it('8 et 9. Achat tontine : parts ÉGALES entre les membres de la tontine, jamais au prorata ni à toute l’association', () => {
    const purchase = makeTransaction({ id: 'TR-ACH', memberId: 'ANNA', amount: 6_000, date: '2026-02-10', category: 'AUTRES', subcategory: 'ACHAT_TONTINE', destination: 'CX-T' });
    const context = ctx({
      transactions: [purchase, saving('ANNA', 900_000, '2026-01-01', 'CX-T'), saving('BOB', 1_000, '2026-01-01', 'CX-A'), saving('HORS', 50_000, '2026-01-01', 'CX-A')],
      tontinePurchases: [{ transactionId: 'TR-ACH', tontineId: 'TON-1', tontineName: 'Tontine du marché', memberIds: ['ANNA', 'BOB', 'CLAIRE'] }],
    });
    for (const memberId of ['ANNA', 'BOB', 'CLAIRE']) expect(gainsOf(context, memberId, '2026-02-28')).toEqual([2_000]);
    expect(gainsOf(context, 'HORS', '2026-02-28')).toEqual([]);
    const [line] = distributeInterest(context, '2026-02-28').gainsByMember.get('CLAIRE')!;
    expect(line).toMatchObject({ rule: 'EQUAL', eligibleCount: 3, cashboxTitle: 'Achat tontine', source: { kind: 'TONTINE_PURCHASE', tontineName: 'Tontine du marché' } });
  });

  it('prêt sans décaissement : intérêt non redistribué (signalé), jamais attribué au hasard', () => {
    const context = ctx({ loans: [lamat], transactions: [saving('PAUL', 20_000, '2025-12-01')] });
    const result = distributeInterest(context, '2026-02-01');
    expect(result.gainsByMember.size).toBe(0);
    expect(result.undistributed).toEqual([expect.objectContaining({ reason: 'UNATTRIBUTED_LOAN', amount: 9_000 })]);
    expect(sheetOf(context, 'LAMAT', '2026-02-01').unattributedLoanIds).toEqual(['L-LAM']);
  });

  it('une transaction sans adhérent ne crée aucun solde et ne rend personne éligible', () => {
    const orphan = makeTransaction({ memberId: undefined, amount: 99_000, date: '2025-12-01', type: 'credit', category: 'EPARGNE', destination: 'CX-A' });
    const context = example('SIMPLE', { transactions: [...example('SIMPLE').transactions, orphan] });
    expect(gainsOf(context, 'PAUL', '2026-02-01')).toEqual([1_800]);
  });
});

describe('Bilan individuel', () => {
  it('adhérent sans transaction : tout à 0, aucun mois d’historique', () => {
    const sheet = sheetOf(ctx(), 'M-1', '2026-09-27');
    expect(sheet).toMatchObject({ savings: 0, gains: 0, debt: 0, interestAccrued: 0, repayments: 0, netPosition: 0, loans: [], months: [] });
  });

  it('épargne − retraits ; cotisations et autres mouvements à part, hors situation nette', () => {
    const cotisation = makeTransaction({ memberId: 'M-1', amount: 5_000, date: '2026-02-10', category: 'AUTRES', subcategory: 'COTISATION', destination: 'CX-A' });
    const sheet = sheetOf(ctx({ transactions: [saving('M-1', 50_000, '2026-02-10'), withdrawal('M-1', 15_000, '2026-03-01'), cotisation] }), 'M-1', '2026-09-27');
    expect(sheet).toMatchObject({ savings: 35_000, savingsDeposits: 50_000, withdrawals: 15_000, otherMovements: { COTISATION: 5_000 }, otherMovementsTotal: 5_000, netPosition: 35_000 });
  });

  it('remboursement : il réduit la dette ; le dossier de prêt fait foi, l’écart avec le journal est signalé', () => {
    const loan = makeLoan({ id: 'L-1', memberId: 'M-1', principal: 100_000, interestRate: 1, disbursementDate: '2026-01-01', maturityDate: '2027-01-01' });
    const repayment = makeRepayment({ loanId: 'L-1', paymentDate: '2026-02-01', amount: 11_000 });
    const withoutJournal = sheetOf(ctx({ loans: [loan], repayments: [repayment] }), 'M-1', '2026-04-01');
    // SIMPLE (règle de référence) : 1 000 le 01/02 (base 100 000) ; remboursement du même jour appliqué après l'intérêt →
    // capital de référence 101 000 − 11 000 = 90 000 → 900 (01/03) et 900 (01/04). Dette = 100 000 + 2 800 − 11 000.
    expect(withoutJournal).toMatchObject({ repayments: 11_000, interestAccrued: 2_800, debt: 91_800, journalRepayments: 0, repaymentsMismatch: true });
    const journalTx = makeTransaction({ memberId: 'M-1', amount: 11_000, date: '2026-02-01', category: 'AUTRES', subcategory: 'REMBOURSEMENT', loanId: 'L-1', destination: 'CX-A' });
    expect(sheetOf(ctx({ loans: [loan], repayments: [repayment], transactions: [journalTx] }), 'M-1', '2026-04-01')).toMatchObject({ journalRepayments: 11_000, repaymentsMismatch: false, savings: 0 });
    expect(sheetOf(ctx({ loans: [loan], repayments: [{ ...repayment, status: 'scheduled' }] }), 'M-1', '2026-04-01').repayments).toBe(0);
  });

  it('plusieurs prêts : dettes et intérêts additionnés, un prêt décaissé après la date est ignoré', () => {
    const loans = [
      makeLoan({ id: 'L-1', memberId: 'M-1', principal: 100_000, interestRate: 1, disbursementDate: '2026-01-01', maturityDate: '2027-01-01' }),
      makeLoan({ id: 'L-2', memberId: 'M-1', principal: 50_000, interestRate: 1, disbursementDate: '2026-03-01', maturityDate: '2027-03-01' }),
      makeLoan({ id: 'L-3', memberId: 'M-1', principal: 999_000, interestRate: 1, disbursementDate: '2026-12-01', maturityDate: '2027-12-01' }),
    ];
    const sheet = sheetOf(ctx({ loans }), 'M-1', '2026-05-01');
    expect(sheet).toMatchObject({ interestAccrued: 5_000, debt: 155_000 });
    expect(sheet.loans.map((line) => line.loanId)).toEqual(['L-1', 'L-2']);
    expect(sheet.interestLines.map((line) => line.loanId)).toEqual(['L-1', 'L-1', 'L-1', 'L-2', 'L-1', 'L-2']);
  });

  it('plusieurs caisses : épargne consolidée par défaut, une seule si filtrée', () => {
    const context = ctx({ transactions: [saving('M-1', 30_000, '2026-02-01', 'CX-A'), saving('M-1', 20_000, '2026-02-01', 'CX-B'), withdrawal('M-1', 5_000, '2026-03-01', 'CX-B')] });
    expect(sheetOf(context, 'M-1', '2026-09-27').savings).toBe(45_000);
    expect(sheetOf(context, 'M-1', '2026-09-27', 'AC-A').savings).toBe(30_000);
    expect(sheetOf(context, 'M-1', '2026-09-27', 'AC-B').savings).toBe(15_000);
  });

  it('caisse filtrée : un prêt financé par plusieurs caisses n’y compte que pour sa part de financement', () => {
    const loan = makeLoan({ id: 'L-1', memberId: 'M-1', principal: 100_000, interestRate: 1, disbursementDate: '2026-01-01', maturityDate: '2027-01-01' });
    const disbursements = [disbursement('M-1', 'L-1', 60_000, '2026-01-01', 'CX-A'), disbursement('M-1', 'L-1', 40_000, '2026-01-01', 'CX-B')];
    const sheet = sheetOf(ctx({ loans: [loan], transactions: disbursements }), 'M-1', '2026-02-01', 'AC-A');
    expect(sheet.loans[0]).toMatchObject({ share: 0.6, principal: 60_000, interestAccrued: 600, outstanding: 60_600 });
    expect(sheet).toMatchObject({ savings: 0, otherMovementsTotal: 0 });
    expect(sheetOf(ctx({ loans: [loan] }), 'M-1', '2026-02-01', 'AC-A')).toMatchObject({ debt: 0, unattributedLoanIds: ['L-1'] });
  });

  it('historique mensuel (épargne et dette en fin de mois, intérêt du mois, cumul), sans remise à zéro', () => {
    const loan = makeLoan({ id: 'L-1', memberId: 'M-1', principal: 100_000, interestRate: 1, disbursementDate: '2026-01-10', maturityDate: '2027-01-10' });
    const context = ctx({ loans: [loan], transactions: [saving('M-1', 10_000, '2026-01-05'), saving('M-1', 5_000, '2026-03-20')] });
    expect(sheetOf(context, 'M-1', '2026-03-15').months).toEqual([
      { month: '2026-01', savings: 10_000, debt: 100_000, interest: 0, cumulativeInterest: 0 },
      { month: '2026-02', savings: 10_000, debt: 101_000, interest: 1_000, cumulativeInterest: 1_000 },
      { month: '2026-03', savings: 10_000, debt: 102_000, interest: 1_000, cumulativeInterest: 2_000 },
    ]);
    const fromMarch = memberBalanceSheets(context, { memberIds: ['M-1'], asOfDate: '2026-03-15', historyFrom: '2026-03-01' })[0];
    expect(fromMarch.months).toEqual([{ month: '2026-03', savings: 10_000, debt: 102_000, interest: 1_000, cumulativeInterest: 2_000 }]);
  });

  it('détail des opérations calculé seulement à la demande, du plus récent au plus ancien', () => {
    const context = ctx({ transactions: [saving('M-1', 10_000, '2026-01-05'), saving('M-1', 5_000, '2026-03-20')] });
    expect(sheetOf(context, 'M-1', '2026-09-27').operations).toBeUndefined();
    expect(memberBalanceSheets(context, { memberIds: ['M-1'], asOfDate: '2026-09-27', withOperations: true })[0].operations?.map((tx) => tx.date)).toEqual(['2026-03-20', '2026-01-05']);
  });
});

describe('Un, plusieurs, tous les adhérents', () => {
  const context = example('COMPOUND', { transactions: [...example('COMPOUND').transactions, saving('ZOE', 30_000, '2025-12-01', 'CX-B')] });

  it('11. un adhérent : un seul bilan', () => {
    expect(memberBalanceSheets(context, { memberIds: ['PAUL'], asOfDate: '2026-02-01' }).map((sheet) => sheet.memberId)).toEqual(['PAUL']);
  });

  it('12. plusieurs adhérents : bilans INDÉPENDANTS + synthèse = somme des bilans', () => {
    const sheets = memberBalanceSheets(context, { memberIds: ['PAUL', 'LAMAT'], asOfDate: '2026-02-01' });
    expect(sheets[0]).toMatchObject({ memberId: 'PAUL', savings: 20_000, gains: 1_800, debt: 0 });
    expect(sheets[1]).toMatchObject({ memberId: 'LAMAT', savings: 0, gains: 0, debt: 99_000, interestAccrued: 9_000 });
    expect(summarizeBalanceSheets(sheets)).toMatchObject({ memberCount: 2, savings: 20_000, gains: 1_800, debt: 99_000, netPosition: 21_800 - 99_000 });
  });

  it('13. tous : un bilan par adhérent (y compris sans opération) ; l’intérêt redistribué = l’intérêt généré', () => {
    const sheets = memberBalanceSheets(context, { memberIds: ['PAUL', 'JEAN', 'LAMAT', 'ZOE', 'NOBODY'], asOfDate: '2026-03-01' });
    expect(sheets).toHaveLength(5);
    const generated = sheets.find((sheet) => sheet.memberId === 'LAMAT')!.interestAccrued;
    expect(Math.round(sheets.reduce((sum, sheet) => sum + sheet.gains, 0))).toBe(generated);
    expect(sheets.find((sheet) => sheet.memberId === 'ZOE')!.gains).toBe(0);
  });

  it('performance : 2 000 adhérents × 10 opérations + redistribution calculés en une passe', () => {
    const transactions = Array.from({ length: 20_000 }, (_, index) => saving(`M-${index % 2_000}`, 1_000, `2026-0${1 + (index % 9)}-10`));
    transactions.push(disbursement('B-1', 'L-P', 100_000, '2026-01-01'));
    const loan = makeLoan({ id: 'L-P', memberId: 'B-1', principal: 100_000, interestRate: 1, disbursementDate: '2026-01-01', maturityDate: '2027-01-01' });
    const memberIds = Array.from({ length: 2_000 }, (_, index) => `M-${index}`);
    const started = performance.now();
    const sheets = memberBalanceSheets(ctx({ transactions, loans: [loan] }), { memberIds, asOfDate: '2026-09-27' });
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(summarizeBalanceSheets(sheets).savings).toBe(20_000_000);
  });
});

describe('Bilan sur une période', () => {
  const loan = makeLoan({ id: 'L-1', memberId: 'M-1', principal: 100_000, interestRate: 1, disbursementDate: '2026-03-01', maturityDate: '2027-03-01' });
  const context = ctx({
    loans: [loan],
    repayments: [makeRepayment({ loanId: 'L-1', paymentDate: '2026-05-01', amount: 11_000 })],
    transactions: [
      saving('M-1', 40_000, '2025-11-10'),
      saving('M-1', 10_000, '2026-02-10'),
      withdrawal('M-1', 5_000, '2026-04-10'),
      makeTransaction({ memberId: 'M-1', amount: 3_000, date: '2026-04-12', category: 'AUTRES', subcategory: 'ACHAT_TONTINE', destination: 'CX-T' }),
      saving('M-1', 99_000, '2026-07-01'),
    ],
  });
  const [statement] = memberPeriodStatements(context, { memberIds: ['M-1'], from: '2026-01-01', to: '2026-06-30', withOperations: true });

  it('A. situation au début = cumul jusqu’à la veille de la date de début', () => {
    expect(statement.opening).toEqual({ savings: 40_000, gains: 0, debt: 0, netPosition: 40_000 });
  });

  it('B. mouvements : dépôts, retraits, prêts, intérêts (01/04, 01/05, 01/06), remboursements ; achat tontine à part', () => {
    // 1 000 + 1 000, puis base réduite par le remboursement du 01/05 : 89 000 × 1 % = 890.
    expect(statement.movements).toMatchObject({ savingsDeposits: 10_000, withdrawals: 5_000, loansDisbursed: 100_000, interestAccrued: 2_910, repayments: 11_000 }); // 1 000 (01/04) + 1 000 (01/05) + 910 (01/06, base 102 000 − 11 000 = 91 000)
    expect(statement.movements.otherMovements).toEqual({ ACHAT_TONTINE: 3_000 });
  });

  it('C. début + mouvements = fin', () => {
    expect(statement.closing).toEqual({ savings: 45_000, gains: 0, debt: 91_910, netPosition: -46_910 });
    const { opening, movements, closing } = statement;
    expect(opening.debt + movements.loansDisbursed + movements.interestAccrued - movements.repayments).toBe(closing.debt);
  });

  it('historique, opérations et détail des intérêts limités à la période', () => {
    expect(statement.end.months.map((line) => line.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
    expect(statement.end.operations?.map((tx) => tx.date)).toEqual(['2026-04-12', '2026-04-10', '2026-02-10']);
    expect(statement.end.interestLines.map((line) => line.date)).toEqual(['2026-04-01', '2026-05-01', '2026-06-01']);
  });

  it('période inversée : refusée ; date de fin au-delà de l’exercice : calcul normal', () => {
    expect(() => memberPeriodStatements(context, { memberIds: ['M-1'], from: '2026-09-01', to: '2026-08-15' })).toThrow(/Période invalide/);
    const [extended] = memberPeriodStatements(context, { memberIds: ['M-1'], from: '2026-01-01', to: '2027-02-15' });
    expect(extended.closing.savings).toBe(144_000);
  });

  it('synthèse de période = somme des bilans individuels', () => {
    const statements = memberPeriodStatements(ctx({ transactions: [saving('M-1', 10_000, '2026-02-01'), saving('M-2', 5_000, '2025-12-01'), saving('M-2', 1_000, '2026-02-01')] }), { memberIds: ['M-1', 'M-2'], from: '2026-01-01', to: '2026-06-30' });
    expect(summarizePeriodStatements(statements)).toMatchObject({ memberCount: 2, opening: { savings: 5_000 }, movements: { savingsDeposits: 11_000 }, closing: { savings: 16_000 } });
  });
});

describe('Relevé par périodicité des intérêts', () => {
  it('lignes mensuelles de l’épargnant : gains du mois, solde épargne = versé + gains', () => {
    const [paul] = memberPeriodStatements(example('COMPOUND'), { memberIds: ['PAUL'], from: '2026-01-01', to: '2026-03-31', withLines: true });
    expect(paul.end.lines!.map((line) => [line.start, Math.round(line.gains), Math.round(line.savingsBalance)])).toEqual([['2026-01-01', 0, 20_000], ['2026-02-01', 1_800, 21_800], ['2026-03-01', 1_980, 23_780]]);
    expect(paul.end.gainLines).toHaveLength(2);
  });

  it('lignes de l’emprunteur : report dette + prêt + intérêts − remboursements = dette restante', () => {
    for (const loanMode of ['SIMPLE', 'COMPOUND', 'GLOBAL'] as const) {
      const [statement] = memberPeriodStatements(example(loanMode, { repayments: [makeRepayment({ loanId: 'L-LAM', paymentDate: '2026-02-20', amount: 30_000 })] }), { memberIds: ['LAMAT'], from: '2026-01-01', to: '2026-03-31', withLines: true });
      const lines = statement.end.lines!;
      for (const line of lines) expect(line.debtRemaining).toBe(line.debtCarried + line.loansDisbursed + line.interest - line.repayments);
      for (let index = 1; index < lines.length; index += 1) expect(lines[index].debtCarried).toBe(lines[index - 1].debtRemaining);
      expect(lines.at(-1)!.debtRemaining).toBe(statement.closing.debt);
      expect(lines.reduce((sum, line) => sum + line.interest, 0)).toBe(statement.movements.interestAccrued);
    }
  });

  it('lignes hebdomadaires (semaines ISO bornées) ; journalières : seulement les jours mouvementés', () => {
    const context = ctx({ transactions: [saving('M-1', 10_000, '2026-01-07'), saving('M-1', 5_000, '2026-01-20')], interestPeriod: 'WEEKLY' });
    const weekly = memberPeriodStatements(context, { memberIds: ['M-1'], from: '2026-01-01', to: '2026-01-31', withLines: true })[0].end.lines!;
    expect(weekly[0]).toMatchObject({ start: '2026-01-01', end: '2026-01-04' });
    expect(weekly[1]).toMatchObject({ start: '2026-01-05', end: '2026-01-11', savings: 10_000 });
    expect(weekly.at(-1)).toMatchObject({ start: '2026-01-26', end: '2026-01-31', savingsBalance: 15_000 });
    const daily = memberPeriodStatements({ ...context, interestPeriod: 'DAILY' }, { memberIds: ['M-1'], from: '2026-01-01', to: '2026-01-31', withLines: true })[0].end.lines!;
    expect(daily.map((line) => line.start)).toEqual(['2026-01-07', '2026-01-20']);
  });

  it('transaction sans adhérent : jamais attribuée au relevé d’un adhérent', () => {
    const orphan = makeTransaction({ memberId: undefined, amount: 99_000, date: '2026-01-10', type: 'credit', category: 'EPARGNE', destination: 'CX-A' });
    const [statement] = memberPeriodStatements(ctx({ transactions: [orphan] }), { memberIds: ['M-1'], from: '2026-01-01', to: '2026-01-31', withLines: true });
    expect(statement.end.lines!.every((line) => line.savings === 0)).toBe(true);
    expect(statement.closing.savings).toBe(0);
  });
});
