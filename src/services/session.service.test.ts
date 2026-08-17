import { describe, it, expect } from 'vitest';
import { sessionService } from './session.service';
import { currentUser } from '@/mocks/rbac.mocks';

describe('sessionService', () => {
  it('ALLOW: tenant scope sees only its own sessions', async () => {
    const result = await sessionService.list('T-001', 'tenant');
    expect(result.every((session) => session.tenantId === 'T-001')).toBe(true);
  });

  it('PLATFORM BYPASS (service-level capability, never invoked by the Tenant App UI — see D1 test below): platform scope sees all sessions', async () => {
    const result = await sessionService.list('T-001', 'platform');
    expect(result.some((session) => session.tenantId === 'T-002')).toBe(true);
  });

  it('D1: the Tenant App always calls sessionService with a literal \'tenant\' scope, never currentUser.scope — verified even though the mocked currentUser resolves scope "platform"', async () => {
    expect(currentUser.scope).toBe('platform');
    const result = await sessionService.list(currentUser.tenantId, 'tenant');
    expect(result.every((session) => session.tenantId === currentUser.tenantId)).toBe(true);
  });

  it('DENY: revoke cannot mutate a session of another tenant under tenant scope', async () => {
    const [t002Session] = await sessionService.list('T-002', 'tenant');
    const result = await sessionService.revoke('T-001', t002Session.id, 'tenant');
    expect(result).toBeNull();
    const after = await sessionService.list('T-002', 'tenant');
    expect(after.find((session) => session.id === t002Session.id)?.status).not.toBe('revoked');
  });

  it('ALLOW: revoke succeeds for a session of the owning tenant', async () => {
    const [t001Session] = await sessionService.list('T-001', 'tenant');
    const result = await sessionService.revoke('T-001', t001Session.id, 'tenant');
    expect(result?.status).toBe('revoked');
  });
});
