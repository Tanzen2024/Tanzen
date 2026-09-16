import { describe, it, expect } from 'vitest';
import { computeFiscalYearClosing, recomputeClosingEntry } from './closing';
import { makeAccount, makeClosingEntry, makeCtx, makeFiscalYear, makeOpeningEntry, makeTransaction } from './__fixtures__/factories';

describe('computeFiscalYearClosing', () => {
  it('refuse si l’exercice n’est pas open (upcoming)', () => {
    const fy = makeFiscalYear({ status: 'upcoming' });
    const ctx = makeCtx({ accounts: [makeAccount({ tenantId: 'T-1' })] });
    const result = computeFiscalYearClosing(ctx, fy);
    expect(result).toEqual({ ok: false, reason: 'FISCAL_YEAR_NOT_OPEN' });
  });

  it('refuse si l’exercice n’est pas open (closed)', () => {
    const fy = makeFiscalYear({ status: 'closed' });
    const ctx = makeCtx({ accounts: [makeAccount({ tenantId: 'T-1' })] });
    const result = computeFiscalYearClosing(ctx, fy);
    expect(result).toEqual({ ok: false, reason: 'FISCAL_YEAR_NOT_OPEN' });
  });

  it('refuse (ALREADY_CLOSED) si une caisse a déjà un ClosingEntry FINAL pour cet exercice — idempotence par refus', () => {
    const fy = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'open' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1' });
    const ctx = makeCtx({
      accounts: [account],
      closingEntries: [makeClosingEntry({ accountId: 'AC-1', fiscalYearId: 'FY-1', status: 'FINAL' })],
    });
    const result = computeFiscalYearClosing(ctx, fy);
    expect(result).toEqual({ ok: false, reason: 'ALREADY_CLOSED', accountIds: ['AC-1'] });
  });

  it('un ClosingEntry SUPERSEDED ne bloque pas une nouvelle clôture', () => {
    const fy = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'open', endDate: '2026-12-31' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1', accountNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      accounts: [account],
      closingEntries: [makeClosingEntry({ accountId: 'AC-1', fiscalYearId: 'FY-1', status: 'SUPERSEDED' })],
    });
    const result = computeFiscalYearClosing(ctx, fy);
    expect(result.ok).toBe(true);
  });

  it('premier closing d’une caisse — baseline legacy (openingBalance), aucune OpeningEntry consultée', () => {
    const fy = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'open', startDate: '2026-01-01', endDate: '2026-12-31' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1', accountNumber: 'CX-1', openingBalance: 100_000 });
    const ctx = makeCtx({
      accounts: [account],
      transactions: [makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-01' })],
    });
    const result = computeFiscalYearClosing(ctx, fy);
    expect(result).toEqual({ ok: true, computations: [{ accountId: 'AC-1', amount: 150_000, openingEntryId: undefined }] });
  });

  it('caisse avec OpeningEntry active — baseline = OpeningEntry, openingEntryId tracé', () => {
    const fy = makeFiscalYear({ id: 'FY-2027', tenantId: 'T-1', status: 'open', startDate: '2027-01-01', endDate: '2027-12-31' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1', accountNumber: 'CX-1', openingBalance: 999_999 });
    const ctx = makeCtx({
      accounts: [account],
      transactions: [makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 20_000, date: '2027-03-01' })],
      openingEntries: [makeOpeningEntry({ id: 'OE-1', accountId: 'AC-1', fiscalYearId: 'FY-2027', date: '2027-01-01', amount: 230_000 })],
    });
    const result = computeFiscalYearClosing(ctx, fy);
    expect(result).toEqual({ ok: true, computations: [{ accountId: 'AC-1', amount: 250_000, openingEntryId: 'OE-1' }] });
  });

  it('caisse sans transaction — closing = opening, solde plat', () => {
    const fy = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'open', endDate: '2026-12-31' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1', accountNumber: 'CX-1', openingBalance: 300_000 });
    const ctx = makeCtx({ accounts: [account], transactions: [] });
    const result = computeFiscalYearClosing(ctx, fy);
    expect(result).toEqual({ ok: true, computations: [{ accountId: 'AC-1', amount: 300_000, openingEntryId: undefined }] });
  });

  it('transactions cancelled/pending exclues du calcul de clôture', () => {
    const fy = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'open', endDate: '2026-12-31' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1', accountNumber: 'CX-1', openingBalance: 0 });
    const ctx = makeCtx({
      accounts: [account],
      transactions: [
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 50_000, date: '2026-06-01', status: 'completed' }),
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 999_000, date: '2026-06-02', status: 'pending' }),
        makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 888_000, date: '2026-06-03', status: 'cancelled' }),
      ],
    });
    const result = computeFiscalYearClosing(ctx, fy);
    expect(result).toEqual({ ok: true, computations: [{ accountId: 'AC-1', amount: 50_000, openingEntryId: undefined }] });
  });

  it('inclut TOUTES les caisses du tenant, actives ou inactives — jamais celles d’un autre tenant', () => {
    const fy = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'open', endDate: '2026-12-31' });
    const active = makeAccount({ id: 'AC-1', tenantId: 'T-1', accountNumber: 'CX-1', status: 'active', openingBalance: 10 });
    const inactive = makeAccount({ id: 'AC-2', tenantId: 'T-1', accountNumber: 'CX-2', status: 'inactive', openingBalance: 20 });
    const otherTenant = makeAccount({ id: 'AC-3', tenantId: 'T-2', accountNumber: 'CX-3', openingBalance: 999 });
    const ctx = makeCtx({ accounts: [active, inactive, otherTenant], transactions: [] });
    const result = computeFiscalYearClosing(ctx, fy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.computations.map((c) => c.accountId).sort()).toEqual(['AC-1', 'AC-2']);
    }
  });
});

describe('recomputeClosingEntry', () => {
  it('ACCOUNT_NOT_FOUND si la caisse n’existe pas dans le ctx', () => {
    const fy = makeFiscalYear({ tenantId: 'T-1' });
    const ctx = makeCtx({ accounts: [] });
    expect(recomputeClosingEntry(ctx, fy, 'AC-NOPE')).toEqual({ ok: false, reason: 'ACCOUNT_NOT_FOUND' });
  });

  it('FISCAL_YEAR_TENANT_MISMATCH si la caisse appartient à un autre tenant que l’exercice', () => {
    const fy = makeFiscalYear({ tenantId: 'T-1' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-2' });
    const ctx = makeCtx({ accounts: [account] });
    expect(recomputeClosingEntry(ctx, fy, 'AC-1')).toEqual({ ok: false, reason: 'FISCAL_YEAR_TENANT_MISMATCH' });
  });

  it('recalcule correctement même sans passer par computeFiscalYearClosing (pas de garde sur status)', () => {
    const fy = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'open', endDate: '2026-12-31' }); // rouvert, par exemple
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1', accountNumber: 'CX-1', openingBalance: 100_000 });
    const ctx = makeCtx({
      accounts: [account],
      transactions: [makeTransaction({ tenantId: 'T-1', toAccount: 'CX-1', type: 'credit', amount: 25_000, date: '2026-07-01' })],
    });
    expect(recomputeClosingEntry(ctx, fy, 'AC-1')).toEqual({ ok: true, amount: 125_000, openingEntryId: undefined });
  });
});
