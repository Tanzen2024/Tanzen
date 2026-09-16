import { describe, it, expect } from 'vitest';
import { balanceAsOf } from './balance';
import { makeAccount, makeCtx, makeMembership, makeOpeningEntry, makeTransaction } from './__fixtures__/factories';
import type { FinanceCtx } from './types';
import { accounts as seedAccounts, resolveAccount } from '@/mocks/finance/accounts';
import { transactions as seedTransactions } from '@/mocks/finance/transactions';
import { accountMemberships as seedMemberships } from '@/mocks/finance/account-memberships';

/** Contexte tenant-scopé à partir du seed réel — LECTURE SEULE dans ces tests. */
function seedCtx(tenantId: string): FinanceCtx {
  return {
    accounts: seedAccounts.filter((a) => a.tenantId === tenantId),
    transactions: seedTransactions.filter((t) => t.tenantId === tenantId),
    memberships: seedMemberships.filter((m) => m.tenantId === tenantId),
  };
}

const ACCOUNT = (accountId: string) => ({ kind: 'ACCOUNT' as const, accountId });
const TENANT = { kind: 'TENANT_ALL_ACCOUNTS' as const };

describe('balanceAsOf — ACCOUNT (solde comptable de la caisse)', () => {
  it('1. avant toute transaction → solde = report d’ouverture', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 100_000 });
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-10' })],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-01-01').total).toBe(100_000);
  });

  it('2. exactement à la date d’une transaction → elle EST comptée (borne inclusive)', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-10' })],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-06-10').total).toBe(50_000);
  });

  it('3. juste avant la date d’une transaction → elle n’est PAS comptée', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-10' })],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-06-09').total).toBe(0);
  });

  it('4. après plusieurs transactions → report + Σ crédits − Σ débits', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 100_000 });
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 100_000, date: '2026-06-01' }),
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-05' }),
        makeTransaction({ tenantId: 'T-1', fromAccount: 'CX-1', toAccount: 'TIERS', type: 'debit', amount: 20_000, date: '2026-06-08' }),
      ],
    });
    const result = balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-06-30');
    expect(result.total).toBe(230_000);
    expect(result.byAccount[0]).toMatchObject({ opening: 100_000, credits: 150_000, debits: 20_000, balance: 230_000 });
  });

  it('5. transaction CANCELLED ignorée', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-01', status: 'completed' }),
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 30_000, date: '2026-06-02', status: 'cancelled' }),
      ],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-06-30').total).toBe(50_000);
  });

  it('6. transaction PENDING ignorée', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-01', status: 'completed' }),
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 20_000, date: '2026-06-02', status: 'pending' }),
      ],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-06-30').total).toBe(50_000);
  });

  it('19. caisse inconnue → outOfScope, total 0', () => {
    const ctx = makeCtx({ accounts: [makeAccount({ id: 'AC-1' })] });
    const result = balanceAsOf(ACCOUNT('AC-NOPE'), ctx, '2026-06-30');
    expect(result.total).toBe(0);
    expect(result.outOfScope).toBe(true);
    expect(result.byAccount).toEqual([]);
  });
});

describe('balanceAsOf — TENANT_ALL_ACCOUNTS', () => {
  it('8. total = somme des soldes des caisses du tenant', () => {
    const a = makeAccount({ id: 'AC-A', accountNumber: 'CX-A', openingBalance: 1_000_000 });
    const b = makeAccount({ id: 'AC-B', accountNumber: 'CX-B', openingBalance: 500_000 });
    const ctx = makeCtx({
      accounts: [a, b],
      transactions: [
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-A', type: 'credit', amount: 200_000, date: '2026-05-01' }),
        makeTransaction({ tenantId: 'T-1', fromAccount: 'CX-B', toAccount: 'TIERS', type: 'debit', amount: 100_000, date: '2026-05-02' }),
      ],
    });
    expect(balanceAsOf(TENANT, ctx, '2026-12-31').total).toBe(1_600_000);
  });

  it('9. virement inter-caisses : ±montant par caisse, IMPACT CONSOLIDÉ NUL (comportement actuel, sans marqueur)', () => {
    const src = makeAccount({ id: 'AC-SRC', accountNumber: 'CX-SRC', openingBalance: 1_000_000 });
    const dst = makeAccount({ id: 'AC-DST', accountNumber: 'CX-DST', openingBalance: 1_000_000 });
    const ctx = makeCtx({
      accounts: [src, dst],
      // écriture unique : DÉBIT dans le journal du tenant (perspective émettrice)
      transactions: [makeTransaction({ tenantId: 'T-1', fromAccount: 'CX-SRC', toAccount: 'CX-DST', type: 'debit', amount: 500_000, date: '2026-05-01' })],
    });
    const result = balanceAsOf(TENANT, ctx, '2026-12-31');
    expect(result.byAccount.find((l) => l.accountId === 'AC-SRC')!.balance).toBe(500_000);
    expect(result.byAccount.find((l) => l.accountId === 'AC-DST')!.balance).toBe(1_500_000);
    expect(result.total).toBe(2_000_000); // 1M + 1M — le virement ne change pas le patrimoine consolidé
  });

  it('7. + 18. isolation : le ctx ne contient que le tenant demandé, aucune fuite', () => {
    // le ctx est déjà tenant-scopé par le service ; ici on prouve qu'une transaction
    // marquée d'un autre tenant (cas défensif) n'est de toute façon pas comptée.
    const caisse = makeAccount({ id: 'AC-1', tenantId: 'T-1', accountNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-01' }),
        makeTransaction({ tenantId: 'T-2', toAccount: 'CX-1', type: 'credit', amount: 999_000, date: '2026-06-02' }),
      ],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-12-31').total).toBe(50_000);
  });
});

describe('balanceAsOf — scopes membre (flux net cumulé, PAS une position)', () => {
  // Jean (M-J) : Trésorerie 01/01→31/03 (clôturée), Épargne 01/04→ , Projet 01/04→ (sans transaction)
  const tresorerie = makeAccount({ id: 'AC-T', accountNumber: 'CX-T', openingBalance: 9_000_000 });
  const epargne = makeAccount({ id: 'AC-E', accountNumber: 'CX-E', openingBalance: 0 });
  const projet = makeAccount({ id: 'AC-P', accountNumber: 'CX-P', openingBalance: 0 });
  const solidarite = makeAccount({ id: 'AC-S', accountNumber: 'CX-S', openingBalance: 0 });
  const jeanCtx = makeCtx({
    accounts: [tresorerie, epargne, projet, solidarite],
    memberships: [
      makeMembership({ id: 'AM-T', accountId: 'AC-T', memberId: 'M-J', startDate: '2026-01-01', endDate: '2026-03-31', status: 'ended' }),
      makeMembership({ id: 'AM-E', accountId: 'AC-E', memberId: 'M-J', startDate: '2026-04-01', endDate: null }),
      makeMembership({ id: 'AM-P', accountId: 'AC-P', memberId: 'M-J', startDate: '2026-04-01', endDate: null }),
    ],
    transactions: [
      makeTransaction({ id: 'TR-1', tenantId: 'T-1', memberId: 'M-J', fromAccount: 'M-J', toAccount: 'CX-E', type: 'credit', amount: 50_000, date: '2026-05-10' }),
      makeTransaction({ id: 'TR-2', tenantId: 'T-1', memberId: 'M-J', fromAccount: 'CX-T', toAccount: 'M-J', type: 'debit', amount: 200_000, date: '2026-02-10' }),
      // transaction d'un AUTRE membre sur Épargne — ne doit jamais compter pour M-J
      makeTransaction({ id: 'TR-3', tenantId: 'T-1', memberId: 'M-OTHER', fromAccount: 'M-OTHER', toAccount: 'CX-E', type: 'credit', amount: 999_000, date: '2026-05-11' }),
    ],
  });

  it('10. + 12. MEMBER_ALL_ACCOUNTS → uniquement les caisses adhérées À LA DATE', () => {
    expect(balanceAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-J' }, jeanCtx, '2026-02-15').byAccount.map((l) => l.accountId)).toEqual(['AC-T']);
    expect(balanceAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-J' }, jeanCtx, '2026-05-15').byAccount.map((l) => l.accountId)).toEqual(['AC-E', 'AC-P']);
  });

  it('11. caisse adhérée SANS transaction → présente avec 0', () => {
    const line = balanceAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-J' }, jeanCtx, '2026-05-15').byAccount.find((l) => l.accountId === 'AC-P');
    expect(line).toMatchObject({ opening: 0, credits: 0, debits: 0, balance: 0 });
  });

  it('opening vaut 0 pour un scope membre (le report d’ouverture n’appartient pas au membre)', () => {
    const line = balanceAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-J' }, jeanCtx, '2026-06-30').byAccount.find((l) => l.accountId === 'AC-E');
    expect(line!.opening).toBe(0);
  });

  it('ne compte QUE les transactions du membre, sur les jours d’adhésion active', () => {
    // au 30/06 : périmètre {AC-E, AC-P}. TR-1 (+50k sur AC-E, 10/05, adhésion active). TR-3 est M-OTHER → ignoré.
    const result = balanceAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-J' }, jeanCtx, '2026-06-30');
    expect(result.byAccount.find((l) => l.accountId === 'AC-E')!.balance).toBe(50_000);
    expect(result.total).toBe(50_000);
  });

  it('une transaction hors fenêtre d’adhésion n’est pas rattachée (Trésorerie quittée le 31/03)', () => {
    // TR-2 (débit 200k sur CX-T, 10/02) — dans la fenêtre d'adhésion Trésorerie
    const feb = balanceAsOf({ kind: 'MEMBER_ACCOUNT', memberId: 'M-J', accountId: 'AC-T' }, jeanCtx, '2026-02-28');
    expect(feb.total).toBe(-200_000);
    // au 15/05, M-J n'est plus adhérent de Trésorerie → outOfScope, la transaction de février ne "revient" pas
    const may = balanceAsOf({ kind: 'MEMBER_ACCOUNT', memberId: 'M-J', accountId: 'AC-T' }, jeanCtx, '2026-05-15');
    expect(may.outOfScope).toBe(true);
    expect(may.total).toBe(0);
  });

  it('14. MEMBER_ACCOUNT — membre adhérent à la date → résultat', () => {
    const result = balanceAsOf({ kind: 'MEMBER_ACCOUNT', memberId: 'M-J', accountId: 'AC-E' }, jeanCtx, '2026-05-15');
    expect(result.outOfScope).toBe(false);
    expect(result.total).toBe(50_000);
    expect(result.byAccount[0].memberSince).toBe('2026-04-01');
  });

  it('15. MEMBER_ACCOUNT — non membre à la date → résultat vide cohérent', () => {
    const result = balanceAsOf({ kind: 'MEMBER_ACCOUNT', memberId: 'M-J', accountId: 'AC-S' }, jeanCtx, '2026-05-15');
    expect(result.outOfScope).toBe(true);
    expect(result.total).toBe(0);
    expect(result.byAccount).toEqual([]);
  });

  it('16. borne inclusive — startDate d’adhésion : le membre EST adhérent ce jour-là', () => {
    expect(balanceAsOf({ kind: 'MEMBER_ACCOUNT', memberId: 'M-J', accountId: 'AC-E' }, jeanCtx, '2026-04-01').outOfScope).toBe(false);
  });

  it('17. borne inclusive — endDate d’adhésion clôturée : le membre EST encore adhérent ce jour-là', () => {
    expect(balanceAsOf({ kind: 'MEMBER_ACCOUNT', memberId: 'M-J', accountId: 'AC-T' }, jeanCtx, '2026-03-31').outOfScope).toBe(false);
    expect(balanceAsOf({ kind: 'MEMBER_ACCOUNT', memberId: 'M-J', accountId: 'AC-T' }, jeanCtx, '2026-04-01').outOfScope).toBe(true);
  });

  it('MEMBER_ALL_ACCOUNTS — aucune adhésion à la date → outOfScope', () => {
    const result = balanceAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-J' }, jeanCtx, '2025-06-01');
    expect(result.outOfScope).toBe(true);
    expect(result.total).toBe(0);
  });
});

describe('balanceAsOf — seed réel T-001 (Fatou / Cheikh)', () => {
  const t001 = seedCtx('T-001');

  it('12. Cheikh (M-006) — voyage temporel : {Trésorerie, Épargne} au 15/05, {Trésorerie} au 15/08', () => {
    expect(balanceAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-006' }, t001, '2026-05-15').byAccount.map((l) => l.accountId).sort()).toEqual(['AC-001', 'AC-002']);
    expect(balanceAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-006' }, t001, '2026-08-15').byAccount.map((l) => l.accountId)).toEqual(['AC-001']);
  });

  it('13. Fatou (M-001) — Secours (AC-011) apparaît dès le 01/08, même sans transaction (à 0)', () => {
    const before = balanceAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-001' }, t001, '2026-07-31');
    expect(before.byAccount.map((l) => l.accountId)).not.toContain('AC-011');

    const after = balanceAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-001' }, t001, '2026-08-05');
    const secours = after.byAccount.find((l) => l.accountId === 'AC-011');
    expect(secours).toMatchObject({ balance: 0, credits: 0, debits: 0 });
  });

  it('20. RÉGRESSION — balanceAsOf(ACCOUNT, date lointaine).total === resolveAccount(...).balance', () => {
    for (const record of t001.accounts) {
      const viaEngine = balanceAsOf(ACCOUNT(record.id), t001, '2099-12-31').total;
      const viaResolve = resolveAccount(record, seedTransactions).balance;
      expect(viaEngine).toBe(viaResolve);
    }
    // valeurs connues (audit / account-balance.test.ts) — inchangées
    expect(balanceAsOf(ACCOUNT('AC-001'), t001, '2099-12-31').total).toBe(12_500_000);
    expect(balanceAsOf(TENANT, t001, '2099-12-31').total).toBe(24_450_000);
  });

  it('18. tenant T-002 — aucune caisse ni membre de T-001', () => {
    const t002 = seedCtx('T-002');
    const result = balanceAsOf(TENANT, t002, '2099-12-31');
    expect(result.byAccount.every((l) => l.accountId === 'AC-004' || l.accountId === 'AC-005' || l.accountId === 'AC-016')).toBe(true);
    // un membre de T-001 n'existe pas dans le ctx T-002 → MEMBER_ACCOUNT outOfScope
    expect(balanceAsOf({ kind: 'MEMBER_ACCOUNT', memberId: 'M-001', accountId: 'AC-004' }, t002, '2099-12-31').outOfScope).toBe(true);
  });
});

describe('balanceAsOf — baseline OpeningEntry (étape 6, non-régression + nouveau comportement)', () => {
  it('RÉGRESSION — ctx.openingEntries absent → comportement legacy strictement inchangé', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 100_000 });
    const ctx = makeCtx({ accounts: [caisse], transactions: [] }); // pas de openingEntries du tout
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2020-01-01').total).toBe(100_000); // "valable à toute date", même très en amont
  });

  it('RÉGRESSION — openingEntries vide → identique à absent', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 100_000 });
    const ctx = makeCtx({ accounts: [caisse], transactions: [], openingEntries: [] });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2020-01-01').total).toBe(100_000);
  });

  it('une OpeningEntry FINAL applicable devient la baseline (remplace openingBalance)', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 999_999 }); // ignoré une fois l'OpeningEntry active
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [],
      openingEntries: [makeOpeningEntry({ accountId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000 })],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2027-06-30').total).toBe(230_000);
  });

  it('AVANT la date de l’OpeningEntry → fallback legacy (openingBalance), l’OpeningEntry ne s’applique pas encore', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 100_000 });
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [],
      openingEntries: [makeOpeningEntry({ accountId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000 })],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-12-31').total).toBe(100_000);
  });

  it('floorDate — une transaction datée AVANT l’OpeningEntry (exercice précédent) n’est jamais recomptée', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [
        // déjà absorbée dans le montant de l'OpeningEntry (exercice N, clôturé)
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 500_000, date: '2026-06-01' }),
        // exercice N+1, après l'OpeningEntry
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 50_000, date: '2027-02-01' }),
      ],
      openingEntries: [makeOpeningEntry({ accountId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000 })],
    });
    // 230 000 (opening) + 50 000 (seule la transaction de 2027) — PAS + 500 000 (déjà dans les 230 000)
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2027-12-31').total).toBe(280_000);
  });

  it('plusieurs OpeningEntry (une par exercice) → la plus récente ≤ asOfDate est choisie', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [],
      openingEntries: [
        makeOpeningEntry({ id: 'OE-2027', accountId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000 }),
        makeOpeningEntry({ id: 'OE-2028', accountId: 'AC-1', fiscalYearId: 'FY-2028', date: '2028-01-01', amount: 500_000 }),
      ],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2027-06-30').total).toBe(230_000);
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2028-06-30').total).toBe(500_000);
  });

  it('une OpeningEntry SUPERSEDED est ignorée — retombe sur la précédente FINAL applicable', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [],
      openingEntries: [
        makeOpeningEntry({ id: 'OE-2027', accountId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000, status: 'SUPERSEDED' }),
        makeOpeningEntry({ id: 'OE-2027-BIS', accountId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 250_000, status: 'FINAL' }),
      ],
    });
    expect(balanceAsOf(ACCOUNT('AC-1'), ctx, '2027-06-30').total).toBe(250_000);
  });

  it('scope membre — opening reste 0 même quand une OpeningEntry existe pour la caisse (branche membre intouchée)', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      accounts: [caisse],
      memberships: [makeMembership({ accountId: 'AC-1', memberId: 'M-1', startDate: '2026-01-01', endDate: null })],
      transactions: [],
      openingEntries: [makeOpeningEntry({ accountId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000 })],
    });
    const line = balanceAsOf({ kind: 'MEMBER_ACCOUNT', memberId: 'M-1', accountId: 'AC-1' }, ctx, '2027-06-30').byAccount[0];
    expect(line.opening).toBe(0);
  });
});
