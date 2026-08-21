import { describe, it, expect } from 'vitest';
import { tontinesService } from './tontines.service';

describe('tontinesService — Tontines', () => {
  it('ALLOW/DENY: listTontines and getTontine are scoped to the requesting tenant', async () => {
    const [t002] = await tontinesService.listTontines('T-002');
    expect(t002.tenantId).toBe('T-002');
    const result = await tontinesService.getTontine('T-001', t002.id);
    expect(result).toBeNull();
  });
});

describe('tontinesService — createTontine (Tontine.valueType)', () => {
  it('creates a MONEY tontine with the requesting tenant', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine de 10000', valueType: 'MONEY', tenantId: 'T-002' });
    expect(tontine.valueType).toBe('MONEY');
    expect(tontine.tenantId).toBe('T-002');
    expect(tontine.status).toBe('statusActive');
  });

  it('the historical structure field `type` no longer exists on the model — valueType is the sole classification', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Sans type historique', valueType: 'MONEY', tenantId: 'T-002' });
    expect('type' in tontine).toBe(false);
    expect(Object.keys(tontine).sort()).toEqual(['activeCycles', 'createdAt', 'id', 'memberCount', 'name', 'status', 'tenantId', 'totalContributions', 'valueType']);
  });

  it('creates a GOODS tontine', async () => {
    const tontine = await tontinesService.createTontine({ name: 'En nature', valueType: 'GOODS', tenantId: 'T-002' });
    expect(tontine.valueType).toBe('GOODS');
  });

  it('a newly created tontine is only visible to its own tenant (isolation preserved)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine isolée', valueType: 'MONEY', tenantId: 'T-003' });
    const ownTenant = await tontinesService.getTontine('T-003', tontine.id);
    const otherTenant = await tontinesService.getTontine('T-001', tontine.id);
    expect(ownTenant?.id).toBe(tontine.id);
    expect(otherTenant).toBeNull();
  });

  it('a tontine can be created without a first cycle (cycle organization stays optional)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Sans cycle', valueType: 'MONEY', tenantId: 'T-002' });
    const cycles = await tontinesService.listCyclesByTontine('T-002', tontine.id);
    expect(cycles).toEqual([]);
  });

  it('chaining createTontine then createCycle attaches the cycle to the new tontine as cycleNumber 1 (legacy Cycle service, kept working independently of TontineCreate — which now chains a Period instead)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Avec premier cycle', valueType: 'GOODS', tenantId: 'T-002' });
    const cycle = await tontinesService.createCycle('T-002', { tontineId: tontine.id, cycleNumber: 1, startDate: '2026-06-15', endDate: '2026-09-15', expectedTotal: 1_000_000 });
    expect(cycle?.tontineId).toBe(tontine.id);
    expect(cycle?.cycleNumber).toBe(1);
    const cycles = await tontinesService.listCyclesByTontine('T-002', tontine.id);
    expect(cycles.map((item) => item.id)).toEqual([cycle?.id]);
  });
});

describe('tontinesService — createTontine GOODS reference (item / quantity)', () => {
  it('a GOODS tontine can carry a reference item and quantity ("10 savons")', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine des savons', valueType: 'GOODS', tenantId: 'T-002', item: 'Savon', quantity: 10 });
    expect(tontine.item).toBe('Savon');
    expect(tontine.quantity).toBe(10);
  });

  it('a MONEY tontine does not carry item/quantity (undefined, not persisted)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine financière', valueType: 'MONEY', tenantId: 'T-002' });
    expect(tontine.item).toBeUndefined();
    expect(tontine.quantity).toBeUndefined();
  });

  it('createTontine uses tenantId exactly as provided by the caller (TontineCreate always passes currentTenant.id)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine isolée bis', valueType: 'GOODS', tenantId: 'T-003', item: 'Riz', quantity: 25 });
    expect(tontine.tenantId).toBe('T-003');
    const otherTenant = await tontinesService.getTontine('T-002', tontine.id);
    expect(otherTenant).toBeNull();
  });

  it('a GOODS tontine can also carry a reference unit ("10 pièces")', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine des savons (unité)', valueType: 'GOODS', tenantId: 'T-002', item: 'Savon', quantity: 10, unit: 'PIECE' });
    expect(tontine.unit).toBe('PIECE');
  });
});

describe('tontinesService — createTontine MONEY currency', () => {
  it('a MONEY tontine created with XAF (the UI default) persists the currency as provided', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine XAF', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF' });
    expect(tontine.currency).toBe('XAF');
  });

  it('a MONEY tontine can be created with a different currency (the user is free to change the default)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine EUR', valueType: 'MONEY', tenantId: 'T-002', currency: 'EUR' });
    expect(tontine.currency).toBe('EUR');
  });

  it('a GOODS tontine does not carry a currency (undefined, not persisted)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine sans devise', valueType: 'GOODS', tenantId: 'T-002', item: 'Sucre', quantity: 5, unit: 'SAC' });
    expect(tontine.currency).toBeUndefined();
  });
});

describe('tontinesService — Cycles: two-step tenant scoping via parent Tontine', () => {
  it('DENY: listCyclesByTontine returns an empty list for a tontine of another tenant', async () => {
    const result = await tontinesService.listCyclesByTontine('T-001', 'TON-001');
    expect(result).toEqual([]);
  });

  it('ALLOW: listCyclesByTontine returns cycles for the owning tenant', async () => {
    const result = await tontinesService.listCyclesByTontine('T-002', 'TON-001');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((cycle) => cycle.tenantId === 'T-002')).toBe(true);
  });

  it('DENY: getCycle returns null for a cycle of another tenant', async () => {
    const result = await tontinesService.getCycle('T-001', 'CYC-001');
    expect(result).toBeNull();
  });

  it('REGRESSION (Phase 8): listCyclesByMember requires tenantId and never leaks another tenant\'s cycles for a shared memberId', async () => {
    // M-001 (Fatou Ndiaye, T-001) also appears as a CycleMember inside CYC-002, which belongs to T-002.
    const asOwnTenant = await tontinesService.listCyclesByMember('T-002', 'M-001');
    const asOtherTenant = await tontinesService.listCyclesByMember('T-001', 'M-001');
    expect(asOwnTenant.some((cycle) => cycle.id === 'CYC-002')).toBe(true);
    expect(asOtherTenant.some((cycle) => cycle.id === 'CYC-002')).toBe(false);
  });

  it('DENY: createCycle refuses to write against a tontine of another tenant', async () => {
    const result = await tontinesService.createCycle('T-001', { tontineId: 'TON-001', cycleNumber: 99, startDate: '2026-01-01', endDate: '2026-12-31', expectedTotal: 1000 });
    expect(result).toBeNull();
  });

  it('DENY: addCycleMember refuses to write against a cycle of another tenant', async () => {
    const result = await tontinesService.addCycleMember('T-001', 'CYC-002', { memberId: 'M-999', memberName: 'Intrus', position: 5, expectedAmount: 100 });
    expect(result).toBeNull();
  });

  it('DENY: createDraw refuses to write against a cycle of another tenant', async () => {
    const result = await tontinesService.createDraw('T-001', { cycleId: 'CYC-002', drawNumber: 99, date: '2026-12-01', contributionPool: 100 });
    expect(result).toBeNull();
  });

  it('DENY: declareWinner refuses to write against a cycle of another tenant', async () => {
    const result = await tontinesService.declareWinner('T-001', 'CYC-002', { drawId: 'CD-006', winnerMemberId: 'CM-006', amountReceived: 100_000 });
    expect(result).toBeNull();
  });
});

describe('tontinesService — REGRESSION: cycle status transitions (Phase 8, SUSPENDED vs CLOSED bug)', () => {
  it('ALLOW: statusOpen can transition to statusSuspended', async () => {
    const result = await tontinesService.updateCycleStatus('T-005', 'CYC-003', 'statusSuspended');
    expect(result?.status).toBe('statusSuspended');
  });

  it('ALLOW: statusSuspended can transition back to statusOpen (reprise)', async () => {
    const result = await tontinesService.updateCycleStatus('T-003', 'CYC-004', 'statusOpen');
    expect(result?.status).toBe('statusOpen');
  });

  it('DENY: statusClosed is terminal — no outgoing transition is accepted', async () => {
    const result = await tontinesService.updateCycleStatus('T-002', 'CYC-001', 'statusOpen');
    expect(result).toBeNull();
  });

  it('DENY: statusDraft cannot jump directly to statusClosed (must go through statusOpen)', async () => {
    const result = await tontinesService.updateCycleStatus('T-001', 'CYC-005', 'statusClosed');
    expect(result).toBeNull();
  });
});

describe('tontinesService — INTEGRATION: declareWinner updates the CycleMember.hasWon side effect (Phase 8)', () => {
  it('ALLOW: declaring a winner marks the corresponding CycleMember as hasWon and completes the draw', async () => {
    const draw = await tontinesService.declareWinner('T-002', 'CYC-002', { drawId: 'CD-006', winnerMemberId: 'CM-006', amountReceived: 1_400_000 });
    expect(draw?.status).toBe('statusCompleted');
    expect(draw?.winnerMemberId).toBe('CM-006');

    const cycle = await tontinesService.getCycle('T-002', 'CYC-002');
    const winningMember = cycle?.members.find((member) => member.id === 'CM-006');
    expect(winningMember?.hasWon).toBe(true);
  });

  it('DENY: cannot declare a second winner for a draw that already has one', async () => {
    const result = await tontinesService.declareWinner('T-002', 'CYC-002', { drawId: 'CD-005', winnerMemberId: 'CM-007', amountReceived: 500_000 });
    expect(result).toBeNull();
  });
});

describe('tontinesService — purchaseMode (mandat refonte §13-16, MONEY uniquement)', () => {
  it('a MONEY tontine can be created "Sans achat" (WITHOUT_PURCHASE, le défaut)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine sans achat', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITHOUT_PURCHASE' });
    expect(tontine.purchaseMode).toBe('WITHOUT_PURCHASE');
  });

  it('a MONEY tontine can be created "Avec achat" (WITH_PURCHASE)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine avec achat', valueType: 'MONEY', tenantId: 'T-002', currency: 'XAF', purchaseMode: 'WITH_PURCHASE' });
    expect(tontine.purchaseMode).toBe('WITH_PURCHASE');
  });

  it('a GOODS tontine does not carry a purchaseMode (undefined, not persisted — the field is MONEY-only)', async () => {
    const tontine = await tontinesService.createTontine({ name: 'Tontine en nature sans achat', valueType: 'GOODS', tenantId: 'T-002', item: 'Riz', quantity: 10, unit: 'SAC' });
    expect(tontine.purchaseMode).toBeUndefined();
  });
});
