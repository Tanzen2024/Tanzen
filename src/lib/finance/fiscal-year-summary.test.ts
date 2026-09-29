import { describe, it, expect } from 'vitest';
import { cashboxesFiscalYearSummary, isCashboxInFiscalYear } from './fiscal-year-summary';
import { makeCashbox, makeCtx, makeFiscalYear, makeTransaction } from './__fixtures__/factories';

/**
 * Situation des caisses sur UN exercice (mandat « Caisse + exercice fiscal
 * contexte global ») — jamais de chiffre d'un autre exercice.
 */
describe('cashboxesFiscalYearSummary', () => {
  const fy2025 = makeFiscalYear({ id: 'FY-2025', tenantId: 'T-1', startDate: '2025-01-01', endDate: '2025-12-31', isClosed: true });
  const fy2026 = makeFiscalYear({ id: 'FY-2026', tenantId: 'T-1', startDate: '2026-01-01', endDate: '2026-12-31' });
  const cashbox = makeCashbox({ id: 'AC-1', tenantId: 'T-1', cashboxNumber: 'CX-1', openingBalance: 100_000, openedOn: '2024-06-01' });
  const ctx = makeCtx({
    cashboxes: [cashbox],
    transactions: [
      makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 20_000, date: '2025-03-01' }),
      makeTransaction({ tenantId: 'T-1', source: 'CX-1', destination: 'Membre', type: 'debit', amount: 5_000, date: '2025-11-15' }),
      makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 50_000, date: '2026-02-10', recordedAt: '2026-02-10T09:00:00' }),
      makeTransaction({ tenantId: 'T-1', destination: 'CX-1', type: 'credit', amount: 999_000, date: '2026-04-01', status: 'pending' }),
    ],
  });

  it('2025 : ouverture = report initial, entrées/sorties = mouvements 2025 uniquement, solde = fin 2025', () => {
    const [line] = cashboxesFiscalYearSummary(ctx, fy2025);
    expect(line).toMatchObject({ cashboxId: 'AC-1', openingBalance: 100_000, inflows: 20_000, outflows: 5_000, balance: 115_000, movementCount: 2, lastMovement: '2025-11-15' });
  });

  it('2026 : ouverture = solde de fin 2025, seuls les mouvements COMPTABILISÉS de 2026 comptent (pending exclu)', () => {
    const [line] = cashboxesFiscalYearSummary(ctx, fy2026);
    expect(line).toMatchObject({ openingBalance: 115_000, inflows: 50_000, outflows: 0, balance: 165_000, movementCount: 1, lastMovement: '2026-02-10' });
  });

  it('cohérence : solde = ouverture + entrées − sorties', () => {
    for (const fy of [fy2025, fy2026]) {
      const [line] = cashboxesFiscalYearSummary(ctx, fy);
      expect(line.balance).toBe(line.openingBalance + line.inflows - line.outflows);
    }
  });

  it('un exercice sans mouvement : ouverture = solde, dernier mouvement = null', () => {
    const fy2027 = makeFiscalYear({ id: 'FY-2027', tenantId: 'T-1', startDate: '2027-01-01', endDate: '2027-12-31' });
    const [line] = cashboxesFiscalYearSummary(ctx, fy2027);
    expect(line).toMatchObject({ openingBalance: 165_000, inflows: 0, outflows: 0, balance: 165_000, lastMovement: null });
  });

  it('une caisse ouverte après la fin de l’exercice n’en fait pas partie', () => {
    const late = makeCashbox({ id: 'AC-LATE', tenantId: 'T-1', openedOn: '2026-03-01' });
    expect(isCashboxInFiscalYear(late, fy2025)).toBe(false);
    expect(isCashboxInFiscalYear(late, fy2026)).toBe(true);
    expect(cashboxesFiscalYearSummary(makeCtx({ cashboxes: [cashbox, late] }), fy2025).map((line) => line.cashboxId)).toEqual(['AC-1']);
  });

  it('isolation tenant : les caisses d’un autre tenant présentes par erreur dans le ctx ne sont jamais retournées', () => {
    const other = makeCashbox({ id: 'AC-OTHER', tenantId: 'T-2', openedOn: '2020-01-01' });
    expect(cashboxesFiscalYearSummary(makeCtx({ cashboxes: [cashbox, other] }), fy2026).map((line) => line.cashboxId)).toEqual(['AC-1']);
  });
});

/**
 * KPI « Solde à l'ouverture » de l'accueil Caisses (mandat 2026-09-25) :
 * Σ `openingBalance` des lignes produites par le moteur — le dashboard ne fait
 * que sommer, aucune règle de solde propre.
 */
describe('Solde à l’ouverture — total des caisses du tenant sur l’exercice sélectionné', () => {
  const total = (ctx: ReturnType<typeof makeCtx>, fiscalYear: ReturnType<typeof makeFiscalYear>) =>
    cashboxesFiscalYearSummary(ctx, fiscalYear).reduce((sum, line) => sum + line.openingBalance, 0);
  const fy2025 = makeFiscalYear({ id: 'FY-2025', tenantId: 'T-1', startDate: '2025-01-01', endDate: '2025-12-31', isClosed: true });
  const fy2026 = makeFiscalYear({ id: 'FY-2026', tenantId: 'T-1', startDate: '2026-01-01', endDate: '2026-12-31' });

  it('cas 1 — plusieurs caisses : 10 000 000 + 5 000 000 + 2 000 000 = 17 000 000', () => {
    const ctx = makeCtx({ cashboxes: [
      makeCashbox({ id: 'AC-A', tenantId: 'T-1', cashboxNumber: 'CX-A', openingBalance: 10_000_000, openedOn: '2024-01-01' }),
      makeCashbox({ id: 'AC-B', tenantId: 'T-1', cashboxNumber: 'CX-B', openingBalance: 5_000_000, openedOn: '2024-01-01' }),
      makeCashbox({ id: 'AC-C', tenantId: 'T-1', cashboxNumber: 'CX-C', openingBalance: 2_000_000, openedOn: '2024-01-01' }),
    ] });
    expect(total(ctx, fy2026)).toBe(17_000_000);
  });

  it('cas 2 — aucune ouverture : 0', () => {
    const ctx = makeCtx({ cashboxes: [
      makeCashbox({ id: 'AC-A', tenantId: 'T-1', cashboxNumber: 'CX-A', openingBalance: 0, openedOn: '2024-01-01' }),
      makeCashbox({ id: 'AC-B', tenantId: 'T-1', cashboxNumber: 'CX-B', openingBalance: 0, openedOn: '2024-01-01' }),
    ] });
    expect(total(ctx, fy2026)).toBe(0);
    expect(total(makeCtx({ cashboxes: [] }), fy2026)).toBe(0);
  });

  it('cas 3 — plusieurs tenants : chaque tenant ne voit que ses propres caisses', () => {
    const ctx = makeCtx({ cashboxes: [
      makeCashbox({ id: 'AC-A', tenantId: 'T-1', cashboxNumber: 'CX-A', openingBalance: 10_000_000, openedOn: '2024-01-01' }),
      makeCashbox({ id: 'AC-B', tenantId: 'T-2', cashboxNumber: 'CX-B', openingBalance: 20_000_000, openedOn: '2024-01-01' }),
    ] });
    expect(total(ctx, fy2026)).toBe(10_000_000);
    expect(total(ctx, makeFiscalYear({ id: 'FY-2026-T2', tenantId: 'T-2', startDate: '2026-01-01', endDate: '2026-12-31' }))).toBe(20_000_000);
  });

  it('cas 4 — changement d’exercice : 15 000 000 en 2025, 24 000 000 en 2026 (mouvements 2025 reportés)', () => {
    const ctx = makeCtx({
      cashboxes: [makeCashbox({ id: 'AC-A', tenantId: 'T-1', cashboxNumber: 'CX-A', openingBalance: 15_000_000, openedOn: '2024-01-01' })],
      transactions: [makeTransaction({ tenantId: 'T-1', destination: 'CX-A', type: 'credit', amount: 9_000_000, date: '2025-06-01' })],
    });
    expect(total(ctx, fy2025)).toBe(15_000_000);
    expect(total(ctx, fy2026)).toBe(24_000_000);
  });

  it('cas 5 — exercice clôturé : son ouverture historique ne bouge pas avec les mouvements des exercices suivants, et ouverture(N+1) = solde(N)', () => {
    const cashboxes = [makeCashbox({ id: 'AC-A', tenantId: 'T-1', cashboxNumber: 'CX-A', openingBalance: 15_000_000, openedOn: '2024-01-01' })];
    const tx2025 = makeTransaction({ tenantId: 'T-1', destination: 'CX-A', type: 'credit', amount: 9_000_000, date: '2025-06-01' });
    const before = makeCtx({ cashboxes, transactions: [tx2025] });
    const after = makeCtx({ cashboxes, transactions: [tx2025, makeTransaction({ tenantId: 'T-1', source: 'CX-A', destination: 'Membre', type: 'debit', amount: 4_000_000, date: '2026-03-01' })] });
    expect(total(after, fy2025)).toBe(total(before, fy2025));
    expect(total(after, fy2025)).toBe(15_000_000);
    const closing2025 = cashboxesFiscalYearSummary(after, fy2025).reduce((sum, line) => sum + line.balance, 0);
    expect(total(after, fy2026)).toBe(closing2025);
  });
});
