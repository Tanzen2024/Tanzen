import { describe, it, expect } from 'vitest';
import { balanceAsOf } from './balance';
import { makeCashbox, makeCtx, makeMembership, makeOpeningEntry, makeTransaction } from './__fixtures__/factories';
import type { FinanceCtx } from './types';
import { cashboxes as seedCashboxes, resolveCashbox } from '@/mocks/finance/cashboxes';
import { transactions as seedTransactions } from '@/mocks/finance/transactions';
import { cashboxMemberships as seedMemberships } from '@/mocks/finance/cashbox-memberships';

/** Contexte tenant-scopé à partir du seed réel — LECTURE SEULE dans ces tests. */
function seedCtx(tenantId: string): FinanceCtx {
  return {
    cashboxes: seedCashboxes.filter((a) => a.tenantId === tenantId),
    transactions: seedTransactions.filter((t) => t.tenantId === tenantId),
    memberships: seedMemberships.filter((m) => m.tenantId === tenantId),
  };
}

const ACCOUNT = (cashboxId: string) => ({ kind: 'CASHBOX' as const, cashboxId });
const TENANT = { kind: 'TENANT_ALL_CASHBOXES' as const };

describe('balanceAsOf — ACCOUNT (solde comptable de la caisse)', () => {
  it('1. avant toute transaction → solde = report d’ouverture', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 100_000 });
    const ctx = makeCtx({
      cashboxes: [caisse],
      transactions: [makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-10' })],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-01-01').total).toBe(100_000);
  });

  it('2. exactement à la date d’une transaction → elle EST comptée (borne inclusive)', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      cashboxes: [caisse],
      transactions: [makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-10' })],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-06-10').total).toBe(50_000);
  });

  it('3. juste avant la date d’une transaction → elle n’est PAS comptée', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      cashboxes: [caisse],
      transactions: [makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-10' })],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-06-09').total).toBe(0);
  });

  it('4. après plusieurs transactions → report + Σ crédits − Σ débits', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 100_000 });
    const ctx = makeCtx({
      cashboxes: [caisse],
      transactions: [
        makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 100_000, date: '2026-06-01' }),
        makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-05' }),
        makeTransaction({ tenantId: 'T-1', source: 'CX-1', destination: 'TIERS', type: 'debit', amount: 20_000, date: '2026-06-08' }),
      ],
    });
    const result = balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-06-30');
    expect(result.total).toBe(230_000);
    expect(result.byCashbox[0]).toMatchObject({ opening: 100_000, credits: 150_000, debits: 20_000, balance: 230_000 });
  });

  it('5. transaction CANCELLED ignorée', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      cashboxes: [caisse],
      transactions: [
        makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-01', status: 'completed' }),
        makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 30_000, date: '2026-06-02', status: 'cancelled' }),
      ],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-06-30').total).toBe(50_000);
  });

  it('6. transaction PENDING ignorée', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      cashboxes: [caisse],
      transactions: [
        makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-01', status: 'completed' }),
        makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 20_000, date: '2026-06-02', status: 'pending' }),
      ],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-06-30').total).toBe(50_000);
  });

  it('19. caisse inconnue → outOfScope, total 0', () => {
    const ctx = makeCtx({ cashboxes: [makeCashbox({ id: 'AC-1' })] });
    const result = balanceAsOf(ACCOUNT('AC-NOPE'), ctx, '2026-06-30');
    expect(result.total).toBe(0);
    expect(result.outOfScope).toBe(true);
    expect(result.byCashbox).toEqual([]);
  });
});

describe('balanceAsOf — TENANT_ALL_CASHBOXES', () => {
  it('8. total = somme des soldes des caisses du tenant', () => {
    const a = makeCashbox({ id: 'AC-A', cashboxNumber: 'CX-A', openingBalance: 1_000_000 });
    const b = makeCashbox({ id: 'AC-B', cashboxNumber: 'CX-B', openingBalance: 500_000 });
    const ctx = makeCtx({
      cashboxes: [a, b],
      transactions: [
        makeTransaction({ tenantId: 'T-1', destination: 'CX-A', type: 'credit', amount: 200_000, date: '2026-05-01' }),
        makeTransaction({ tenantId: 'T-1', source: 'CX-B', destination: 'TIERS', type: 'debit', amount: 100_000, date: '2026-05-02' }),
      ],
    });
    expect(balanceAsOf(TENANT, ctx, '2026-12-31').total).toBe(1_600_000);
  });

  it('9. virement inter-caisses : ±montant par caisse, IMPACT CONSOLIDÉ NUL (comportement actuel, sans marqueur)', () => {
    const src = makeCashbox({ id: 'AC-SRC', cashboxNumber: 'CX-SRC', openingBalance: 1_000_000 });
    const dst = makeCashbox({ id: 'AC-DST', cashboxNumber: 'CX-DST', openingBalance: 1_000_000 });
    const ctx = makeCtx({
      cashboxes: [src, dst],
      // écriture unique : DÉBIT dans le journal du tenant (perspective émettrice)
      transactions: [makeTransaction({ tenantId: 'T-1', source: 'CX-SRC', destination: 'CX-DST', type: 'debit', amount: 500_000, date: '2026-05-01' })],
    });
    const result = balanceAsOf(TENANT, ctx, '2026-12-31');
    expect(result.byCashbox.find((l) => l.cashboxId === 'AC-SRC')!.balance).toBe(500_000);
    expect(result.byCashbox.find((l) => l.cashboxId === 'AC-DST')!.balance).toBe(1_500_000);
    expect(result.total).toBe(2_000_000); // 1M + 1M — le virement ne change pas le patrimoine consolidé
  });

  it('7. + 18. isolation : le ctx ne contient que le tenant demandé, aucune fuite', () => {
    // le ctx est déjà tenant-scopé par le service ; ici on prouve qu'une transaction
    // marquée d'un autre tenant (cas défensif) n'est de toute façon pas comptée.
    const caisse = makeCashbox({ id: 'AC-1', tenantId: 'T-1', cashboxNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      cashboxes: [caisse],
      transactions: [
        makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-01' }),
        makeTransaction({ tenantId: 'T-2', destination: 'CX-1', type: 'credit', amount: 999_000, date: '2026-06-02' }),
      ],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-12-31').total).toBe(50_000);
  });
});

describe('balanceAsOf — scopes membre (flux net cumulé, PAS une position)', () => {
  // Jean (M-J) : Trésorerie 01/01→31/03 (clôturée), Épargne 01/04→ , Projet 01/04→ (sans transaction)
  const tresorerie = makeCashbox({ id: 'AC-T', cashboxNumber: 'CX-T', openingBalance: 9_000_000 });
  const epargne = makeCashbox({ id: 'AC-E', cashboxNumber: 'CX-E', openingBalance: 0 });
  const projet = makeCashbox({ id: 'AC-P', cashboxNumber: 'CX-P', openingBalance: 0 });
  const solidarite = makeCashbox({ id: 'AC-S', cashboxNumber: 'CX-S', openingBalance: 0 });
  const jeanCtx = makeCtx({
    cashboxes: [tresorerie, epargne, projet, solidarite],
    memberships: [
      makeMembership({ id: 'AM-T', cashboxId: 'AC-T', memberId: 'M-J', startDate: '2026-01-01', endDate: '2026-03-31', status: 'ended' }),
      makeMembership({ id: 'AM-E', cashboxId: 'AC-E', memberId: 'M-J', startDate: '2026-04-01', endDate: null }),
      makeMembership({ id: 'AM-P', cashboxId: 'AC-P', memberId: 'M-J', startDate: '2026-04-01', endDate: null }),
    ],
    transactions: [
      makeTransaction({ id: 'TR-1', tenantId: 'T-1', memberId: 'M-J', source: 'M-J', destination: 'CX-E', type: 'credit', amount: 50_000, date: '2026-05-10' }),
      makeTransaction({ id: 'TR-2', tenantId: 'T-1', memberId: 'M-J', source: 'CX-T', destination: 'M-J', type: 'debit', amount: 200_000, date: '2026-02-10' }),
      // transaction d'un AUTRE membre sur Épargne — ne doit jamais compter pour M-J
      makeTransaction({ id: 'TR-3', tenantId: 'T-1', memberId: 'M-OTHER', source: 'M-OTHER', destination: 'CX-E', type: 'credit', amount: 999_000, date: '2026-05-11' }),
    ],
  });

  it('10. + 12. MEMBER_ALL_CASHBOXES → uniquement les caisses adhérées À LA DATE', () => {
    expect(balanceAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-J' }, jeanCtx, '2026-02-15').byCashbox.map((l) => l.cashboxId)).toEqual(['AC-T']);
    expect(balanceAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-J' }, jeanCtx, '2026-05-15').byCashbox.map((l) => l.cashboxId)).toEqual(['AC-E', 'AC-P']);
  });

  it('11. caisse adhérée SANS transaction → présente avec 0', () => {
    const line = balanceAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-J' }, jeanCtx, '2026-05-15').byCashbox.find((l) => l.cashboxId === 'AC-P');
    expect(line).toMatchObject({ opening: 0, credits: 0, debits: 0, balance: 0 });
  });

  it('opening vaut 0 pour un scope membre (le report d’ouverture n’appartient pas au membre)', () => {
    const line = balanceAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-J' }, jeanCtx, '2026-06-30').byCashbox.find((l) => l.cashboxId === 'AC-E');
    expect(line!.opening).toBe(0);
  });

  it('ne compte QUE les transactions du membre, sur les jours d’adhésion active', () => {
    // au 30/06 : périmètre {AC-E, AC-P}. TR-1 (+50k sur AC-E, 10/05, adhésion active). TR-3 est M-OTHER → ignoré.
    const result = balanceAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-J' }, jeanCtx, '2026-06-30');
    expect(result.byCashbox.find((l) => l.cashboxId === 'AC-E')!.balance).toBe(50_000);
    expect(result.total).toBe(50_000);
  });

  it('une transaction hors fenêtre d’adhésion n’est pas rattachée (Trésorerie quittée le 31/03)', () => {
    // TR-2 (débit 200k sur CX-T, 10/02) — dans la fenêtre d'adhésion Trésorerie
    const feb = balanceAsOf({ kind: 'MEMBER_CASHBOX', memberId: 'M-J', cashboxId: 'AC-T' }, jeanCtx, '2026-02-28');
    expect(feb.total).toBe(-200_000);
    // au 15/05, M-J n'est plus adhérent de Trésorerie → outOfScope, la transaction de février ne "revient" pas
    const may = balanceAsOf({ kind: 'MEMBER_CASHBOX', memberId: 'M-J', cashboxId: 'AC-T' }, jeanCtx, '2026-05-15');
    expect(may.outOfScope).toBe(true);
    expect(may.total).toBe(0);
  });

  it('14. MEMBER_CASHBOX — membre adhérent à la date → résultat', () => {
    const result = balanceAsOf({ kind: 'MEMBER_CASHBOX', memberId: 'M-J', cashboxId: 'AC-E' }, jeanCtx, '2026-05-15');
    expect(result.outOfScope).toBe(false);
    expect(result.total).toBe(50_000);
    expect(result.byCashbox[0].memberSince).toBe('2026-04-01');
  });

  it('15. MEMBER_CASHBOX — non membre à la date → résultat vide cohérent', () => {
    const result = balanceAsOf({ kind: 'MEMBER_CASHBOX', memberId: 'M-J', cashboxId: 'AC-S' }, jeanCtx, '2026-05-15');
    expect(result.outOfScope).toBe(true);
    expect(result.total).toBe(0);
    expect(result.byCashbox).toEqual([]);
  });

  it('16. borne inclusive — startDate d’adhésion : le membre EST adhérent ce jour-là', () => {
    expect(balanceAsOf({ kind: 'MEMBER_CASHBOX', memberId: 'M-J', cashboxId: 'AC-E' }, jeanCtx, '2026-04-01').outOfScope).toBe(false);
  });

  it('17. borne inclusive — endDate d’adhésion clôturée : le membre EST encore adhérent ce jour-là', () => {
    expect(balanceAsOf({ kind: 'MEMBER_CASHBOX', memberId: 'M-J', cashboxId: 'AC-T' }, jeanCtx, '2026-03-31').outOfScope).toBe(false);
    expect(balanceAsOf({ kind: 'MEMBER_CASHBOX', memberId: 'M-J', cashboxId: 'AC-T' }, jeanCtx, '2026-04-01').outOfScope).toBe(true);
  });

  it('MEMBER_ALL_CASHBOXES — aucune adhésion à la date → outOfScope', () => {
    const result = balanceAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-J' }, jeanCtx, '2025-06-01');
    expect(result.outOfScope).toBe(true);
    expect(result.total).toBe(0);
  });
});

describe('balanceAsOf — seed réel T-001 (Fatou / Cheikh)', () => {
  const t001 = seedCtx('T-001');

  it('12. Cheikh (M-006) — voyage temporel : {Transport, Épargne} au 15/08, {Transport} au 15/09', () => {
    expect(balanceAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-006' }, t001, '2026-08-15').byCashbox.map((l) => l.cashboxId).sort()).toEqual(['AC-009', 'AC-012']);
    expect(balanceAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-006' }, t001, '2026-09-15').byCashbox.map((l) => l.cashboxId)).toEqual(['AC-012']);
  });

  it('13. Fatou (M-001) — Secours (AC-011) apparaît dès le 01/08, même sans transaction (à 0)', () => {
    const before = balanceAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-001' }, t001, '2026-07-31');
    expect(before.byCashbox.map((l) => l.cashboxId)).not.toContain('AC-011');

    const after = balanceAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-001' }, t001, '2026-08-05');
    const secours = after.byCashbox.find((l) => l.cashboxId === 'AC-011');
    expect(secours).toMatchObject({ balance: 0, credits: 0, debits: 0 });
  });

  it('20. RÉGRESSION — balanceAsOf(ACCOUNT, date lointaine).total === resolveCashbox(...).balance', () => {
    for (const record of t001.cashboxes) {
      const viaEngine = balanceAsOf(ACCOUNT(record.id), t001, '2099-12-31').total;
      const viaResolve = resolveCashbox(record, seedTransactions).balance;
      expect(viaEngine).toBe(viaResolve);
    }
    // valeurs connues du jeu de démonstration (cf. cashbox-balance.test.ts)
    expect(balanceAsOf(ACCOUNT('AC-012'), t001, '2099-12-31').total).toBe(3_000);
    // Épargne 8 085 000 + Inscription 1 000 + Secours 16 000 + Transport 3 000 + Achat tontine 0
    expect(balanceAsOf(TENANT, t001, '2099-12-31').total).toBe(8_105_000);
  });

  it('18. tenant T-002 — aucune caisse ni membre de T-001', () => {
    const t002 = seedCtx('T-002');
    const result = balanceAsOf(TENANT, t002, '2099-12-31');
    expect(result.byCashbox.every((l) => l.cashboxId === 'AC-004' || l.cashboxId === 'AC-005' || l.cashboxId === 'AC-016')).toBe(true);
    // un membre de T-001 n'existe pas dans le ctx T-002 → MEMBER_CASHBOX outOfScope
    expect(balanceAsOf({ kind: 'MEMBER_CASHBOX', memberId: 'M-001', cashboxId: 'AC-004' }, t002, '2099-12-31').outOfScope).toBe(true);
  });
});

describe('balanceAsOf — baseline OpeningEntry (étape 6, non-régression + nouveau comportement)', () => {
  it('RÉGRESSION — ctx.openingEntries absent → comportement legacy strictement inchangé', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 100_000 });
    const ctx = makeCtx({ cashboxes: [caisse], transactions: [] }); // pas de openingEntries du tout
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2020-01-01').total).toBe(100_000); // "valable à toute date", même très en amont
  });

  it('RÉGRESSION — openingEntries vide → identique à absent', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 100_000 });
    const ctx = makeCtx({ cashboxes: [caisse], transactions: [], openingEntries: [] });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2020-01-01').total).toBe(100_000);
  });

  it('une OpeningEntry FINAL applicable devient la baseline (remplace openingBalance)', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 999_999 }); // ignoré une fois l'OpeningEntry active
    const ctx = makeCtx({
      cashboxes: [caisse],
      transactions: [],
      openingEntries: [makeOpeningEntry({ cashboxId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000 })],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2027-06-30').total).toBe(230_000);
  });

  it('AVANT la date de l’OpeningEntry → fallback legacy (openingBalance), l’OpeningEntry ne s’applique pas encore', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 100_000 });
    const ctx = makeCtx({
      cashboxes: [caisse],
      transactions: [],
      openingEntries: [makeOpeningEntry({ cashboxId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000 })],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-12-31').total).toBe(100_000);
  });

  it('floorDate — une transaction datée AVANT l’OpeningEntry (exercice précédent) n’est jamais recomptée', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      cashboxes: [caisse],
      transactions: [
        // déjà absorbée dans le montant de l'OpeningEntry (exercice N, clôturé)
        makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 500_000, date: '2026-06-01' }),
        // exercice N+1, après l'OpeningEntry
        makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 50_000, date: '2027-02-01' }),
      ],
      openingEntries: [makeOpeningEntry({ cashboxId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000 })],
    });
    // 230 000 (opening) + 50 000 (seule la transaction de 2027) — PAS + 500 000 (déjà dans les 230 000)
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2027-12-31').total).toBe(280_000);
  });

  it('plusieurs OpeningEntry (une par exercice) → la plus récente ≤ asOfDate est choisie', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      cashboxes: [caisse],
      transactions: [],
      openingEntries: [
        makeOpeningEntry({ id: 'OE-2027', cashboxId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000 }),
        makeOpeningEntry({ id: 'OE-2028', cashboxId: 'AC-1', fiscalYearId: 'FY-2028', date: '2028-01-01', amount: 500_000 }),
      ],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2027-06-30').total).toBe(230_000);
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2028-06-30').total).toBe(500_000);
  });

  it('une OpeningEntry SUPERSEDED est ignorée — retombe sur la précédente FINAL applicable', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      cashboxes: [caisse],
      transactions: [],
      openingEntries: [
        makeOpeningEntry({ id: 'OE-2027', cashboxId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000, status: 'SUPERSEDED' }),
        makeOpeningEntry({ id: 'OE-2027-BIS', cashboxId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 250_000, status: 'FINAL' }),
      ],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2027-06-30').total).toBe(250_000);
  });

  it('scope membre — opening reste 0 même quand une OpeningEntry existe pour la caisse (branche membre intouchée)', () => {
    const caisse = makeCashbox({ id: 'AC-1', cashboxNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      cashboxes: [caisse],
      memberships: [makeMembership({ cashboxId: 'AC-1', memberId: 'M-1', startDate: '2026-01-01', endDate: null })],
      transactions: [],
      openingEntries: [makeOpeningEntry({ cashboxId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000 })],
    });
    const line = balanceAsOf({ kind: 'MEMBER_CASHBOX', memberId: 'M-1', cashboxId: 'AC-1' }, ctx, '2027-06-30').byCashbox[0];
    expect(line.opening).toBe(0);
  });
});
