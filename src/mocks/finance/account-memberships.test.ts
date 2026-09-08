import { describe, it, expect } from 'vitest';
import {
  membershipsAsOf,
  accountIdsOfMemberAsOf,
  accountsOfMemberAsOf,
  isMemberOfAccountAsOf,
  type AccountMembership,
} from './account-memberships';

/**
 * Helpers d'appartenance — fonctions PURES : les fixtures sont injectées en
 * paramètre, aucun accès au seed singleton. Les tests sont donc ordre-indépendants
 * et exécutables individuellement sans effet de bord.
 *
 * Scénario « Jean » (M-J) dans un tenant T-X :
 *   - Trésorerie (AC-T) : adhérent 2026-01-01 → 2026-03-31 (clôturée)
 *   - Épargne    (AC-E) : adhérent 2026-04-01 → (en cours)
 *   - Projet     (AC-P) : adhérent 2026-04-01 → (en cours), AUCUNE transaction
 *   - Solidarité (AC-S) : jamais adhérent
 */
const M = (over: Partial<AccountMembership>): AccountMembership => ({
  id: 'AM-x', tenantId: 'T-X', accountId: 'AC-?', memberId: 'M-J',
  startDate: '2026-01-01', endDate: null, status: 'active', ...over,
});

const jean: AccountMembership[] = [
  M({ id: 'AM-1', accountId: 'AC-T', startDate: '2026-01-01', endDate: '2026-03-31', status: 'ended' }),
  M({ id: 'AM-2', accountId: 'AC-E', startDate: '2026-04-01', endDate: null }),
  M({ id: 'AM-3', accountId: 'AC-P', startDate: '2026-04-01', endDate: null }),
  // adhésion d'un AUTRE membre, même caisse — ne doit jamais remonter pour M-J
  M({ id: 'AM-4', accountId: 'AC-E', memberId: 'M-OTHER', startDate: '2026-01-01', endDate: null }),
];

const accounts = [{ id: 'AC-T' }, { id: 'AC-E' }, { id: 'AC-P' }, { id: 'AC-S' }];

describe('membershipsAsOf', () => {
  it('inclut une adhésion commencée et non clôturée à la date', () => {
    const result = membershipsAsOf(jean, 'M-J', '2026-05-15');
    expect(result.map((m) => m.accountId).sort()).toEqual(['AC-E', 'AC-P']);
  });

  it('inclut une adhésion clôturée SI la date est dans sa fenêtre (bornes inclusives)', () => {
    expect(membershipsAsOf(jean, 'M-J', '2026-02-15').map((m) => m.accountId)).toEqual(['AC-T']);
    expect(membershipsAsOf(jean, 'M-J', '2026-03-31').map((m) => m.accountId)).toEqual(['AC-T']);
    expect(membershipsAsOf(jean, 'M-J', '2026-01-01').map((m) => m.accountId)).toEqual(['AC-T']);
  });

  it('exclut une adhésion pas encore commencée', () => {
    expect(membershipsAsOf(jean, 'M-J', '2026-03-15').some((m) => m.accountId === 'AC-E')).toBe(false);
  });

  it('exclut une adhésion déjà clôturée à la date', () => {
    expect(membershipsAsOf(jean, 'M-J', '2026-05-15').some((m) => m.accountId === 'AC-T')).toBe(false);
  });

  it('ne remonte jamais l’adhésion d’un autre membre à la même caisse', () => {
    expect(membershipsAsOf(jean, 'M-J', '2026-05-15').every((m) => m.memberId === 'M-J')).toBe(true);
  });

  it('voyage dans le temps : le périmètre change avec la date', () => {
    expect(accountIdsOfMemberAsOf(jean, 'M-J', '2026-02-15')).toEqual(['AC-T']);
    expect(accountIdsOfMemberAsOf(jean, 'M-J', '2026-05-15').sort()).toEqual(['AC-E', 'AC-P']);
    expect(accountIdsOfMemberAsOf(jean, 'M-J', '2025-12-31')).toEqual([]);
  });
});

describe('accountIdsOfMemberAsOf — dédoublonnage', () => {
  it('une même caisse adhérée deux fois (ré-adhésion) ne compte qu’une fois', () => {
    const readh: AccountMembership[] = [
      M({ id: 'AM-a', accountId: 'AC-E', startDate: '2026-01-01', endDate: '2026-02-28', status: 'ended' }),
      M({ id: 'AM-b', accountId: 'AC-E', startDate: '2026-06-01', endDate: null }),
    ];
    expect(accountIdsOfMemberAsOf(readh, 'M-J', '2026-07-01')).toEqual(['AC-E']);
  });
});

describe('accountsOfMemberAsOf', () => {
  it('retourne les objets caisses adhérés à la date, dans l’ordre du tableau source', () => {
    expect(accountsOfMemberAsOf(jean, accounts, 'M-J', '2026-05-15').map((a) => a.id)).toEqual(['AC-E', 'AC-P']);
  });

  it('n’invente jamais une caisse absente du tableau fourni', () => {
    expect(accountsOfMemberAsOf(jean, [{ id: 'AC-E' }], 'M-J', '2026-05-15').map((a) => a.id)).toEqual(['AC-E']);
  });

  it('caisse adhérée sans transaction : reste dans le périmètre (position 0 gérée en aval)', () => {
    expect(accountsOfMemberAsOf(jean, accounts, 'M-J', '2026-05-15').some((a) => a.id === 'AC-P')).toBe(true);
  });
});

describe('isMemberOfAccountAsOf', () => {
  it('true pour une caisse adhérée à la date', () => {
    expect(isMemberOfAccountAsOf(jean, 'M-J', 'AC-E', '2026-05-15')).toBe(true);
  });
  it('false pour une caisse jamais adhérée', () => {
    expect(isMemberOfAccountAsOf(jean, 'M-J', 'AC-S', '2026-05-15')).toBe(false);
  });
  it('false pour une caisse dont l’adhésion est clôturée à la date', () => {
    expect(isMemberOfAccountAsOf(jean, 'M-J', 'AC-T', '2026-05-15')).toBe(false);
  });
  it('true pour cette même caisse à une date où l’adhésion était active', () => {
    expect(isMemberOfAccountAsOf(jean, 'M-J', 'AC-T', '2026-02-15')).toBe(true);
  });
});
