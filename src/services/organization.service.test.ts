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

describe('organizationService — Governance (Assemblies/Meetings/Votes/BoardMembers)', () => {
  it('ALLOW: listAssemblies/listMeetings/listVotes/listBoardMembers scoped to the requesting tenant', async () => {
    const [assemblies, meetings, votes, boardMembers] = await Promise.all([
      organizationService.listAssemblies('T-001'),
      organizationService.listMeetings('T-001'),
      organizationService.listVotes('T-001'),
      organizationService.listBoardMembers('T-001'),
    ]);
    expect(assemblies.every((item) => item.tenantId === 'T-001')).toBe(true);
    expect(meetings.every((item) => item.tenantId === 'T-001')).toBe(true);
    expect(votes.every((item) => item.tenantId === 'T-001')).toBe(true);
    expect(boardMembers.every((item) => item.tenantId === 'T-001')).toBe(true);
  });

  it('DENY: T-002 sees no T-001 governance records in any list', async () => {
    const [assemblies, meetings, votes, boardMembers] = await Promise.all([
      organizationService.listAssemblies('T-002'),
      organizationService.listMeetings('T-002'),
      organizationService.listVotes('T-002'),
      organizationService.listBoardMembers('T-002'),
    ]);
    expect(assemblies.some((item) => item.id === 'AS-001')).toBe(false);
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

  it('ALLOW: createAssembly attaches the correct tenantId regardless of input', async () => {
    const assembly = await organizationService.createAssembly('T-002', { name: 'Test AG', type: 'generalAssembly', date: '2026-12-01', location: 'Test', participants: 10, agenda: 'Test' });
    expect(assembly.tenantId).toBe('T-002');
  });
});
