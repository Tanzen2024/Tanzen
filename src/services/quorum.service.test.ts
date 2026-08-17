import { describe, it, expect } from 'vitest';
import { quorumService } from './quorum.service';
import { generalAssemblyService } from './general-assembly.service';
import { attendanceService } from './attendance.service';
import { organizationService } from './organization.service';

async function createGeneralAssemblyMeeting(tenantId: string, title: string, date = '2026-12-15') {
  const ga = await generalAssemblyService.createGeneralAssembly(tenantId, { title, assemblyDate: date, description: null });
  return ga!;
}

describe('quorumService — compute & freeze (D-4C4-WEB-04/05)', () => {
  it('ALLOW: computes eligible/present counts and freezes a snapshot, COUNT threshold', async () => {
    const ga = await createGeneralAssemblyMeeting('T-001', 'AG Quorum COUNT');
    // T-001 members eligible (active): M-001, M-006 (at least)
    await attendanceService.createAttendance('T-001', { meetingId: ga.id, memberId: 'M-001', status: 'PRESENT', operationId: 'OP-Q1' });
    const snapshot = await quorumService.computeAndFreezeQuorumSnapshot('T-001', ga.id, { type: 'COUNT', value: 1 });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.presentMemberCount).toBe(1);
    expect(snapshot?.eligibleMemberCount).toBeGreaterThanOrEqual(2);
    expect(snapshot?.quorumThresholdType).toBe('COUNT');
    expect(snapshot?.quorumReached).toBe(true); // 1 present >= 1 required
  });

  it('ALLOW: PERCENTAGE threshold not reached when present/eligible ratio is below the threshold', async () => {
    const ga = await createGeneralAssemblyMeeting('T-001', 'AG Quorum PERCENTAGE');
    await attendanceService.createAttendance('T-001', { meetingId: ga.id, memberId: 'M-001', status: 'PRESENT', operationId: 'OP-Q2' });
    const snapshot = await quorumService.computeAndFreezeQuorumSnapshot('T-001', ga.id, { type: 'PERCENTAGE', value: 99 });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.quorumReached).toBe(false);
  });

  it('DENY: computeAndFreezeQuorumSnapshot refuses a second call for the same meeting (UNIQUE(meeting_id), figeage immuable)', async () => {
    const ga = await createGeneralAssemblyMeeting('T-001', 'AG Quorum Immuable');
    const first = await quorumService.computeAndFreezeQuorumSnapshot('T-001', ga.id, { type: 'COUNT', value: 0 });
    expect(first).not.toBeNull();
    const second = await quorumService.computeAndFreezeQuorumSnapshot('T-001', ga.id, { type: 'COUNT', value: 5 });
    expect(second).toBeNull();
    const stored = await quorumService.getQuorumSnapshot('T-001', ga.id);
    expect(stored?.quorumThresholdValue).toBe(0); // le premier snapshot n'a pas été écrasé
  });

  it('DENY: refuses to compute without a valid threshold (aucune valeur par défaut, §10 du mandat)', async () => {
    const ga = await createGeneralAssemblyMeeting('T-001', 'AG Quorum Sans Seuil');
    const result = await quorumService.computeAndFreezeQuorumSnapshot('T-001', ga.id, { type: 'COUNT', value: Number.NaN });
    expect(result).toBeNull();
  });

  it('DENY: refuses to compute for a REGULAR meeting (Quorum réservé à GENERAL_ASSEMBLY)', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion ordinaire', date: '2026-12-16', location: 'Test', participants: 1, agenda: 'Test' }))!;
    const result = await quorumService.computeAndFreezeQuorumSnapshot('T-001', meeting.id, { type: 'COUNT', value: 1 });
    expect(result).toBeNull();
  });

  it('DENY: computeAndFreezeQuorumSnapshot cannot target a meeting of another tenant', async () => {
    const ga = await createGeneralAssemblyMeeting('T-001', 'AG Quorum Tenant A');
    const result = await quorumService.computeAndFreezeQuorumSnapshot('T-002', ga.id, { type: 'COUNT', value: 1 });
    expect(result).toBeNull();
  });

  it('DENY: getQuorumSnapshot returns null for a meeting of another tenant', async () => {
    const ga = await createGeneralAssemblyMeeting('T-001', 'AG Quorum Tenant B');
    await quorumService.computeAndFreezeQuorumSnapshot('T-001', ga.id, { type: 'COUNT', value: 1 });
    const result = await quorumService.getQuorumSnapshot('T-002', ga.id);
    expect(result).toBeNull();
  });
});
