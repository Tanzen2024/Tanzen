import { describe, it, expect } from 'vitest';
import { memberFinancialPosition, memberFinancialPositions } from './member-position';
import {
  makeCashbox,
  makeClosingEntry,
  makeCtx,
  makeLoan,
  makeMembership,
  makeOpeningEntry,
  makeRepayment,
  makeTransaction,
} from './__fixtures__/factories';
import type { FinanceCtx } from './types';
import { cashboxes as seedCashboxes } from '@/mocks/finance/cashboxes';
import { transactions as seedTransactions } from '@/mocks/finance/transactions';
import { cashboxMemberships as seedMemberships } from '@/mocks/finance/cashbox-memberships';
import { loans as seedLoans } from '@/mocks/finance/loans';
import { repayments as seedRepayments } from '@/mocks/finance/repayments';

/** Contexte tenant-scopé à partir du seed réel — LECTURE SEULE dans ces tests. */
function seedCtx(tenantId: string): FinanceCtx {
  return {
    cashboxes: seedCashboxes.filter((a) => a.tenantId === tenantId),
    transactions: seedTransactions.filter((t) => t.tenantId === tenantId),
    memberships: seedMemberships.filter((m) => m.tenantId === tenantId),
    loans: seedLoans.filter((l) => l.tenantId === tenantId),
    repayments: seedRepayments.filter((r) => r.tenantId === tenantId),
  };
}

const ALL = (memberId: string) => ({ kind: 'MEMBER_ALL_CASHBOXES' as const, memberId });
const ACCOUNT = (memberId: string, cashboxId: string) => ({ kind: 'MEMBER_CASHBOX' as const, memberId, cashboxId });

describe('memberFinancialPosition — seed réel (Fatou M-001 / Cheikh M-006)', () => {
  const t001 = seedCtx('T-001');

  it('1. Fatou / MEMBER_ALL_CASHBOXES au 31/08 — 3 caisses adhérées, savings + credit corrects', () => {
    const result = memberFinancialPosition(ALL('M-001'), t001, '2026-08-31');
    expect(result.outOfScope).toBe(false);
    expect(result.byCashbox.map((l) => l.cashboxId).sort()).toEqual(['AC-009', 'AC-011', 'AC-012']);
    expect(result.savings).toBe(100_000); // TR-001 + TR-012 sur AC-009 (Épargne)
    // Dette courante (règles de référence, COMPOSÉ 12 %) : remboursement du 15/08 appliqué avant l'échéance du 22/08 →
    // base 850 000 − 158 667 = 691 333 → intérêt 82 960 ; dette au 31/08 = 691 333 + 82 960.
    expect(result.credit).toEqual({ loansReceived: 850_000, repayments: 158_667, outstanding: 774_293, loanCount: 1 });
    expect(result.distributions).toBe(0); // aucune transaction AUTRES/DISTRIBUTION avec memberId=M-001
  });

  it('2. Fatou / MEMBER_CASHBOX (AC-009, Épargne) — uniquement données caisse, pas de credit/distributions', () => {
    const result = memberFinancialPosition(ACCOUNT('M-001', 'AC-009'), t001, '2026-08-31');
    expect(result.outOfScope).toBe(false);
    expect(result.byCashbox).toHaveLength(1);
    expect(result.savings).toBe(100_000);
    expect(result.credit).toBeUndefined();
    expect(result.distributions).toBeUndefined();
    expect(result.estimatedNetPosition).toBeUndefined();
  });

  it('3. Cheikh / MEMBER_ALL_CASHBOXES — voyage temporel {Transport, Épargne} au 15/08, {Transport} au 15/09', () => {
    const aug = memberFinancialPosition(ALL('M-006'), t001, '2026-08-15');
    expect(aug.byCashbox.map((l) => l.cashboxId).sort()).toEqual(['AC-009', 'AC-012']);
    const sep = memberFinancialPosition(ALL('M-006'), t001, '2026-09-15');
    expect(sep.byCashbox.map((l) => l.cashboxId)).toEqual(['AC-012']);
  });

  it('POINT CRITIQUE — Cheikh/L-004 : Loan existe SANS Transaction PRET correspondante, loansReceived/outstanding corrects quand même', () => {
    // Preuve : aucune transaction AUTRES / PRET avec memberId=M-006 dans le seed T-001.
    expect(t001.transactions.some((tx) => tx.memberId === 'M-006' && tx.subcategory === 'PRET')).toBe(false);
    const result = memberFinancialPosition(ALL('M-006'), t001, '2026-08-31');
    // COMPOSÉ 11 % : remboursement du 01/08 avant l'échéance du 25/08 → base 1 905 750 → intérêt 209 633.
    expect(result.credit).toEqual({ loansReceived: 2_100_000, repayments: 194_250, outstanding: 2_115_383, loanCount: 1 });
  });

  it('POINT CRITIQUE — Fatou/L-001 : Transaction PRET (TR-002) existe AUSSI, ne double PAS loansReceived', () => {
    const pretTx = t001.transactions.find((tx) => tx.id === 'TR-002');
    expect(pretTx).toMatchObject({ memberId: 'M-001', category: 'AUTRES', subcategory: 'PRET', amount: 850_000 });
    const result = memberFinancialPosition(ALL('M-001'), t001, '2026-08-31');
    expect(result.credit!.loansReceived).toBe(850_000); // PAS 1 700 000
  });

  it('POINT CRITIQUE — Cheikh : Transaction REMBOURSEMENT (TR-004) existe AUSSI, ne double PAS repayments', () => {
    const remboursementTx = t001.transactions.find((tx) => tx.id === 'TR-004');
    expect(remboursementTx).toMatchObject({ memberId: 'M-006', category: 'AUTRES', subcategory: 'REMBOURSEMENT', amount: 120_000 });
    const result = memberFinancialPosition(ALL('M-006'), t001, '2026-08-31');
    expect(result.credit!.repayments).toBe(194_250); // PAS 120 000 + 194 250, seul RP-004 (Repayment) compte
  });

  it('PRET/REMBOURSEMENT du journal jamais dans savings/otherMovements (byCashbox)', () => {
    const fatouEpargne = memberFinancialPosition(ACCOUNT('M-001', 'AC-009'), t001, '2026-08-31').byCashbox[0];
    // TR-002 (PRET, 850 000) touche AC-009 mais ne doit apparaître ni en savings ni en otherMovements : seules TR-001 + TR-012 (épargne) comptent.
    expect(fatouEpargne).toMatchObject({ savings: 100_000, otherMovements: 0, netCaisseFlow: 100_000 });
  });
});

describe('memberFinancialPosition — périmètre CashboxMembership (fixtures fraîches)', () => {
  it('4. plusieurs caisses — uniquement celles adhérées à la date', () => {
    const a = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const b = makeCashbox({ id: 'AC-B', cashboxNumber: 'CX-B' });
    const c = makeCashbox({ id: 'AC-C', cashboxNumber: 'CX-C' }); // non adhérée
    const ctx = makeCtx({
      cashboxes: [a, b, c],
      memberships: [makeMembership({ cashboxId: 'AC-A' }), makeMembership({ cashboxId: 'AC-B' })],
    });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.byCashbox.map((l) => l.cashboxId).sort()).toEqual(['AC-A', 'AC-B']);
  });

  it('5. caisse sans transaction — présente à 0, jamais absente', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({ cashboxes: [cashbox], memberships: [makeMembership({ cashboxId: 'AC-A' })] });
    const line = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01').byCashbox[0];
    expect(line).toMatchObject({ savings: 0, otherMovements: 0, internalTransfers: 0, netCaisseFlow: 0 });
  });

  it('6. adhésion temporelle — absente avant startDate, présente dès startDate', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({ cashboxes: [cashbox], memberships: [makeMembership({ cashboxId: 'AC-A', startDate: '2026-04-01' })] });
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2026-03-31').outOfScope).toBe(true);
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2026-04-01').outOfScope).toBe(false);
  });

  it('7. caisse quittée — disparaît du périmètre (jamais à 0, absente) après endDate', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({ cashboxes: [cashbox], memberships: [makeMembership({ cashboxId: 'AC-A', startDate: '2026-01-01', endDate: '2026-06-30' })] });
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2026-06-30').byCashbox.map((l) => l.cashboxId)).toEqual(['AC-A']);
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2026-07-01').byCashbox).toEqual([]);
  });

  it('8. caisse rejointe en cours de route — absente avant, présente dès startDate', () => {
    const a = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const b = makeCashbox({ id: 'AC-B', cashboxNumber: 'CX-B' });
    const ctx = makeCtx({
      cashboxes: [a, b],
      memberships: [makeMembership({ cashboxId: 'AC-A', startDate: '2026-01-01' }), makeMembership({ cashboxId: 'AC-B', startDate: '2026-08-01' })],
    });
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2026-07-31').byCashbox.map((l) => l.cashboxId)).toEqual(['AC-A']);
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2026-08-01').byCashbox.map((l) => l.cashboxId).sort()).toEqual(['AC-A', 'AC-B']);
  });

  it('27. membre non membre d’AUCUNE caisse — outOfScope, byCashbox vide', () => {
    const ctx = makeCtx({ cashboxes: [makeCashbox({ id: 'AC-A' })], memberships: [] });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.outOfScope).toBe(true);
    expect(result.byCashbox).toEqual([]);
    expect(result.savings).toBe(0);
  });

  it('28. MEMBER_CASHBOX sur une caisse dont le membre n’est pas adhérent — outOfScope', () => {
    const ctx = makeCtx({ cashboxes: [makeCashbox({ id: 'AC-A' })], memberships: [] });
    const result = memberFinancialPosition(ACCOUNT('M-1', 'AC-A'), ctx, '2026-06-01');
    expect(result.outOfScope).toBe(true);
    expect(result.byCashbox).toEqual([]);
  });
});

describe('memberFinancialPosition — savings (EPARGNE)', () => {
  it('9. dépôt EPARGNE (credit) augmente savings', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({
      cashboxes: [cashbox],
      memberships: [makeMembership({ cashboxId: 'AC-A' })],
      transactions: [makeTransaction({ memberId: 'M-1', destination: 'CX-A', type: 'credit', category: 'EPARGNE', amount: 40_000, date: '2026-05-01' })],
    });
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01').savings).toBe(40_000);
  });

  it('10. retrait EPARGNE (debit) diminue savings', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({
      cashboxes: [cashbox],
      memberships: [makeMembership({ cashboxId: 'AC-A' })],
      transactions: [
        makeTransaction({ memberId: 'M-1', destination: 'CX-A', type: 'credit', category: 'EPARGNE', amount: 40_000, date: '2026-05-01' }),
        makeTransaction({ memberId: 'M-1', source: 'CX-A', destination: 'M-1', type: 'debit', category: 'EPARGNE', amount: 15_000, date: '2026-05-10' }),
      ],
    });
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01').savings).toBe(25_000);
  });
});

describe('memberFinancialPosition — crédit (Loan/Repayment, jamais Transaction)', () => {
  it('11. prêt unique — loansReceived/outstanding depuis Loan', () => {
    const loan = makeLoan({ id: 'L-1', memberId: 'M-1', principal: 200_000, totalRepayable: 220_000, disbursementDate: '2026-01-01' });
    const ctx = makeCtx({ cashboxes: [makeCashbox({ tenantId: 'T-1' })], loans: [loan] });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    // Dette courante au 01/06 (SIMPLE 10 %, fixture) : 200 000 + 5 échéances × 20 000.
    expect(result.credit).toEqual({ loansReceived: 200_000, repayments: 0, outstanding: 300_000, loanCount: 1 });
  });

  it('12. plusieurs prêts — sommés sans avoir besoin d’un loanId sur Transaction', () => {
    const loanA = makeLoan({ id: 'L-A', memberId: 'M-1', principal: 100_000, totalRepayable: 110_000, disbursementDate: '2026-01-01' });
    const loanB = makeLoan({ id: 'L-B', memberId: 'M-1', principal: 300_000, totalRepayable: 330_000, disbursementDate: '2026-02-01' });
    const ctx = makeCtx({ cashboxes: [makeCashbox({ tenantId: 'T-1' })], loans: [loanA, loanB] });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    // L-A : 100 000 + 5 × 10 000 ; L-B (décaissé le 01/02) : 300 000 + 4 × 30 000.
    expect(result.credit).toEqual({ loansReceived: 400_000, repayments: 0, outstanding: 570_000, loanCount: 2 });
  });

  it('13. remboursement — source Repayment, diminue outstanding et alimente repayments', () => {
    const loan = makeLoan({ id: 'L-1', memberId: 'M-1', principal: 200_000, totalRepayable: 220_000, disbursementDate: '2026-01-01' });
    const repayment = makeRepayment({ loanId: 'L-1', amount: 50_000, paymentDate: '2026-03-01', status: 'completed' });
    const ctx = makeCtx({ cashboxes: [makeCashbox({ tenantId: 'T-1' })], loans: [loan], repayments: [repayment] });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    // 20 000 (01/02) + 20 000 (01/03, remboursement du même jour appliqué après) ; capital de référence 240 000 − 50 000 = 190 000
    // → 3 × 19 000 ; dette = 200 000 + 97 000 − 50 000.
    expect(result.credit).toEqual({ loansReceived: 200_000, repayments: 50_000, outstanding: 247_000, loanCount: 1 });
  });

  it('14. outstanding à T — recalculé daté, PAS Loan.outstanding stocké', () => {
    // Loan.outstanding stocké volontairement "faux" (110 000) pour prouver qu'il n'est jamais lu directement.
    const loan = makeLoan({ id: 'L-1', memberId: 'M-1', totalRepayable: 220_000, outstanding: 110_000, disbursementDate: '2026-01-01' });
    const repayment = makeRepayment({ loanId: 'L-1', amount: 20_000, paymentDate: '2026-03-01', status: 'completed' });
    const ctx = makeCtx({ cashboxes: [makeCashbox({ tenantId: 'T-1' })], loans: [loan], repayments: [repayment] });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.credit!.outstanding).toBe(130_000); // dette courante recalculée (100 000 + 50 000 d'intérêts − 20 000), jamais 110 000
  });

  it('15. remboursement après T — ignoré (recalcul strictement daté)', () => {
    const loan = makeLoan({ id: 'L-1', memberId: 'M-1', principal: 200_000, totalRepayable: 220_000, disbursementDate: '2026-01-01' });
    const repayment = makeRepayment({ loanId: 'L-1', amount: 50_000, paymentDate: '2026-08-01', status: 'completed' });
    const ctx = makeCtx({ cashboxes: [makeCashbox({ tenantId: 'T-1' })], loans: [loan], repayments: [repayment] });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01'); // avant le remboursement
    expect(result.credit).toEqual({ loansReceived: 200_000, repayments: 0, outstanding: 300_000, loanCount: 1 });
  });

  it('16. remboursement non completed (scheduled/late) — ignoré', () => {
    const loan = makeLoan({ id: 'L-1', memberId: 'M-1', principal: 200_000, totalRepayable: 220_000, disbursementDate: '2026-01-01' });
    const scheduled = makeRepayment({ loanId: 'L-1', amount: 50_000, paymentDate: '2026-03-01', status: 'scheduled' });
    const late = makeRepayment({ loanId: 'L-1', amount: 30_000, paymentDate: '2026-02-01', status: 'late' });
    const ctx = makeCtx({ cashboxes: [makeCashbox({ tenantId: 'T-1' })], loans: [loan], repayments: [scheduled, late] });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.credit).toEqual({ loansReceived: 200_000, repayments: 0, outstanding: 300_000, loanCount: 1 });
  });

  it('prêt décaissé APRÈS T — n’existe pas encore, exclu', () => {
    const loan = makeLoan({ id: 'L-1', memberId: 'M-1', principal: 200_000, disbursementDate: '2026-09-01' });
    const ctx = makeCtx({ cashboxes: [makeCashbox({ tenantId: 'T-1' })], loans: [loan] });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.credit).toEqual({ loansReceived: 0, repayments: 0, outstanding: 0, loanCount: 0 });
  });

  it('29. prêt d’un AUTRE membre — jamais compté', () => {
    const loanMine = makeLoan({ id: 'L-MINE', memberId: 'M-1', principal: 100_000, disbursementDate: '2026-01-01' });
    const loanOther = makeLoan({ id: 'L-OTHER', memberId: 'M-2', principal: 999_999, disbursementDate: '2026-01-01' });
    const ctx = makeCtx({ cashboxes: [makeCashbox({ tenantId: 'T-1' })], loans: [loanMine, loanOther] });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.credit!.loansReceived).toBe(100_000);
    expect(result.credit!.loanCount).toBe(1);
  });

  it('30. remboursement d’un prêt appartenant à un AUTRE membre — jamais compté', () => {
    const loanMine = makeLoan({ id: 'L-MINE', memberId: 'M-1', principal: 100_000, totalRepayable: 110_000, disbursementDate: '2026-01-01' });
    const loanOther = makeLoan({ id: 'L-OTHER', memberId: 'M-2', totalRepayable: 999_000, disbursementDate: '2026-01-01' });
    const repaymentOther = makeRepayment({ loanId: 'L-OTHER', amount: 500_000, paymentDate: '2026-03-01', status: 'completed' });
    const ctx = makeCtx({ cashboxes: [makeCashbox({ tenantId: 'T-1' })], loans: [loanMine, loanOther], repayments: [repaymentOther] });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.credit).toEqual({ loansReceived: 100_000, repayments: 0, outstanding: 150_000, loanCount: 1 }); // 100 000 + 5 × 10 000
  });

  it('31. prêt d’un AUTRE tenant — jamais compté même avec le même memberId', () => {
    const loanMine = makeLoan({ id: 'L-MINE', tenantId: 'T-1', memberId: 'M-1', principal: 100_000, disbursementDate: '2026-01-01' });
    const loanOtherTenant = makeLoan({ id: 'L-OTHER-T', tenantId: 'T-2', memberId: 'M-1', principal: 999_999, disbursementDate: '2026-01-01' });
    const ctx = makeCtx({ cashboxes: [makeCashbox({ tenantId: 'T-1' })], loans: [loanMine, loanOtherTenant] });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.credit!.loansReceived).toBe(100_000);
    expect(result.credit!.loanCount).toBe(1);
  });

  it('32. remboursement d’un AUTRE tenant — jamais compté même sur le même loanId', () => {
    const loan = makeLoan({ id: 'L-1', tenantId: 'T-1', memberId: 'M-1', totalRepayable: 110_000, disbursementDate: '2026-01-01' });
    const repaymentOtherTenant = makeRepayment({ tenantId: 'T-2', loanId: 'L-1', amount: 999_000, paymentDate: '2026-03-01', status: 'completed' });
    const ctx = makeCtx({ cashboxes: [makeCashbox({ tenantId: 'T-1' })], loans: [loan], repayments: [repaymentOtherTenant] });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.credit).toEqual({ loansReceived: 100_000, repayments: 0, outstanding: 150_000, loanCount: 1 }); // 100 000 + 5 × 10 000
  });

  it('22. Transaction(PRET) coexistant avec Loan — jamais additionnée à loansReceived', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A', tenantId: 'T-1' });
    const loan = makeLoan({ id: 'L-1', tenantId: 'T-1', memberId: 'M-1', principal: 200_000, disbursementDate: '2026-01-01' });
    const ctx = makeCtx({
      cashboxes: [cashbox],
      memberships: [makeMembership({ cashboxId: 'AC-A' })],
      loans: [loan],
      transactions: [makeTransaction({ memberId: 'M-1', source: 'CX-A', destination: 'M-1', type: 'debit', category: 'AUTRES', subcategory: 'PRET', amount: 200_000, date: '2026-01-05' })],
    });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.credit!.loansReceived).toBe(200_000); // pas 400 000
    expect(result.otherMovements).toBe(0);
    expect(result.savings).toBe(0);
  });

  it('23. Transaction(REMBOURSEMENT) coexistant avec Repayment — jamais additionnée à repayments', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A', tenantId: 'T-1' });
    const loan = makeLoan({ id: 'L-1', tenantId: 'T-1', memberId: 'M-1', totalRepayable: 220_000, disbursementDate: '2026-01-01' });
    const repayment = makeRepayment({ tenantId: 'T-1', loanId: 'L-1', amount: 50_000, paymentDate: '2026-03-01', status: 'completed' });
    const ctx = makeCtx({
      cashboxes: [cashbox],
      memberships: [makeMembership({ cashboxId: 'AC-A' })],
      loans: [loan],
      repayments: [repayment],
      transactions: [makeTransaction({ memberId: 'M-1', source: 'CX-A', destination: 'M-1', type: 'credit', category: 'AUTRES', subcategory: 'REMBOURSEMENT', amount: 50_000, date: '2026-03-01' })],
    });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.credit!.repayments).toBe(50_000); // pas 100 000
  });
});

describe('memberFinancialPosition — distributions (Transaction uniquement, jamais Distribution.beneficiary)', () => {
  it('17. transaction AUTRES/DISTRIBUTION SANS memberId — jamais rattachée, distributions = 0', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({
      cashboxes: [cashbox],
      transactions: [makeTransaction({ source: 'CX-A', destination: 'Tontine Cycle 4', type: 'debit', category: 'AUTRES', subcategory: 'DISTRIBUTION', amount: 75_000, date: '2026-05-01' })],
    });
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01').distributions).toBe(0);
  });

  it('18. transaction AUTRES/DISTRIBUTION AVEC memberId correspondant — comptée', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({
      cashboxes: [cashbox],
      transactions: [makeTransaction({ memberId: 'M-1', source: 'CX-A', destination: 'M-1', type: 'debit', category: 'AUTRES', subcategory: 'DISTRIBUTION', amount: 75_000, date: '2026-05-01' })],
    });
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01').distributions).toBe(75_000);
  });
});

describe('memberFinancialPosition — autres mouvements / virements internes', () => {
  it('19. autres mouvements (FRAIS/PENALITE/DEPOT/RETRAIT/COTISATION/CORRECTION/AUTRE) — signés, hors DISTRIBUTION/TRANSFERT', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({
      cashboxes: [cashbox],
      memberships: [makeMembership({ cashboxId: 'AC-A' })],
      transactions: [
        makeTransaction({ memberId: 'M-1', source: 'M-1', destination: 'CX-A', type: 'credit', category: 'AUTRES', subcategory: 'DEPOT', amount: 10_000, date: '2026-05-01' }),
        makeTransaction({ memberId: 'M-1', source: 'CX-A', destination: 'M-1', type: 'debit', category: 'AUTRES', subcategory: 'FRAIS', amount: 2_000, date: '2026-05-02' }),
      ],
    });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.otherMovements).toBe(8_000); // +10 000 dépôt − 2 000 frais
  });

  it('20. TRANSFERT — exclu de savings/otherMovements/netCaisseFlow, exposé dans internalTransfers', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({
      cashboxes: [cashbox],
      memberships: [makeMembership({ cashboxId: 'AC-A' })],
      transactions: [
        makeTransaction({ memberId: 'M-1', destination: 'CX-A', type: 'credit', category: 'EPARGNE', amount: 50_000, date: '2026-05-01' }),
        makeTransaction({ memberId: 'M-1', source: 'CX-A', destination: 'M-1', type: 'debit', category: 'AUTRES', subcategory: 'TRANSFERT', amount: 20_000, date: '2026-05-02' }),
      ],
    });
    const line = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01').byCashbox[0];
    expect(line.internalTransfers).toBe(-20_000);
    expect(line.otherMovements).toBe(0); // le transfert n'y figure pas
    expect(line.netCaisseFlow).toBe(50_000); // = savings + otherMovements, jamais internalTransfers
  });
});

describe('memberFinancialPosition — multi-tenant / statuts de transaction', () => {
  it('21. isolation tenant — un membre homonyme d’un autre tenant n’apparaît jamais', () => {
    const accountT1 = makeCashbox({ id: 'AC-T1', cashboxNumber: 'CX-T1', tenantId: 'T-1' });
    const ctx = makeCtx({
      cashboxes: [accountT1], // ctxForTenant('T-1') ne fournirait jamais de caisse T-2
      memberships: [makeMembership({ cashboxId: 'AC-T1', tenantId: 'T-1' }), makeMembership({ cashboxId: 'AC-OTHER', tenantId: 'T-2' })],
    });
    const result = memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01');
    expect(result.byCashbox.map((l) => l.cashboxId)).toEqual(['AC-T1']); // jamais AC-OTHER (T-2, absent de ctx.cashboxes de toute façon)
  });

  it('26. transactions pending/cancelled — jamais dans savings ni otherMovements', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({
      cashboxes: [cashbox],
      memberships: [makeMembership({ cashboxId: 'AC-A' })],
      transactions: [
        makeTransaction({ memberId: 'M-1', destination: 'CX-A', type: 'credit', category: 'EPARGNE', amount: 50_000, date: '2026-05-01', status: 'completed' }),
        makeTransaction({ memberId: 'M-1', destination: 'CX-A', type: 'credit', category: 'EPARGNE', amount: 999_000, date: '2026-05-02', status: 'pending' }),
        makeTransaction({ memberId: 'M-1', destination: 'CX-A', type: 'credit', category: 'EPARGNE', amount: 888_000, date: '2026-05-03', status: 'cancelled' }),
      ],
    });
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2026-06-01').savings).toBe(50_000);
  });
});

describe('memberFinancialPosition — exercice fiscal / opening-closing (étape 6)', () => {
  it('24. traversée d’exercice fiscal — aucun reset artificiel, cumul continu', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({
      cashboxes: [cashbox],
      memberships: [makeMembership({ cashboxId: 'AC-A' })],
      transactions: [
        makeTransaction({ memberId: 'M-1', destination: 'CX-A', type: 'credit', category: 'EPARGNE', amount: 40_000, date: '2026-11-01' }),
        makeTransaction({ memberId: 'M-1', destination: 'CX-A', type: 'credit', category: 'EPARGNE', amount: 30_000, date: '2027-02-01' }),
      ],
    });
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2026-12-31').savings).toBe(40_000);
    expect(memberFinancialPosition(ALL('M-1'), ctx, '2027-03-01').savings).toBe(70_000); // cumul, pas de reset au 01/01/2027
  });

  it('25. présence d’OpeningEntry/ClosingEntry sur la caisse — aucun impact sur la position membre (opening membre = 0, toujours)', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A', openingBalance: 5_000_000 });
    const withOpening = makeCtx({
      cashboxes: [cashbox],
      memberships: [makeMembership({ cashboxId: 'AC-A' })],
      transactions: [makeTransaction({ memberId: 'M-1', destination: 'CX-A', type: 'credit', category: 'EPARGNE', amount: 40_000, date: '2026-05-01' })],
      openingEntries: [makeOpeningEntry({ cashboxId: 'AC-A', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 999_999_999 })],
      closingEntries: [makeClosingEntry({ cashboxId: 'AC-A', fiscalYearId: 'FY-1', amount: 5_040_000 })],
    });
    // Même à une date où l'OpeningEntry (montant énorme) serait applicable côté caisse, la position membre l'ignore totalement.
    const result = memberFinancialPosition(ALL('M-1'), withOpening, '2027-06-01');
    expect(result.savings).toBe(40_000);
    expect(result.byCashbox[0].savings).toBe(40_000);
  });
});

describe('memberFinancialPositions — batch', () => {
  it('un résultat par membre, même scope', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({
      cashboxes: [cashbox],
      memberships: [makeMembership({ cashboxId: 'AC-A', memberId: 'M-1' }), makeMembership({ cashboxId: 'AC-A', memberId: 'M-2' })],
      transactions: [makeTransaction({ memberId: 'M-1', destination: 'CX-A', type: 'credit', category: 'EPARGNE', amount: 10_000, date: '2026-05-01' })],
    });
    const results = memberFinancialPositions(['M-1', 'M-2'], undefined, ctx, '2026-06-01');
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.scopeKey.includes('M-1'))!.savings).toBe(10_000);
    expect(results.find((r) => r.scopeKey.includes('M-2'))!.savings).toBe(0);
  });

  it('cashboxId fourni → scope MEMBER_CASHBOX pour chaque membre', () => {
    const cashbox = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A' });
    const ctx = makeCtx({ cashboxes: [cashbox], memberships: [makeMembership({ cashboxId: 'AC-A', memberId: 'M-1' })] });
    const results = memberFinancialPositions(['M-1'], 'AC-A', ctx, '2026-06-01');
    expect(results[0].credit).toBeUndefined();
    expect(results[0].byCashbox).toHaveLength(1);
  });
});
