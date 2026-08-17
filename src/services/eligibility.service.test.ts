import { describe, it, expect } from 'vitest';
import { eligibilityService, getMemberStatusAt } from './eligibility.service';
import { organizationService } from './organization.service';
import type { Member } from '@/mocks/organization/members';
import type { Meeting } from '@/mocks/organization/governance';

const meetingFor = (tenantId: string, date: string): Meeting => ({ id: 'MT-TEST', tenantId, title: 'Test', date, location: '', participants: 0, agenda: '', minutes: null, status: 'PLANNED', type: 'GENERAL_ASSEMBLY', description: null });

describe('getMemberStatusAt — D-4C4-WEB-03 historisation', () => {
  it('returns the single seeded status for a member with no recorded transition', async () => {
    const member = await organizationService.getMember('T-001', 'M-001');
    expect(getMemberStatusAt(member!, '2020-01-01')).toBe('active'); // avant même joinedAt : premier statut connu par défaut
    expect(getMemberStatusAt(member!, '2026-01-01')).toBe('active');
  });

  it('reflects a status change only from the date it was recorded (append-only history)', async () => {
    const before = await organizationService.getMember('T-004', 'M-004'); // pending
    expect(before?.status).toBe('pending');
    const changeDate = new Date().toISOString().slice(0, 10);
    await organizationService.updateMember('T-004', 'M-004', { status: 'active' });
    const after = await organizationService.getMember('T-004', 'M-004');
    expect(after?.status).toBe('active');
    expect(after?.statusHistory.length).toBe(2);
    expect(getMemberStatusAt(after!, '2024-02-15')).toBe('pending'); // date d'adhésion, avant le changement
    expect(getMemberStatusAt(after!, changeDate)).toBe('active');
  });

  it('does not append a duplicate history entry when the status does not actually change', async () => {
    const before = await organizationService.getMember('T-002', 'M-002'); // active
    const historyLengthBefore = before!.statusHistory.length;
    await organizationService.updateMember('T-002', 'M-002', { status: 'active' });
    const after = await organizationService.getMember('T-002', 'M-002');
    expect(after?.statusHistory.length).toBe(historyLengthBefore);
  });
});

describe('eligibilityService.isMemberEligibleForGeneralAssembly — D-4C4-WEB-03', () => {
  it('ALLOW: an active member of the same tenant, at a meeting of the same tenant, is eligible', async () => {
    const member = await organizationService.getMember('T-001', 'M-001');
    const meeting = meetingFor('T-001', '2026-06-15');
    const result = eligibilityService.isMemberEligibleForGeneralAssembly('T-001', member!, meeting);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('DENY: a member of another tenant is never eligible (tenantMismatch)', async () => {
    const member = await organizationService.getMember('T-002', 'M-002'); // T-002
    const meeting = meetingFor('T-002', '2026-06-15');
    const result = eligibilityService.isMemberEligibleForGeneralAssembly('T-001', member!, meeting); // requester = T-001
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('tenantMismatch');
  });

  it('DENY: a meeting belonging to another tenant than the requester is never eligible (tenantMismatch)', async () => {
    const member = await organizationService.getMember('T-001', 'M-001');
    const meeting = meetingFor('T-002', '2026-06-15'); // meeting tenant differs
    const result = eligibilityService.isMemberEligibleForGeneralAssembly('T-001', member!, meeting);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('tenantMismatch');
  });

  it('DENY: an inactive member is not eligible (notActiveAtMeetingDate)', async () => {
    const member = await organizationService.getMember('T-005', 'M-005'); // inactive
    const meeting = meetingFor('T-005', '2026-06-15');
    const result = eligibilityService.isMemberEligibleForGeneralAssembly('T-005', member!, meeting);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('notActiveAtMeetingDate');
  });

  it('DENY: a suspended member is not eligible', async () => {
    const member = await organizationService.getMember('T-003', 'M-008'); // suspended
    const meeting = meetingFor('T-003', '2026-06-15');
    const result = eligibilityService.isMemberEligibleForGeneralAssembly('T-003', member!, meeting);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('notActiveAtMeetingDate');
  });

  it('DENY: a member active today but not yet active at the meeting date is not eligible (règle 4 du mandat)', async () => {
    const beforeDate = '2024-01-01';
    await organizationService.getMember('T-004', 'M-004'); // ensure exists
    const member = await organizationService.getMember('T-004', 'M-004'); // now 'active' since the earlier test in this suite ran updateMember
    // Construct a meeting dated before the member ever joined/activated to prove the historized check, not the current status, is used.
    const meeting = meetingFor('T-004', beforeDate);
    const result = eligibilityService.isMemberEligibleForGeneralAssembly('T-004', member as Member, meeting);
    // joinedAt for M-004 is 2024-02-15 (pending at the time) — before that date, status history has no entry, getMemberStatusAt falls back to the earliest known entry ('pending').
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('notActiveAtMeetingDate');
  });
});
