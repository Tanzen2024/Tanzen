import { describe, it, expect } from 'vitest';
import { sessionService } from './session.service';

describe('sessionService', () => {
  it('ALLOW: tenant scope sees only its own sessions', async () => {
    const result = await sessionService.list('T-001', 'tenant');
    expect(result.every((session) => session.tenantId === 'T-001')).toBe(true);
  });

  it('PLATFORM BYPASS: platform scope sees all sessions', async () => {
    const result = await sessionService.list('T-001', 'platform');
    expect(result.some((session) => session.tenantId === 'T-002')).toBe(true);
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
