import { describe, it, expect } from 'vitest';
import { scopeKey, accountsOfAsOf, accountsOfDuring } from './scope';
import { makeAccount, makeCtx, makeMembership } from './__fixtures__/factories';

describe('scopeKey', () => {
  it('produit une clé stable et distincte par scope', () => {
    expect(scopeKey({ kind: 'TENANT_ALL_ACCOUNTS' })).toBe('tenant');
    expect(scopeKey({ kind: 'ACCOUNT', accountId: 'AC-1' })).toBe('account:AC-1');
    expect(scopeKey({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-1' })).toBe('member:M-1');
    expect(scopeKey({ kind: 'MEMBER_ACCOUNT', memberId: 'M-1', accountId: 'AC-1' })).toBe('member:M-1:account:AC-1');
  });
});

describe('accountsOfAsOf — périmètre à une date', () => {
  const tresorerie = makeAccount({ id: 'AC-T', accountNumber: 'CX-T' });
  const epargne = makeAccount({ id: 'AC-E', accountNumber: 'CX-E' });
  const projet = makeAccount({ id: 'AC-P', accountNumber: 'CX-P' });
  const ctx = makeCtx({
    accounts: [tresorerie, epargne, projet],
    memberships: [
      makeMembership({ id: 'AM-1', accountId: 'AC-T', memberId: 'M-1', startDate: '2026-01-01', endDate: '2026-03-31', status: 'ended' }),
      makeMembership({ id: 'AM-2', accountId: 'AC-E', memberId: 'M-1', startDate: '2026-04-01', endDate: null }),
      makeMembership({ id: 'AM-3', accountId: 'AC-P', memberId: 'M-1', startDate: '2026-04-01', endDate: null }),
    ],
  });

  it('TENANT_ALL_ACCOUNTS → toutes les caisses du contexte', () => {
    expect(accountsOfAsOf({ kind: 'TENANT_ALL_ACCOUNTS' }, ctx, '2026-05-01').accounts.map((a) => a.id)).toEqual(['AC-T', 'AC-E', 'AC-P']);
  });

  it('ACCOUNT → la caisse, ou vide + outOfScope si inconnue', () => {
    expect(accountsOfAsOf({ kind: 'ACCOUNT', accountId: 'AC-E' }, ctx, '2026-05-01').accounts.map((a) => a.id)).toEqual(['AC-E']);
    const missing = accountsOfAsOf({ kind: 'ACCOUNT', accountId: 'AC-NOPE' }, ctx, '2026-05-01');
    expect(missing.accounts).toEqual([]);
    expect(missing.outOfScope).toBe(true);
  });

  it('MEMBER_ALL_ACCOUNTS → uniquement les caisses adhérées à la date (voyage temporel)', () => {
    expect(accountsOfAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-1' }, ctx, '2026-02-15').accounts.map((a) => a.id)).toEqual(['AC-T']);
    expect(accountsOfAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-1' }, ctx, '2026-05-15').accounts.map((a) => a.id)).toEqual(['AC-E', 'AC-P']);
  });

  it('MEMBER_ALL_ACCOUNTS → outOfScope quand aucune adhésion à la date', () => {
    const r = accountsOfAsOf({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-1' }, ctx, '2025-01-01');
    expect(r.accounts).toEqual([]);
    expect(r.outOfScope).toBe(true);
  });

  it('MEMBER_ACCOUNT → la caisse si adhésion active à la date, sinon outOfScope', () => {
    expect(accountsOfAsOf({ kind: 'MEMBER_ACCOUNT', memberId: 'M-1', accountId: 'AC-E' }, ctx, '2026-05-15').accounts.map((a) => a.id)).toEqual(['AC-E']);
    const notMember = accountsOfAsOf({ kind: 'MEMBER_ACCOUNT', memberId: 'M-1', accountId: 'AC-T' }, ctx, '2026-05-15');
    expect(notMember.accounts).toEqual([]);
    expect(notMember.outOfScope).toBe(true);
  });
});

describe('accountsOfDuring — périmètre sur une période', () => {
  const ctx = makeCtx({
    accounts: [makeAccount({ id: 'AC-A' }), makeAccount({ id: 'AC-B' })],
    memberships: [
      makeMembership({ id: 'AM-1', accountId: 'AC-A', memberId: 'M-1', startDate: '2026-01-01', endDate: '2026-03-31', status: 'ended' }),
      makeMembership({ id: 'AM-2', accountId: 'AC-B', memberId: 'M-1', startDate: '2026-04-01', endDate: null }),
    ],
  });

  it('inclut une caisse quittée en cours de période (chevauchement)', () => {
    // période 2026-03-01 → 2026-05-31 : AC-A quittée le 31/03 mais chevauche, AC-B rejointe le 01/04
    expect(accountsOfDuring({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-1' }, ctx, '2026-03-01', '2026-05-31').accounts.map((a) => a.id)).toEqual(['AC-A', 'AC-B']);
  });

  it('exclut une caisse dont l’adhésion ne chevauche pas la période', () => {
    // période entièrement après la fin d'AC-A
    expect(accountsOfDuring({ kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-1' }, ctx, '2026-06-01', '2026-06-30').accounts.map((a) => a.id)).toEqual(['AC-B']);
  });
});
