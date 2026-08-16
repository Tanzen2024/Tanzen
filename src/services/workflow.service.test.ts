import { describe, it, expect } from 'vitest';
import { workflowService } from './workflow.service';

describe('workflowService — Definitions/Requests/Delegations/History', () => {
  it('ALLOW/DENY: listRequests and getRequest are scoped to the requesting tenant', async () => {
    const t002 = await workflowService.getRequest('T-002', 'WR-002');
    expect(t002?.id).toBe('WR-002');
    const denied = await workflowService.getRequest('T-001', 'WR-002');
    expect(denied).toBeNull();
  });

  it('ALLOW/DENY: listDefinitions is scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([workflowService.listDefinitions('T-001'), workflowService.listDefinitions('T-002')]);
    expect(t001.every((definition) => definition.tenantId === 'T-001')).toBe(true);
    expect(t002.every((definition) => definition.tenantId === 'T-002')).toBe(true);
  });

  it('ALLOW/DENY: listDelegations is scoped to the requesting tenant', async () => {
    const [t001, t002] = await Promise.all([workflowService.listDelegations('T-001'), workflowService.listDelegations('T-002')]);
    expect(t001.every((delegation) => delegation.tenantId === 'T-001')).toBe(true);
    expect(t002.every((delegation) => delegation.tenantId === 'T-002')).toBe(true);
  });

  it('ALLOW/DENY: listHistory never mixes steps from another tenant\'s requests', async () => {
    const [t001, t002] = await Promise.all([workflowService.listHistory('T-001'), workflowService.listHistory('T-002')]);
    expect(t001.every((entry) => entry.workflowRequestId.startsWith('WR-'))).toBe(true);
    const t002RequestIds = new Set(t002.map((entry) => entry.workflowRequestId));
    // WR-002 (pending, no acted steps yet) is T-002's own request; ensure no T-001 request id leaks into T-002's history.
    for (const entry of t001) expect(t002RequestIds.has(entry.workflowRequestId)).toBe(false);
  });

  it('DENY: listMyApprovals never surfaces another tenant\'s pending step, even with the matching permission', async () => {
    const result = await workflowService.listMyApprovals('T-002', ['cycles.manage']);
    expect(result.every((request) => request.tenantId === 'T-002')).toBe(true);
    expect(result.some((request) => request.id === 'WR-005')).toBe(false); // WR-005 belongs to T-001
  });

  it('ALLOW: listMyApprovals surfaces a pending step matching the held permission', async () => {
    const result = await workflowService.listMyApprovals('T-001', ['distributions.create']);
    expect(result.some((request) => request.id === 'WR-007')).toBe(true);
  });
});

describe('workflowService — DENY: cross-tenant mutation attempts', () => {
  it('submitAction refuses to act on a request of another tenant', async () => {
    const result = await workflowService.submitAction('T-001', 'WR-002', 'approve', 'Intrus');
    expect(result).toBeNull();
  });

  it('cancelRequest refuses to act on a request of another tenant', async () => {
    const result = await workflowService.cancelRequest('T-001', 'WR-002', 'Intrus');
    expect(result).toBeNull();
  });
});

describe('workflowService — INTEGRATION: submitAction advances currentStepOrder and completes the request (Phase 9)', () => {
  it('ALLOW: approving a non-final step advances currentStepOrder and sets status to inProgress', async () => {
    const request = await workflowService.submitAction('T-001', 'WR-007', 'approve', 'Amadou Mbaye', 'OK');
    expect(request?.currentStepOrder).toBe(2);
    expect(request?.status).toBe('inProgress');
    expect(request?.steps.find((step) => step.order === 1)?.status).toBe('approved');
  });

  it('ALLOW: approving the final step sets the whole request to approved', async () => {
    const request = await workflowService.submitAction('T-005', 'WR-001', 'approve', 'Amadou Mbaye', 'Décision finale OK');
    expect(request?.status).toBe('approved');
    expect(request?.steps.find((step) => step.order === 2)?.status).toBe('approved');
  });

  it('ALLOW: rejecting a step sets the whole request to rejected', async () => {
    const request = await workflowService.submitAction('T-002', 'WR-002', 'reject', 'Amadou Mbaye', 'Dossier incomplet');
    expect(request?.status).toBe('rejected');
    expect(request?.steps.find((step) => step.order === 1)?.status).toBe('rejected');
  });

  it('ALLOW: cancelRequest sets the request to cancelled for the owning tenant', async () => {
    const request = await workflowService.cancelRequest('T-001', 'WR-006', 'Fatou Ndiaye', 'Retiré');
    expect(request?.status).toBe('cancelled');
  });
});
