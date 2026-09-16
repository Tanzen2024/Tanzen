import { describe, it, expect } from 'vitest';
import { flows } from './flows';
import { balanceAsOf } from './balance';
import { makeAccount, makeCtx, makeMembership, makeTransaction } from './__fixtures__/factories';
import type { FinanceCtx } from './types';
import { accounts as seedAccounts } from '@/mocks/finance/accounts';
import { transactions as seedTransactions } from '@/mocks/finance/transactions';
import { accountMemberships as seedMemberships } from '@/mocks/finance/account-memberships';

function seedCtx(tenantId: string): FinanceCtx {
  return {
    accounts: seedAccounts.filter((a) => a.tenantId === tenantId),
    transactions: seedTransactions.filter((t) => t.tenantId === tenantId),
    memberships: seedMemberships.filter((m) => m.tenantId === tenantId),
  };
}

const TENANT = { kind: 'TENANT_ALL_ACCOUNTS' as const };
const ACCOUNT = (accountId: string) => ({ kind: 'ACCOUNT' as const, accountId });

describe('flows — période inclusive, completed only', () => {
  const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1' });
  const ctx = makeCtx({
    accounts: [caisse],
    transactions: [
      makeTransaction({ id: 'A', tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 100_000, date: '2026-05-01' }),
      makeTransaction({ id: 'B', tenantId: 'T-1', fromAccount: 'CX-1', toAccount: 'T', type: 'debit', amount: 30_000, date: '2026-05-15' }),
      makeTransaction({ id: 'C', tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 40_000, date: '2026-05-31' }),
      makeTransaction({ id: 'D', tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 999_000, date: '2026-06-01' }),
      makeTransaction({ id: 'P', tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 12_000, date: '2026-05-10', status: 'pending' }),
      makeTransaction({ id: 'X', tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 7_000, date: '2026-05-10', status: 'cancelled' }),
      makeTransaction({ id: 'OT', tenantId: 'T-2', toAccount: 'CX-1', type: 'credit', amount: 5_000, date: '2026-05-10' }),
    ],
  });

  it('bornes inclusives : la transaction du premier ET du dernier jour comptent', () => {
    const result = flows(TENANT, ctx, '2026-05-01', '2026-05-31');
    expect(result.transactionIds.sort()).toEqual(['A', 'B', 'C']);
  });

  it('exclut ce qui est hors fenêtre (01/06), pending, cancelled, autre tenant', () => {
    const result = flows(TENANT, ctx, '2026-05-01', '2026-05-31');
    expect(result.transactionIds).not.toContain('D');
    expect(result.transactionIds).not.toContain('P');
    expect(result.transactionIds).not.toContain('X');
    expect(result.transactionIds).not.toContain('OT');
  });

  it('totaux perspective journal (transaction.type) + compte', () => {
    const result = flows(TENANT, ctx, '2026-05-01', '2026-05-31');
    expect(result.totalCredit).toBe(140_000); // A + C
    expect(result.totalDebit).toBe(30_000); // B
    expect(result.count).toBe(3);
  });

  it('byAccount = perspective caisse (accountEntryEffect)', () => {
    const line = flows(TENANT, ctx, '2026-05-01', '2026-05-31').byAccount[0];
    expect(line).toMatchObject({ accountId: 'AC-1', credit: 140_000, debit: 30_000, count: 3 });
  });
});

describe('flows — SOLDE ≠ FLUX', () => {
  it('le flux d’une période ne masque pas les transactions, et n’est pas le solde de fin de période', () => {
    const caisse = makeAccount({ id: 'AC-1', accountNumber: 'CX-1', openingBalance: 1_000_000 });
    const ctx = makeCtx({
      accounts: [caisse],
      transactions: [
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 300_000, date: '2026-05-10' }),
        makeTransaction({ tenantId: 'T-1', fromAccount: 'CX-1', toAccount: 'T', type: 'debit', amount: 150_000, date: '2026-05-20' }),
        // transaction d'avril — dans le solde d'ouverture de mai, PAS dans le flux de mai
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 500_000, date: '2026-04-15' }),
      ],
    });
    const fluxMai = flows(ACCOUNT('AC-1'), ctx, '2026-05-01', '2026-05-31');
    expect(fluxMai.totalCredit).toBe(300_000);
    expect(fluxMai.totalDebit).toBe(150_000);
    expect(fluxMai.count).toBe(2); // la transaction d'avril n'y est pas

    const soldeFinMai = balanceAsOf(ACCOUNT('AC-1'), ctx, '2026-05-31').total;
    expect(soldeFinMai).toBe(1_650_000); // 1M + 500k (avril) + 300k − 150k
    // le flux seul (150k net) ne dit rien du solde
    expect(fluxMai.totalCredit - fluxMai.totalDebit).toBe(150_000);
  });
});

describe('flows — virement inter-caisses (comportement actuel, sans marqueur INTERNAL_TRANSFER)', () => {
  it('TENANT_ALL_ACCOUNTS : le virement gonfle totalDebit ; byAccount montre ±montant', () => {
    const src = makeAccount({ id: 'AC-SRC', accountNumber: 'CX-SRC' });
    const dst = makeAccount({ id: 'AC-DST', accountNumber: 'CX-DST' });
    const ctx = makeCtx({
      accounts: [src, dst],
      transactions: [makeTransaction({ tenantId: 'T-1', fromAccount: 'CX-SRC', toAccount: 'CX-DST', type: 'debit', amount: 500_000, date: '2026-05-10' })],
    });
    const result = flows(TENANT, ctx, '2026-05-01', '2026-05-31');
    expect(result.totalDebit).toBe(500_000); // connu : sera exclu à l'étape 10
    expect(result.totalCredit).toBe(0);
    expect(result.byAccount.find((l) => l.accountId === 'AC-SRC')).toMatchObject({ debit: 500_000, credit: 0 });
    expect(result.byAccount.find((l) => l.accountId === 'AC-DST')).toMatchObject({ debit: 0, credit: 500_000 });
  });
});

describe('flows — scope membre (rattachement temporel explicite)', () => {
  // M-J : Épargne 01/04→ ; Projet 01/06→ (rejointe en cours de période) ; Trésorerie →30/04 (quittée en cours)
  const tresorerie = makeAccount({ id: 'AC-T', accountNumber: 'CX-T' });
  const epargne = makeAccount({ id: 'AC-E', accountNumber: 'CX-E' });
  const projet = makeAccount({ id: 'AC-P', accountNumber: 'CX-P' });
  const ctx = makeCtx({
    accounts: [tresorerie, epargne, projet],
    memberships: [
      makeMembership({ id: 'AM-T', accountId: 'AC-T', memberId: 'M-J', startDate: '2026-01-01', endDate: '2026-04-30', status: 'ended' }),
      makeMembership({ id: 'AM-E', accountId: 'AC-E', memberId: 'M-J', startDate: '2026-04-01', endDate: null }),
      makeMembership({ id: 'AM-P', accountId: 'AC-P', memberId: 'M-J', startDate: '2026-06-01', endDate: null }),
    ],
    transactions: [
      makeTransaction({ id: 'T-avril', tenantId: 'T-1', memberId: 'M-J', fromAccount: 'CX-T', toAccount: 'M-J', type: 'debit', amount: 100_000, date: '2026-04-10' }),
      makeTransaction({ id: 'T-mai', tenantId: 'T-1', memberId: 'M-J', fromAccount: 'CX-T', toAccount: 'M-J', type: 'debit', amount: 200_000, date: '2026-05-10' }),
      makeTransaction({ id: 'E-mai', tenantId: 'T-1', memberId: 'M-J', fromAccount: 'M-J', toAccount: 'CX-E', type: 'credit', amount: 60_000, date: '2026-05-12' }),
      makeTransaction({ id: 'P-mai', tenantId: 'T-1', memberId: 'M-J', fromAccount: 'M-J', toAccount: 'CX-P', type: 'credit', amount: 30_000, date: '2026-05-15' }),
      makeTransaction({ id: 'P-juin', tenantId: 'T-1', memberId: 'M-J', fromAccount: 'M-J', toAccount: 'CX-P', type: 'credit', amount: 40_000, date: '2026-06-15' }),
      makeTransaction({ id: 'other', tenantId: 'T-1', memberId: 'M-OTHER', fromAccount: 'M-OTHER', toAccount: 'CX-E', type: 'credit', amount: 999_000, date: '2026-05-20' }),
    ],
  });
  const M_ALL = { kind: 'MEMBER_ALL_ACCOUNTS' as const, memberId: 'M-J' };

  it('périmètre = caisses adhérées à un moment de la période (Trésorerie quittée y figure encore)', () => {
    const result = flows(M_ALL, ctx, '2026-04-01', '2026-06-30');
    expect(result.byAccount.map((l) => l.accountId).sort()).toEqual(['AC-E', 'AC-P', 'AC-T']);
  });

  it('adhésion clôturée en cours de période : les transactions APRÈS endDate ne comptent pas', () => {
    // Trésorerie quittée le 30/04 → T-avril (10/04) compte, T-mai (10/05) NON
    const result = flows(M_ALL, ctx, '2026-04-01', '2026-06-30');
    expect(result.transactionIds).toContain('T-avril');
    expect(result.transactionIds).not.toContain('T-mai');
  });

  it('adhésion débutant en cours de période : les transactions AVANT startDate ne comptent pas', () => {
    // Projet rejointe le 01/06 → P-mai (15/05) NON, P-juin (15/06) OUI
    const result = flows(M_ALL, ctx, '2026-04-01', '2026-06-30');
    expect(result.transactionIds).not.toContain('P-mai');
    expect(result.transactionIds).toContain('P-juin');
  });

  it('ne compte jamais la transaction d’un autre membre', () => {
    expect(flows(M_ALL, ctx, '2026-04-01', '2026-06-30').transactionIds).not.toContain('other');
  });

  it('MEMBER_ALL_ACCOUNTS sans adhésion chevauchant la période → outOfScope', () => {
    const result = flows(M_ALL, ctx, '2020-01-01', '2020-12-31');
    expect(result.outOfScope).toBe(true);
    expect(result.count).toBe(0);
  });
});

describe('flows — seed réel T-001', () => {
  it('TENANT_ALL_ACCOUNTS sur 2026 : totalDebit 1 375 000 / totalCredit 220 000 / 6 transactions (cohérent avec l’écran)', () => {
    const result = flows(TENANT, seedCtx('T-001'), '2026-01-01', '2026-12-31');
    expect(result.totalDebit).toBe(1_375_000);
    expect(result.totalCredit).toBe(220_000);
    expect(result.count).toBe(6);
  });

  it('ACCOUNT Trésorerie (AC-001) sur 2026 : 3 transactions (TR-002, TR-004, TR-010)', () => {
    const result = flows(ACCOUNT('AC-001'), seedCtx('T-001'), '2026-01-01', '2026-12-31');
    expect(result.transactionIds.sort()).toEqual(['TR-002', 'TR-004', 'TR-010']);
  });
});
