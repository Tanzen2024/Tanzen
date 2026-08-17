import { describe, it, expect } from 'vitest';
import { assemblyDecisionService } from './assembly-decision.service';
import { generalAssemblyService } from './general-assembly.service';
import { organizationService } from './organization.service';

async function createGA(tenantId: string, title: string, date = '2026-12-20') {
  const ga = await generalAssemblyService.createGeneralAssembly(tenantId, { title, assemblyDate: date, description: null });
  return ga!;
}

describe('assemblyDecisionService — CREATE (D-4C4-WEB-06)', () => {
  it('ALLOW: createAssemblyDecision succeeds for a GENERAL_ASSEMBLY meeting, starts at DRAFT, sequential decisionNumber', async () => {
    const ga = await createGA('T-001', 'AG Decisions A');
    const first = await assemblyDecisionService.createAssemblyDecision('T-001', ga.id, { title: 'Adopter le budget', description: 'Budget 2027', createdBy: 'U-001' });
    expect(first).not.toBeNull();
    expect(first?.status).toBe('DRAFT');
    expect(first?.decisionNumber).toBe(1);
    expect(first?.meetingId).toBe(ga.id);
    const second = await assemblyDecisionService.createAssemblyDecision('T-001', ga.id, { title: 'Élire le bureau', description: '', createdBy: 'U-001' });
    expect(second?.decisionNumber).toBe(2);
  });

  it('DENY: createAssemblyDecision refuses an empty title', async () => {
    const ga = await createGA('T-001', 'AG Decisions B');
    const result = await assemblyDecisionService.createAssemblyDecision('T-001', ga.id, { title: '   ', description: '', createdBy: 'U-001' });
    expect(result).toBeNull();
  });

  it('DENY: createAssemblyDecision refuses a REGULAR meeting', async () => {
    const meeting = (await organizationService.createMeeting('T-001', { title: 'Réunion ordinaire', date: '2026-12-21', location: 'Test', participants: 1, agenda: 'Test' }))!;
    const result = await assemblyDecisionService.createAssemblyDecision('T-001', meeting.id, { title: 'Decision invalide', description: '', createdBy: 'U-001' });
    expect(result).toBeNull();
  });

  it('DENY: createAssemblyDecision cannot target a meeting of another tenant', async () => {
    const ga = await createGA('T-001', 'AG Decisions Tenant A');
    const result = await assemblyDecisionService.createAssemblyDecision('T-002', ga.id, { title: 'Decision cross-tenant', description: '', createdBy: 'U-001' });
    expect(result).toBeNull();
  });
});

describe('assemblyDecisionService — lifecycle DRAFT → SUBMITTED → VOTING → DECIDED', () => {
  it('ALLOW: full happy path through all transitions', async () => {
    const ga = await createGA('T-001', 'AG Lifecycle A');
    const decision = await assemblyDecisionService.createAssemblyDecision('T-001', ga.id, { title: 'Decision cycle complet', description: '', createdBy: 'U-001' });
    const submitted = await assemblyDecisionService.submitAssemblyDecision('T-001', decision!.id);
    expect(submitted?.status).toBe('SUBMITTED');
    expect(submitted?.submittedAt).not.toBeNull();
    const voting = await assemblyDecisionService.startAssemblyDecisionVoting('T-001', decision!.id);
    expect(voting?.status).toBe('VOTING');
    const decided = await assemblyDecisionService.decideAssemblyDecision('T-001', decision!.id);
    expect(decided?.status).toBe('DECIDED');
    expect(decided?.decidedAt).not.toBeNull();
  });

  it('ALLOW: cancel from DRAFT', async () => {
    const ga = await createGA('T-001', 'AG Lifecycle B');
    const decision = await assemblyDecisionService.createAssemblyDecision('T-001', ga.id, { title: 'Decision annulée depuis DRAFT', description: '', createdBy: 'U-001' });
    const cancelled = await assemblyDecisionService.cancelAssemblyDecision('T-001', decision!.id);
    expect(cancelled?.status).toBe('CANCELLED');
  });

  it('ALLOW: cancel from SUBMITTED', async () => {
    const ga = await createGA('T-001', 'AG Lifecycle C');
    const decision = await assemblyDecisionService.createAssemblyDecision('T-001', ga.id, { title: 'Decision annulée depuis SUBMITTED', description: '', createdBy: 'U-001' });
    await assemblyDecisionService.submitAssemblyDecision('T-001', decision!.id);
    const cancelled = await assemblyDecisionService.cancelAssemblyDecision('T-001', decision!.id);
    expect(cancelled?.status).toBe('CANCELLED');
  });

  it('DENY: DECIDED is terminal — no outgoing transition accepted', async () => {
    const ga = await createGA('T-001', 'AG Lifecycle Terminal DECIDED');
    const decision = await assemblyDecisionService.createAssemblyDecision('T-001', ga.id, { title: 'Decision terminale', description: '', createdBy: 'U-001' });
    await assemblyDecisionService.submitAssemblyDecision('T-001', decision!.id);
    await assemblyDecisionService.startAssemblyDecisionVoting('T-001', decision!.id);
    await assemblyDecisionService.decideAssemblyDecision('T-001', decision!.id);
    expect(await assemblyDecisionService.submitAssemblyDecision('T-001', decision!.id)).toBeNull();
    expect(await assemblyDecisionService.startAssemblyDecisionVoting('T-001', decision!.id)).toBeNull();
    expect(await assemblyDecisionService.decideAssemblyDecision('T-001', decision!.id)).toBeNull();
    expect(await assemblyDecisionService.cancelAssemblyDecision('T-001', decision!.id)).toBeNull();
  });

  it('DENY: CANCELLED is terminal — no outgoing transition accepted', async () => {
    const ga = await createGA('T-001', 'AG Lifecycle Terminal CANCELLED');
    const decision = await assemblyDecisionService.createAssemblyDecision('T-001', ga.id, { title: 'Decision annulée terminale', description: '', createdBy: 'U-001' });
    await assemblyDecisionService.cancelAssemblyDecision('T-001', decision!.id);
    expect(await assemblyDecisionService.submitAssemblyDecision('T-001', decision!.id)).toBeNull();
    expect(await assemblyDecisionService.cancelAssemblyDecision('T-001', decision!.id)).toBeNull();
  });

  it('DENY: cannot skip a state (DRAFT → VOTING directly)', async () => {
    const ga = await createGA('T-001', 'AG Lifecycle No Skip');
    const decision = await assemblyDecisionService.createAssemblyDecision('T-001', ga.id, { title: 'Decision sans saut', description: '', createdBy: 'U-001' });
    const result = await assemblyDecisionService.startAssemblyDecisionVoting('T-001', decision!.id);
    expect(result).toBeNull();
  });

  it('DENY: cannot mutate a decision belonging to another tenant', async () => {
    const ga = await createGA('T-001', 'AG Lifecycle Cross Tenant');
    const decision = await assemblyDecisionService.createAssemblyDecision('T-001', ga.id, { title: 'Decision protégée', description: '', createdBy: 'U-001' });
    expect(await assemblyDecisionService.submitAssemblyDecision('T-002', decision!.id)).toBeNull();
    expect(await assemblyDecisionService.getAssemblyDecision('T-002', decision!.id)).toBeNull();
  });
});

describe('assemblyDecisionService — LIST — tenant isolation', () => {
  it('ALLOW: listAssemblyDecisionsByMeeting returns only decisions of the requesting tenant meeting', async () => {
    const ga = await createGA('T-001', 'AG List A');
    await assemblyDecisionService.createAssemblyDecision('T-001', ga.id, { title: 'D1', description: '', createdBy: 'U-001' });
    const result = await assemblyDecisionService.listAssemblyDecisionsByMeeting('T-001', ga.id);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((decision) => decision.meetingId === ga.id)).toBe(true);
  });

  it('DENY: listAssemblyDecisionsByMeeting returns empty for a meeting of another tenant', async () => {
    const ga = await createGA('T-001', 'AG List B');
    await assemblyDecisionService.createAssemblyDecision('T-001', ga.id, { title: 'D1', description: '', createdBy: 'U-001' });
    const result = await assemblyDecisionService.listAssemblyDecisionsByMeeting('T-002', ga.id);
    expect(result).toEqual([]);
  });
});
