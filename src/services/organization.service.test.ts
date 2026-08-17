import { describe, it, expect } from 'vitest';
import { organizationService } from './organization.service';

describe('organizationService — Tenants (special case: scope-gated repository)', () => {
  it('ALLOW: tenant scope sees only its own tenant in listTenants', async () => {
    const result = await organizationService.listTenants('T-001', 'tenant');
    expect(result.every((tenant) => tenant.id === 'T-001')).toBe(true);
    expect(result.length).toBe(1);
  });

  it('DENY: tenant scope getTenant cannot fetch a different tenant', async () => {
    const result = await organizationService.getTenant('T-001', 'T-002', 'tenant');
    expect(result).toBeNull();
  });

  it('PLATFORM BYPASS: platform scope sees all tenants in listTenants', async () => {
    const result = await organizationService.listTenants('T-001', 'platform');
    expect(result.length).toBeGreaterThan(1);
    expect(result.some((tenant) => tenant.id === 'T-002')).toBe(true);
  });

  it('PLATFORM BYPASS: platform scope getTenant can fetch any tenant', async () => {
    const result = await organizationService.getTenant('T-001', 'T-002', 'platform');
    expect(result?.id).toBe('T-002');
  });
});

describe('organizationService — Members (business data: never scope-bypassed)', () => {
  it('ALLOW: listMembers returns only members of the requesting tenant', async () => {
    const result = await organizationService.listMembers('T-001');
    expect(result.every((member) => member.tenantId === 'T-001')).toBe(true);
    expect(result.some((member) => member.id === 'M-001')).toBe(true);
  });

  it('ALLOW: getMember returns a member belonging to the requesting tenant', async () => {
    const result = await organizationService.getMember('T-001', 'M-001');
    expect(result?.id).toBe('M-001');
  });

  it('DENY: getMember returns undefined for a member of another tenant', async () => {
    const result = await organizationService.getMember('T-001', 'M-002');
    expect(result).toBeNull();
  });

  it('DENY: updateMember cannot mutate a member of another tenant', async () => {
    const before = await organizationService.getMember('T-002', 'M-002');
    const result = await organizationService.updateMember('T-001', 'M-002', { status: 'suspended' });
    expect(result).toBeNull();
    const after = await organizationService.getMember('T-002', 'M-002');
    expect(after?.status).toBe(before?.status);
  });
});

describe('organizationService — Governance (Meetings/Votes/BoardMembers)', () => {
  it('ALLOW: listMeetings/listVotes/listBoardMembers scoped to the requesting tenant', async () => {
    const [meetings, votes, boardMembers] = await Promise.all([
      organizationService.listMeetings('T-001'),
      organizationService.listVotes('T-001'),
      organizationService.listBoardMembers('T-001'),
    ]);
    expect(meetings.every((item) => item.tenantId === 'T-001')).toBe(true);
    expect(votes.every((item) => item.tenantId === 'T-001')).toBe(true);
    expect(boardMembers.every((item) => item.tenantId === 'T-001')).toBe(true);
  });

  it('DENY: T-002 sees no T-001 governance records in any list', async () => {
    const [meetings, votes, boardMembers] = await Promise.all([
      organizationService.listMeetings('T-002'),
      organizationService.listVotes('T-002'),
      organizationService.listBoardMembers('T-002'),
    ]);
    expect(meetings.some((item) => item.id === 'MT-001')).toBe(false);
    expect(votes.some((item) => item.id === 'V-001')).toBe(false);
    expect(boardMembers.some((item) => item.id === 'BM-001')).toBe(false);
  });

  it('DENY: updateMeetingMinutes cannot mutate a meeting of another tenant', async () => {
    const result = await organizationService.updateMeetingMinutes('T-002', 'MT-001', 'Injected minutes');
    expect(result).toBeNull();
  });

  it('DENY: endBoardMandate cannot mutate a board member of another tenant', async () => {
    const result = await organizationService.endBoardMandate('T-002', 'BM-001', '2026-01-01');
    expect(result).toBeNull();
  });

  it('DENY: updateVoteResult cannot mutate a vote of another tenant', async () => {
    const result = await organizationService.updateVoteResult('T-002', 'V-001', { yes: 999, no: 0, abstain: 0, result: 'adopted' });
    expect(result).toBeNull();
  });

  it('ALLOW: createMeeting always starts at PLANNED regardless of input', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion test', date: '2026-12-01', location: 'Test', participants: 5, agenda: 'Test' }))!;
    expect(meeting?.status).toBe('PLANNED');
  });

  it('ALLOW: createMeeting defaults to type=REGULAR when type is omitted (D-4C4-WEB-02)', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion REGULAR', date: '2026-12-02', location: 'Test', participants: 5, agenda: 'Test' }))!;
    expect(meeting?.type).toBe('REGULAR');
    expect(meeting?.description).toBeNull();
  });

  it('ALLOW: createMeeting accepts type=GENERAL_ASSEMBLY with a description — the unified entry point for both meeting kinds (correction post-implémentation Phase 4C-4)', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'AG créée via le formulaire unifié', date: '2026-12-03', location: 'Siège', participants: 40, agenda: '', type: 'GENERAL_ASSEMBLY', description: 'Bilan de fin d\'année' }))!;
    expect(meeting?.type).toBe('GENERAL_ASSEMBLY');
    expect(meeting?.description).toBe('Bilan de fin d\'année');
  });

  it('DENY: createMeeting refuses a GENERAL_ASSEMBLY with the same title+date as an existing one for the tenant', async () => {
    const first = (await organizationService.createMeeting('T-001', { title: 'AG Doublon', date: '2026-12-04', location: 'Siège', participants: 10, agenda: '', type: 'GENERAL_ASSEMBLY', description: null }))!;
    expect(first).not.toBeNull();
    const second = (await organizationService.createMeeting('T-001', { title: 'AG Doublon', date: '2026-12-04', location: 'Ailleurs', participants: 99, agenda: '', type: 'GENERAL_ASSEMBLY', description: null }))!;
    expect(second).toBeNull();
  });
});

describe('organizationService — Meeting lifecycle (D-4C3-TECH-01)', () => {
  it('ALLOW: PLANNED -> ONGOING -> COMPLETED', async () => {
    const created = (await organizationService.createMeeting('T-001', { title: 'Cycle complet', date: '2026-12-05', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const started = await organizationService.startMeeting('T-001', created.id);
    expect(started?.status).toBe('ONGOING');
    const completed = await organizationService.completeMeeting('T-001', created.id);
    expect(completed?.status).toBe('COMPLETED');
  });

  it('ALLOW: PLANNED -> CANCELLED', async () => {
    const created = (await organizationService.createMeeting('T-001', { title: 'Annulée direct', date: '2026-12-06', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const cancelled = await organizationService.cancelMeeting('T-001', created.id);
    expect(cancelled?.status).toBe('CANCELLED');
  });

  it('ALLOW: ONGOING -> CANCELLED', async () => {
    const created = (await organizationService.createMeeting('T-001', { title: 'Annulée en cours', date: '2026-12-07', location: 'Test', participants: 5, agenda: 'Test' }))!;
    await organizationService.startMeeting('T-001', created.id);
    const cancelled = await organizationService.cancelMeeting('T-001', created.id);
    expect(cancelled?.status).toBe('CANCELLED');
  });

  it('DENY: COMPLETED is terminal — no outgoing transition is accepted', async () => {
    const result = await organizationService.startMeeting('T-001', 'MT-004'); // MT-004 seeded as COMPLETED
    expect(result).toBeNull();
    const resultCancel = await organizationService.cancelMeeting('T-001', 'MT-004');
    expect(resultCancel).toBeNull();
    const resultComplete = await organizationService.completeMeeting('T-001', 'MT-004');
    expect(resultComplete).toBeNull();
  });

  it('DENY: CANCELLED is terminal — no outgoing transition is accepted', async () => {
    const created = (await organizationService.createMeeting('T-001', { title: 'Terminal cancelled', date: '2026-12-08', location: 'Test', participants: 5, agenda: 'Test' }))!;
    await organizationService.cancelMeeting('T-001', created.id);
    expect((await organizationService.startMeeting('T-001', created.id))).toBeNull();
    expect((await organizationService.completeMeeting('T-001', created.id))).toBeNull();
    expect((await organizationService.cancelMeeting('T-001', created.id))).toBeNull();
  });

  it('DENY: PLANNED -> COMPLETED is not a valid direct transition (must pass through ONGOING)', async () => {
    const created = (await organizationService.createMeeting('T-001', { title: 'Pas de saut', date: '2026-12-09', location: 'Test', participants: 5, agenda: 'Test' }))!;
    const result = await organizationService.completeMeeting('T-001', created.id);
    expect(result).toBeNull();
  });

  it('DENY: startMeeting/completeMeeting/cancelMeeting cannot mutate a meeting of another tenant', async () => {
    expect((await organizationService.startMeeting('T-002', 'MT-001'))).toBeNull();
    expect((await organizationService.completeMeeting('T-002', 'MT-001'))).toBeNull();
    expect((await organizationService.cancelMeeting('T-002', 'MT-001'))).toBeNull();
  });

  it('ALLOW: getMeeting returns a meeting belonging to the requesting tenant', async () => {
    const result = await organizationService.getMeeting('T-001', 'MT-001');
    expect(result?.id).toBe('MT-001');
  });

  it('DENY: getMeeting returns null for a meeting of another tenant', async () => {
    const result = await organizationService.getMeeting('T-002', 'MT-001');
    expect(result).toBeNull();
  });
});
