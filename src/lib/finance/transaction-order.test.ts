import { describe, it, expect } from 'vitest';
import { compareTransactionsNewestFirst, sortTransactionsNewestFirst, transactionTimestamp } from './transaction-order';

type Row = { id: string; date: string; recordedAt?: string };
const ids = (rows: Row[]) => rows.map((row) => row.id);

describe('transaction-order — plus récente en premier', () => {
  it('Test 1 — deux transactions : 11/08/2026 10:00 avant 10/08/2026 10:00', () => {
    const rows: Row[] = [
      { id: 'TR-001', date: '2026-08-10', recordedAt: '2026-08-10T10:00:00' },
      { id: 'TR-002', date: '2026-08-11', recordedAt: '2026-08-11T10:00:00' },
    ];
    expect(ids(sortTransactionsNewestFirst(rows))).toEqual(['TR-002', 'TR-001']);
  });

  it('trie sur la vraie date/heure, jamais sur le texte (JJ/MM trierait 11/08 après 10/09)', () => {
    const rows: Row[] = [
      { id: 'TR-001', date: '2026-08-11', recordedAt: '2026-08-11T10:00:00' },
      { id: 'TR-002', date: '2026-09-10', recordedAt: '2026-09-10T10:00:00' },
      { id: 'TR-003', date: '2026-08-11', recordedAt: '2026-08-11T09:59:00' },
    ];
    expect(ids(sortTransactionsNewestFirst(rows))).toEqual(['TR-002', 'TR-001', 'TR-003']);
  });

  it('compare des horodatages de formats différents (sans fuseau du seed / ISO UTC de `insertTransaction`)', () => {
    const seed: Row = { id: 'TR-001', date: '2026-08-11', recordedAt: '2026-08-11T10:00:00' };
    const created: Row = { id: 'TR-002', date: '2026-09-28', recordedAt: '2026-09-28T08:15:30.123Z' };
    expect(ids(sortTransactionsNewestFirst([seed, created]))).toEqual(['TR-002', 'TR-001']);
  });

  it('sans `recordedAt` : le jour `date` sert de repère (minuit local)', () => {
    const rows: Row[] = [
      { id: 'TR-001', date: '2026-08-01' },
      { id: 'TR-002', date: '2026-08-01', recordedAt: '2026-08-01T10:00:00' },
      { id: 'TR-003', date: '2026-08-02' },
    ];
    expect(ids(sortTransactionsNewestFirst(rows))).toEqual(['TR-003', 'TR-002', 'TR-001']);
    expect(transactionTimestamp({ date: '2026-08-01' })).toBe(new Date(2026, 7, 1).getTime());
  });

  it('Test 3 — même date/heure : identifiant décroissant, comparé numériquement (TR-1000 > TR-999 > TR-100)', () => {
    const at = '2026-08-12T10:00:00';
    const rows: Row[] = ['TR-100', 'TR-1000', 'TR-999', 'TR-101'].map((id) => ({ id, date: '2026-08-12', recordedAt: at }));
    const expected = ['TR-1000', 'TR-999', 'TR-101', 'TR-100'];
    expect(ids(sortTransactionsNewestFirst(rows))).toEqual(expected);
    // Déterministe : même résultat quel que soit l'ordre d'entrée.
    expect(ids(sortTransactionsNewestFirst([...rows].reverse()))).toEqual(expected);
    expect(compareTransactionsNewestFirst(rows[0], rows[0])).toBe(0);
  });

  it('ne modifie jamais le tableau source', () => {
    const rows: Row[] = [{ id: 'TR-001', date: '2026-08-01' }, { id: 'TR-002', date: '2026-08-02' }];
    sortTransactionsNewestFirst(rows);
    expect(ids(rows)).toEqual(['TR-001', 'TR-002']);
  });
});
