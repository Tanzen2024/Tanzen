import { describe, it, expect } from 'vitest';
import { financePositionService } from './finance-position.service';
import { settingsService } from './settings.service';
import { resolveAccount, accounts } from '@/mocks/finance/accounts';
import { transactions } from '@/mocks/finance/transactions';

/**
 * Le service est mince : il filtre les mocks par tenant, appelle la fonction
 * pure, passe par `mockRequest`. Ces tests vérifient le CÂBLAGE et l'ISOLATION,
 * pas la logique de calcul (couverte par `src/lib/finance/*.test.ts`).
 */
describe('financePositionService — câblage & isolation tenant', () => {
  it('balanceAsOf(ACCOUNT) est cohérent avec resolveAccount pour une date lointaine', async () => {
    const result = await financePositionService.balanceAsOf('T-001', { kind: 'ACCOUNT', accountId: 'AC-001' }, '2099-12-31');
    const expected = resolveAccount(accounts.find((a) => a.id === 'AC-001')!, transactions).balance;
    expect(result.total).toBe(expected);
    expect(result.total).toBe(12_500_000);
  });

  it('balanceAsOf(TENANT_ALL_ACCOUNTS) ne voit que les caisses du tenant demandé', async () => {
    const t001 = await financePositionService.balanceAsOf('T-001', { kind: 'TENANT_ALL_ACCOUNTS' }, '2099-12-31');
    const t002 = await financePositionService.balanceAsOf('T-002', { kind: 'TENANT_ALL_ACCOUNTS' }, '2099-12-31');
    expect(t001.byAccount.every((l) => l.accountId.startsWith('AC-'))).toBe(true);
    // aucune caisse de T-002 dans le résultat T-001
    const t002Ids = new Set(t002.byAccount.map((l) => l.accountId));
    expect(t001.byAccount.some((l) => t002Ids.has(l.accountId))).toBe(false);
  });

  it('un membre de T-001 interrogé sur le tenant T-002 → outOfScope (isolation)', async () => {
    const result = await financePositionService.balanceAsOf('T-002', { kind: 'MEMBER_ACCOUNT', memberId: 'M-001', accountId: 'AC-004' }, '2099-12-31');
    expect(result.outOfScope).toBe(true);
    expect(result.total).toBe(0);
  });

  it('MEMBER_ALL_ACCOUNTS — périmètre = adhésions du membre à la date (seed Fatou)', async () => {
    const jul = await financePositionService.balanceAsOf('T-001', { kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-001' }, '2026-07-31');
    const aug = await financePositionService.balanceAsOf('T-001', { kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-001' }, '2026-08-05');
    expect(jul.byAccount.map((l) => l.accountId).sort()).toEqual(['AC-001', 'AC-002']);
    expect(aug.byAccount.map((l) => l.accountId).sort()).toEqual(['AC-001', 'AC-002', 'AC-011']);
  });

  it('flows(TENANT_ALL_ACCOUNTS) 2026 — T-001 : 1 375 000 / 220 000 / 6', async () => {
    const result = await financePositionService.flows('T-001', { kind: 'TENANT_ALL_ACCOUNTS' }, '2026-01-01', '2026-12-31');
    expect(result.totalDebit).toBe(1_375_000);
    expect(result.totalCredit).toBe(220_000);
    expect(result.count).toBe(6);
  });

  it('flows d’un autre tenant n’inclut aucune transaction de T-001', async () => {
    const t002 = await financePositionService.flows('T-002', { kind: 'TENANT_ALL_ACCOUNTS' }, '2026-01-01', '2026-12-31');
    // T-002 seed : TR-003, TR-005, TR-013, TR-015 — jamais TR-001/TR-002...
    expect(t002.transactionIds.every((id) => !['TR-001', 'TR-002', 'TR-004', 'TR-006', 'TR-010', 'TR-012'].includes(id))).toBe(true);
  });
});

/**
 * Étape 6 — câblage/isolation de closeFiscalYear/carryForward/recompute/
 * verifyCarryForwardIntegrity/createInitialOpeningEntry. Ces tests MUTENT
 * réellement les mocks partagés (comme le fait déjà `finance.service.test.ts`
 * pour `createTransaction`) — chaque fichier de test vitest a son propre
 * graphe de modules (isolation par fichier), donc aucune fuite vers les
 * autres fichiers de test. Ajoutés en FIN de fichier pour ne perturber aucune
 * assertion précédente de CE fichier (ex. les totaux `2099-12-31` ci-dessus).
 */
describe('financePositionService — closeFiscalYear / carryForward (étape 6)', () => {
  it('refuse (null, convention mockRequest) si l’exercice n’existe pas pour ce tenant', async () => {
    expect(await financePositionService.closeFiscalYear('T-001', 'FY-NOPE')).toBeNull();
    expect(await financePositionService.carryForward('T-001', 'FY-NOPE', 'FY-T001-2027')).toBeNull();
  });

  it('un exercice cible d’un autre tenant est introuvable via ce service (déjà tenant-scopé) — TENANT_MISMATCH n’est atteignable qu’au niveau du moteur pur (`carry-forward.test.ts`)', async () => {
    const result = await financePositionService.carryForward('T-001', 'FY-T001-2026', 'FY-T002-2026');
    expect(result).toBeNull();
  });

  it('NOT_CONTIGUOUS — deux exercices qui ne s’enchaînent pas (T-001 2024 → 2026, 2025 sauté)', async () => {
    const result = await financePositionService.carryForward('T-001', 'FY-T001-2024', 'FY-T001-2026');
    expect(result).toEqual({ ok: false, reason: 'NOT_CONTIGUOUS' });
  });

  it('FROM_NOT_CLOSED — l’exercice source (T-002 2026) est encore open', async () => {
    const result = await financePositionService.carryForward('T-002', 'FY-T002-2026', 'FY-T002-2027');
    expect(result).toEqual({ ok: false, reason: 'FROM_NOT_CLOSED' });
  });

  it('MISSING_CLOSING_ENTRIES — exercice déjà closed (T-002 2025) mais jamais clôturé via ce mécanisme', async () => {
    const result = await financePositionService.carryForward('T-002', 'FY-T002-2025', 'FY-T002-2026');
    expect(result?.ok).toBe(false);
    if (result && !result.ok) {
      expect(result.reason).toBe('MISSING_CLOSING_ENTRIES');
      expect(result.accountIds).toEqual(expect.arrayContaining(['AC-004', 'AC-005']));
    }
  });

  it('closeFiscalYear(T-001, FY-2026) — un ClosingEntry FINAL par caisse du tenant, aucune fuite T-002', async () => {
    const result = await financePositionService.closeFiscalYear('T-001', 'FY-T001-2026');
    expect(result?.ok).toBe(true);
    if (result?.ok) {
      const t001AccountIds = accounts.filter((a) => a.tenantId === 'T-001').map((a) => a.id);
      expect(result.entries.map((e) => e.accountId).sort()).toEqual(t001AccountIds.sort());
      expect(result.entries.every((e) => e.status === 'FINAL' && e.fiscalYearId === 'FY-T001-2026')).toBe(true);
      expect(result.entries.every((e) => e.tenantId === 'T-001')).toBe(true);
    }
  });

  it('idempotence — reclôturer le même exercice refuse (ALREADY_CLOSED), jamais d’écrasement silencieux', async () => {
    const result = await financePositionService.closeFiscalYear('T-001', 'FY-T001-2026');
    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.reason).toBe('ALREADY_CLOSED');
  });

  it('carryForward(T-001, 2026 → 2027) après clôture gouvernance — closing(N) copié tel quel vers opening(N+1), non-régression du total 2099', async () => {
    // Séquencement recommandé (mandat §3) : clôture financière déjà faite ci-dessus, PUIS clôture gouvernance.
    // La clôture financière déjà faite (ALREADY_CLOSED) est traitée comme une précondition satisfaite,
    // pas un échec — closeCurrentFiscalYear reste idempotent sur ce point (mandat cycle de vie §8/§9).
    const closed = await settingsService.closeCurrentFiscalYear('T-001');
    expect(closed.ok).toBe(true);
    if (closed.ok) expect(closed.year.status).toBe('closed');

    const carried = await financePositionService.carryForward('T-001', 'FY-T001-2026', 'FY-T001-2027');
    expect(carried?.ok).toBe(true);
    if (carried?.ok) {
      const opening2027 = carried.entries.find((e) => e.accountId === 'AC-001')!;
      expect(opening2027.origin).toBe('CARRY_FORWARD');
      expect(opening2027.date).toBe('2027-01-01');
    }

    // Aucune transaction seedée après 2026 → le total à '2099-12-31' doit rester EXACTEMENT
    // celui d'avant l'étape 6 (invariant non-régression), même si le mécanisme sous-jacent a changé.
    const total2099 = await financePositionService.balanceAsOf('T-001', { kind: 'ACCOUNT', accountId: 'AC-001' }, '2099-12-31');
    expect(total2099.total).toBe(12_500_000);

    const mismatches = await financePositionService.verifyCarryForwardIntegrity('T-001', 'FY-T001-2026', 'FY-T001-2027');
    expect(mismatches).toEqual([]);
  });

  it('ALREADY_CARRIED — reporter deux fois le même couple d’exercices refuse', async () => {
    const result = await financePositionService.carryForward('T-001', 'FY-T001-2026', 'FY-T001-2027');
    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.reason).toBe('ALREADY_CARRIED');
  });

  it('isolation — la clôture/le report de T-001 ne touchent jamais T-002', async () => {
    const t002 = await financePositionService.closeFiscalYear('T-002', 'FY-T002-2026');
    expect(t002?.ok).toBe(true);
    if (t002?.ok) {
      expect(t002.entries.every((e) => e.tenantId === 'T-002')).toBe(true);
      expect(t002.entries.some((e) => e.accountId.startsWith('AC-001'))).toBe(false); // aucune caisse T-001
    }
  });
});

describe('financePositionService — recomputeClosingEntry (étape 6)', () => {
  it('recalcule une clôture déjà FINAL — l’ancienne passe SUPERSEDED, une nouvelle FINAL est créée', async () => {
    // Ré-utilise T-002/FY-2026, déjà clôturé par le test d'isolation ci-dessus.
    const recomputed = await financePositionService.recomputeClosingEntry('T-002', 'FY-T002-2026', 'AC-004', 'correction test');
    expect(recomputed?.ok).toBe(true);
    if (recomputed?.ok) {
      expect(recomputed.entry.status).toBe('FINAL');
      expect(recomputed.entry.accountId).toBe('AC-004');
    }
  });

  it('ACCOUNT_NOT_FOUND — caisse inexistante, ou d’un autre tenant (déjà exclue du ctx tenant-scopé par le service)', async () => {
    const notFound = await financePositionService.recomputeClosingEntry('T-002', 'FY-T002-2026', 'AC-NOPE', 'x');
    expect(notFound).toEqual({ ok: false, reason: 'ACCOUNT_NOT_FOUND' });

    // AC-001 appartient à T-001 : ctxForTenant('T-002') ne le contient jamais, donc ACCOUNT_NOT_FOUND ici —
    // FISCAL_YEAR_TENANT_MISMATCH n'est atteignable qu'au niveau du moteur pur (défense en profondeur,
    // cf. `closing.test.ts`), jamais via ce service déjà tenant-scopé par construction.
    const crossTenant = await financePositionService.recomputeClosingEntry('T-002', 'FY-T002-2026', 'AC-001', 'x');
    expect(crossTenant).toEqual({ ok: false, reason: 'ACCOUNT_NOT_FOUND' });
  });
});

describe('financePositionService — createInitialOpeningEntry (étape 6, origin INITIAL)', () => {
  it('crée une OpeningEntry INITIAL pour une caisse qui n’en a encore aucune', async () => {
    const entry = await financePositionService.createInitialOpeningEntry('T-003', 'AC-006', 'FY-T003-2026', 500_000);
    expect(entry).toMatchObject({ tenantId: 'T-003', accountId: 'AC-006', fiscalYearId: 'FY-T003-2026', amount: 500_000, origin: 'INITIAL', status: 'FINAL', date: '2026-01-01' });
  });

  it('refuse un doublon — jamais d’écrasement silencieux d’une OpeningEntry FINAL existante', async () => {
    const duplicate = await financePositionService.createInitialOpeningEntry('T-003', 'AC-006', 'FY-T003-2026', 999_999);
    expect(duplicate).toBeNull();
  });

  it('refuse une caisse/un exercice d’un autre tenant', async () => {
    const wrongTenant = await financePositionService.createInitialOpeningEntry('T-003', 'AC-001', 'FY-T003-2026', 100);
    expect(wrongTenant).toBeNull();
  });
});

describe('financePositionService — memberFinancialPosition / memberFinancialPositions (étape 7)', () => {
  it('MEMBER_ALL_ACCOUNTS — Fatou (T-001) : savings + credit corrects, cohérent avec le moteur pur', async () => {
    const result = await financePositionService.memberFinancialPosition('T-001', { kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-001' }, '2026-08-31');
    expect(result.savings).toBe(100_000);
    expect(result.credit).toEqual({ loansReceived: 850_000, repayments: 158_667, outstanding: 793_333, loanCount: 1 });
  });

  it('MEMBER_ACCOUNT — pas de credit/distributions exposés', async () => {
    const result = await financePositionService.memberFinancialPosition('T-001', { kind: 'MEMBER_ACCOUNT', memberId: 'M-001', accountId: 'AC-002' }, '2026-08-31');
    expect(result.credit).toBeUndefined();
    expect(result.distributions).toBeUndefined();
  });

  it('isolation tenant — un membre de T-001 interrogé sous T-002 ne voit ni caisse ni prêt', async () => {
    const result = await financePositionService.memberFinancialPosition('T-002', { kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-001' }, '2026-08-31');
    expect(result.outOfScope).toBe(true);
    expect(result.credit).toEqual({ loansReceived: 0, repayments: 0, outstanding: 0, loanCount: 0 });
  });

  it('POINT CRITIQUE (câblage service) — Cheikh (T-001) : Loan L-004 sans Transaction PRET, loansReceived/outstanding corrects', async () => {
    const result = await financePositionService.memberFinancialPosition('T-001', { kind: 'MEMBER_ALL_ACCOUNTS', memberId: 'M-006' }, '2026-08-31');
    expect(result.credit).toEqual({ loansReceived: 2_100_000, repayments: 194_250, outstanding: 2_136_750, loanCount: 1 });
  });

  it('memberFinancialPositions — un résultat par membre, isolation identique', async () => {
    const results = await financePositionService.memberFinancialPositions('T-001', ['M-001', 'M-006'], undefined, '2026-08-31');
    expect(results).toHaveLength(2);
    const fatou = results.find((r) => r.scopeKey === 'member:M-001')!;
    const cheikh = results.find((r) => r.scopeKey === 'member:M-006')!;
    expect(fatou.savings).toBe(100_000);
    expect(cheikh.credit!.loansReceived).toBe(2_100_000);
  });
});
