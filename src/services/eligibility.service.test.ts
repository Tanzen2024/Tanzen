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
    // M-004 : migré par D-MEM-04 (PENDING → ACTIVE, 2026-08-18) — 'active' depuis sa date
    // d'adhésion (2024-02-15). Ce test vérifie la même propriété d'historisation qu'avant
    // (un changement de statut n'est reflété qu'à partir de sa date d'enregistrement), avec
    // une transition active → suspended plutôt que pending → active (vocabulaire retiré,
    // cf. D-MEM-04).
    const before = await organizationService.getMember('T-004', 'M-004');
    expect(before?.status).toBe('active');
    const changeDate = new Date().toISOString().slice(0, 10);
    await organizationService.updateMember('T-004', 'M-004', { status: 'suspended' });
    const after = await organizationService.getMember('T-004', 'M-004');
    expect(after?.status).toBe('suspended');
    expect(after?.statusHistory.length).toBe(2);
    expect(getMemberStatusAt(after!, '2024-02-15')).toBe('active'); // date d'adhésion, avant le changement
    expect(getMemberStatusAt(after!, changeDate)).toBe('suspended');
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

  it('ALLOW: eligibility uses the historized status at the meeting date, not the member\'s current status (règle 4 du mandat)', async () => {
    // M-007 (T-002) est 'active' en seed, sans transition antérieure. On la suspend
    // aujourd'hui, puis on vérifie qu'une réunion antérieure à cette suspension reste
    // évaluée avec le statut historisé de l'époque ('active'), pas le statut courant
    // ('suspended') — la même propriété que l'ancien test, sans dépendre de 'pending'
    // (vocabulaire retiré par D-MEM-04).
    const beforeSuspension = meetingFor('T-002', '2026-01-01');
    const memberBefore = await organizationService.getMember('T-002', 'M-007');
    const resultBefore = eligibilityService.isMemberEligibleForGeneralAssembly('T-002', memberBefore!, beforeSuspension);
    expect(resultBefore.eligible).toBe(true);

    await organizationService.updateMember('T-002', 'M-007', { status: 'suspended' });
    const memberAfter = await organizationService.getMember('T-002', 'M-007');
    const resultStillBefore = eligibilityService.isMemberEligibleForGeneralAssembly('T-002', memberAfter as Member, beforeSuspension);
    // Même réunion (même date, antérieure à la suspension) réévaluée après la suspension :
    // doit rester éligible, car c'est le statut historisé à la date de la réunion qui compte.
    expect(resultStillBefore.eligible).toBe(true);

    const todayMeeting = meetingFor('T-002', new Date().toISOString().slice(0, 10));
    const resultToday = eligibilityService.isMemberEligibleForGeneralAssembly('T-002', memberAfter as Member, todayMeeting);
    expect(resultToday.eligible).toBe(false);
    expect(resultToday.reason).toBe('notActiveAtMeetingDate');
  });
});
