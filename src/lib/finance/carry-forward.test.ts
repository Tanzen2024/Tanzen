import { describe, it, expect } from 'vitest';
import { computeCarryForward, verifyCarryForwardIntegrity } from './carry-forward';
import { makeAccount, makeClosingEntry, makeCtx, makeFiscalYear, makeOpeningEntry } from './__fixtures__/factories';

describe('computeCarryForward', () => {
  it('refuse (TENANT_MISMATCH) si les deux exercices n’appartiennent pas au même tenant', () => {
    const from = makeFiscalYear({ tenantId: 'T-1', status: 'closed' });
    const to = makeFiscalYear({ tenantId: 'T-2' });
    const result = computeCarryForward(makeCtx(), from, to);
    expect(result).toEqual({ ok: false, reason: 'TENANT_MISMATCH' });
  });

  it('refuse (FROM_NOT_CLOSED) si l’exercice source n’est pas closed', () => {
    const from = makeFiscalYear({ tenantId: 'T-1', status: 'open' });
    const to = makeFiscalYear({ tenantId: 'T-1' });
    const result = computeCarryForward(makeCtx(), from, to);
    expect(result).toEqual({ ok: false, reason: 'FROM_NOT_CLOSED' });
  });

  it('refuse (NOT_CONTIGUOUS) si les exercices ne s’enchaînent pas jour pour jour', () => {
    const from = makeFiscalYear({ tenantId: 'T-1', status: 'closed', endDate: '2026-12-31' });
    const to = makeFiscalYear({ tenantId: 'T-1', startDate: '2027-01-02' }); // trou d'un jour
    const result = computeCarryForward(makeCtx(), from, to);
    expect(result).toEqual({ ok: false, reason: 'NOT_CONTIGUOUS' });
  });

  it('accepte une contiguïté stricte (endDate + 1 jour == startDate), y compris à cheval sur une année bissextile', () => {
    const from = makeFiscalYear({ id: 'FY-2027', tenantId: 'T-1', status: 'closed', endDate: '2027-12-31' });
    const to = makeFiscalYear({ id: 'FY-2028', tenantId: 'T-1', startDate: '2028-01-01' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1' });
    const ctx = makeCtx({
      accounts: [account],
      closingEntries: [makeClosingEntry({ id: 'CE-1', accountId: 'AC-1', fiscalYearId: 'FY-2027', amount: 100_000, status: 'FINAL' })],
    });
    const result = computeCarryForward(ctx, from, to);
    expect(result.ok).toBe(true);
  });

  it('refuse (MISSING_CLOSING_ENTRIES) si une caisse du tenant n’a pas de ClosingEntry FINAL pour l’exercice source', () => {
    const from = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'closed', endDate: '2026-12-31' });
    const to = makeFiscalYear({ id: 'FY-2', tenantId: 'T-1', startDate: '2027-01-01' });
    const a = makeAccount({ id: 'AC-1', tenantId: 'T-1' });
    const b = makeAccount({ id: 'AC-2', tenantId: 'T-1' });
    const ctx = makeCtx({
      accounts: [a, b],
      closingEntries: [makeClosingEntry({ accountId: 'AC-1', fiscalYearId: 'FY-1', status: 'FINAL' })], // AC-2 manquant
    });
    const result = computeCarryForward(ctx, from, to);
    expect(result).toEqual({ ok: false, reason: 'MISSING_CLOSING_ENTRIES', accountIds: ['AC-2'] });
  });

  it('refuse (ALREADY_CARRIED) si une caisse a déjà une OpeningEntry FINAL pour l’exercice cible — idempotence par refus', () => {
    const from = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'closed', endDate: '2026-12-31' });
    const to = makeFiscalYear({ id: 'FY-2', tenantId: 'T-1', startDate: '2027-01-01' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1' });
    const ctx = makeCtx({
      accounts: [account],
      closingEntries: [makeClosingEntry({ accountId: 'AC-1', fiscalYearId: 'FY-1', amount: 100_000, status: 'FINAL' })],
      openingEntries: [makeOpeningEntry({ accountId: 'AC-1', fiscalYearId: 'FY-2', status: 'FINAL' })],
    });
    const result = computeCarryForward(ctx, from, to);
    expect(result).toEqual({ ok: false, reason: 'ALREADY_CARRIED', accountIds: ['AC-1'] });
  });

  it('nominal — le montant est COPIÉ tel quel depuis le ClosingEntry, jamais recalculé', () => {
    const from = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'closed', endDate: '2026-12-31' });
    const to = makeFiscalYear({ id: 'FY-2', tenantId: 'T-1', startDate: '2027-01-01' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1' });
    const ctx = makeCtx({
      accounts: [account],
      closingEntries: [makeClosingEntry({ id: 'CE-1', accountId: 'AC-1', fiscalYearId: 'FY-1', amount: 742_500, status: 'FINAL' })],
    });
    const result = computeCarryForward(ctx, from, to);
    expect(result).toEqual({
      ok: true,
      computations: [{ accountId: 'AC-1', amount: 742_500, date: '2027-01-01', sourceClosingEntryId: 'CE-1' }],
    });
  });

  it('caisse sans transaction — closing == opening reporté à l’identique (solde plat)', () => {
    const from = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'closed', endDate: '2026-12-31' });
    const to = makeFiscalYear({ id: 'FY-2', tenantId: 'T-1', startDate: '2027-01-01' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1' });
    const ctx = makeCtx({
      accounts: [account],
      closingEntries: [makeClosingEntry({ id: 'CE-1', accountId: 'AC-1', fiscalYearId: 'FY-1', amount: 0, status: 'FINAL' })],
    });
    const result = computeCarryForward(ctx, from, to);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.computations[0].amount).toBe(0);
  });

  it('caisse inactive — incluse au même titre qu’une caisse active', () => {
    const from = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'closed', endDate: '2026-12-31' });
    const to = makeFiscalYear({ id: 'FY-2', tenantId: 'T-1', startDate: '2027-01-01' });
    const inactive = makeAccount({ id: 'AC-1', tenantId: 'T-1', status: 'inactive' });
    const ctx = makeCtx({
      accounts: [inactive],
      closingEntries: [makeClosingEntry({ id: 'CE-1', accountId: 'AC-1', fiscalYearId: 'FY-1', amount: 50_000, status: 'FINAL' })],
    });
    const result = computeCarryForward(ctx, from, to);
    expect(result).toEqual({
      ok: true,
      computations: [{ accountId: 'AC-1', amount: 50_000, date: '2027-01-01', sourceClosingEntryId: 'CE-1' }],
    });
  });

  it('isolation tenant — une caisse d’un autre tenant n’est jamais reportée, même présente dans ctx.accounts', () => {
    const from = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', status: 'closed', endDate: '2026-12-31' });
    const to = makeFiscalYear({ id: 'FY-2', tenantId: 'T-1', startDate: '2027-01-01' });
    const t1Account = makeAccount({ id: 'AC-1', tenantId: 'T-1' });
    const t2Account = makeAccount({ id: 'AC-2', tenantId: 'T-2' });
    const ctx = makeCtx({
      accounts: [t1Account, t2Account],
      closingEntries: [makeClosingEntry({ id: 'CE-1', accountId: 'AC-1', fiscalYearId: 'FY-1', amount: 10_000, status: 'FINAL' })],
    });
    const result = computeCarryForward(ctx, from, to);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.computations.map((c) => c.accountId)).toEqual(['AC-1']);
  });
});

describe('verifyCarryForwardIntegrity', () => {
  it('aucun écart quand closing(N) == opening(N+1)', () => {
    const from = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', endDate: '2026-12-31' });
    const to = makeFiscalYear({ id: 'FY-2', tenantId: 'T-1' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1' });
    const ctx = makeCtx({
      accounts: [account],
      closingEntries: [makeClosingEntry({ accountId: 'AC-1', fiscalYearId: 'FY-1', amount: 100_000, status: 'FINAL' })],
      openingEntries: [makeOpeningEntry({ accountId: 'AC-1', fiscalYearId: 'FY-2', amount: 100_000, status: 'FINAL' })],
    });
    expect(verifyCarryForwardIntegrity(ctx, from, to)).toEqual([]);
  });

  it('détecte un écart après reclôture de l’exercice source sans rejouer le report (cas de correction en cascade)', () => {
    const from = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', endDate: '2026-12-31' });
    const to = makeFiscalYear({ id: 'FY-2', tenantId: 'T-1' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1' });
    const ctx = makeCtx({
      accounts: [account],
      closingEntries: [
        makeClosingEntry({ id: 'CE-OLD', accountId: 'AC-1', fiscalYearId: 'FY-1', amount: 100_000, status: 'SUPERSEDED' }),
        makeClosingEntry({ id: 'CE-NEW', accountId: 'AC-1', fiscalYearId: 'FY-1', amount: 150_000, status: 'FINAL' }), // corrigé après réouverture
      ],
      openingEntries: [makeOpeningEntry({ accountId: 'AC-1', fiscalYearId: 'FY-2', amount: 100_000, status: 'FINAL' })], // pas encore rejoué
    });
    expect(verifyCarryForwardIntegrity(ctx, from, to)).toEqual([{ accountId: 'AC-1', closingAmount: 150_000, openingAmount: 100_000 }]);
  });

  it('ne signale rien pour une caisse sans clôture ou sans ouverture (pas encore de report à comparer)', () => {
    const from = makeFiscalYear({ id: 'FY-1', tenantId: 'T-1', endDate: '2026-12-31' });
    const to = makeFiscalYear({ id: 'FY-2', tenantId: 'T-1' });
    const account = makeAccount({ id: 'AC-1', tenantId: 'T-1' });
    const ctx = makeCtx({ accounts: [account] });
    expect(verifyCarryForwardIntegrity(ctx, from, to)).toEqual([]);
  });
});
