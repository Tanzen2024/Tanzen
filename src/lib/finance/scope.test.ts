import { describe, it, expect } from 'vitest';
import { scopeKey, cashboxesOfAsOf, cashboxesOfDuring } from './scope';
import { makeCashbox, makeCtx, makeMembership } from './__fixtures__/factories';

describe('scopeKey', () => {
  it('produit une clé stable et distincte par scope', () => {
    expect(scopeKey({ kind: 'TENANT_ALL_CASHBOXES' })).toBe('tenant');
    expect(scopeKey({ kind: 'CASHBOX', cashboxId: 'AC-1' })).toBe('cashbox:AC-1');
    expect(scopeKey({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-1' })).toBe('member:M-1');
    expect(scopeKey({ kind: 'MEMBER_CASHBOX', memberId: 'M-1', cashboxId: 'AC-1' })).toBe('member:M-1:cashbox:AC-1');
  });
});

describe('cashboxesOfAsOf — périmètre à une date', () => {
  const tresorerie = makeCashbox({ id: 'AC-T', cashboxNumber: 'CX-T' });
  const epargne = makeCashbox({ id: 'AC-E', cashboxNumber: 'CX-E' });
  const projet = makeCashbox({ id: 'AC-P', cashboxNumber: 'CX-P' });
  const ctx = makeCtx({
    cashboxes: [tresorerie, epargne, projet],
    memberships: [
      makeMembership({ id: 'AM-1', cashboxId: 'AC-T', memberId: 'M-1', startDate: '2026-01-01', endDate: '2026-03-31', status: 'ended' }),
      makeMembership({ id: 'AM-2', cashboxId: 'AC-E', memberId: 'M-1', startDate: '2026-04-01', endDate: null }),
      makeMembership({ id: 'AM-3', cashboxId: 'AC-P', memberId: 'M-1', startDate: '2026-04-01', endDate: null }),
    ],
  });

  it('TENANT_ALL_CASHBOXES → toutes les caisses du contexte', () => {
    expect(cashboxesOfAsOf({ kind: 'TENANT_ALL_CASHBOXES' }, ctx, '2026-05-01').cashboxes.map((a) => a.id)).toEqual(['AC-T', 'AC-E', 'AC-P']);
  });

  it('ACCOUNT → la caisse, ou vide + outOfScope si inconnue', () => {
    expect(cashboxesOfAsOf({ kind: 'CASHBOX', cashboxId: 'AC-E' }, ctx, '2026-05-01').cashboxes.map((a) => a.id)).toEqual(['AC-E']);
    const missing = cashboxesOfAsOf({ kind: 'CASHBOX', cashboxId: 'AC-NOPE' }, ctx, '2026-05-01');
    expect(missing.cashboxes).toEqual([]);
    expect(missing.outOfScope).toBe(true);
  });

  it('MEMBER_ALL_CASHBOXES → uniquement les caisses adhérées à la date (voyage temporel)', () => {
    expect(cashboxesOfAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-1' }, ctx, '2026-02-15').cashboxes.map((a) => a.id)).toEqual(['AC-T']);
    expect(cashboxesOfAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-1' }, ctx, '2026-05-15').cashboxes.map((a) => a.id)).toEqual(['AC-E', 'AC-P']);
  });

  it('MEMBER_ALL_CASHBOXES → outOfScope quand aucune adhésion à la date', () => {
    const r = cashboxesOfAsOf({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-1' }, ctx, '2025-01-01');
    expect(r.cashboxes).toEqual([]);
    expect(r.outOfScope).toBe(true);
  });

  it('MEMBER_CASHBOX → la caisse si adhésion active à la date, sinon outOfScope', () => {
    expect(cashboxesOfAsOf({ kind: 'MEMBER_CASHBOX', memberId: 'M-1', cashboxId: 'AC-E' }, ctx, '2026-05-15').cashboxes.map((a) => a.id)).toEqual(['AC-E']);
    const notMember = cashboxesOfAsOf({ kind: 'MEMBER_CASHBOX', memberId: 'M-1', cashboxId: 'AC-T' }, ctx, '2026-05-15');
    expect(notMember.cashboxes).toEqual([]);
    expect(notMember.outOfScope).toBe(true);
  });
});

describe('cashboxesOfDuring — périmètre sur une période', () => {
  const ctx = makeCtx({
    cashboxes: [makeCashbox({ id: 'AC-A' }), makeCashbox({ id: 'AC-B' })],
    memberships: [
      makeMembership({ id: 'AM-1', cashboxId: 'AC-A', memberId: 'M-1', startDate: '2026-01-01', endDate: '2026-03-31', status: 'ended' }),
      makeMembership({ id: 'AM-2', cashboxId: 'AC-B', memberId: 'M-1', startDate: '2026-04-01', endDate: null }),
    ],
  });

  it('inclut une caisse quittée en cours de période (chevauchement)', () => {
    // période 2026-03-01 → 2026-05-31 : AC-A quittée le 31/03 mais chevauche, AC-B rejointe le 01/04
    expect(cashboxesOfDuring({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-1' }, ctx, '2026-03-01', '2026-05-31').cashboxes.map((a) => a.id)).toEqual(['AC-A', 'AC-B']);
  });

  it('exclut une caisse dont l’adhésion ne chevauche pas la période', () => {
    // période entièrement après la fin d'AC-A
    expect(cashboxesOfDuring({ kind: 'MEMBER_ALL_CASHBOXES', memberId: 'M-1' }, ctx, '2026-06-01', '2026-06-30').cashboxes.map((a) => a.id)).toEqual(['AC-B']);
  });
});
