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
