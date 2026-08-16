import { describe, it, expect } from 'vitest';
import { userService } from './user.service';

describe('userService', () => {
  it('ALLOW: tenant scope sees only its own users', async () => {
    const result = await userService.list('T-001', 'tenant');
    expect(result.every((user) => user.tenantId === 'T-001')).toBe(true);
  });

  it('PLATFORM BYPASS: platform scope sees all users', async () => {
    const result = await userService.list('T-001', 'platform');
    expect(result.some((user) => user.tenantId === 'T-002')).toBe(true);
  });

  it('DENY: tenant scope get cannot fetch a user of another tenant', async () => {
    const [t002User] = await userService.list('T-002', 'tenant');
    const result = await userService.get('T-001', t002User.id, 'tenant');
    expect(result).toBeNull();
  });

  it('PLATFORM BYPASS: platform scope get can fetch a user of any tenant', async () => {
    const [t002User] = await userService.list('T-002', 'tenant');
    const result = await userService.get('T-001', t002User.id, 'platform');
    expect(result?.id).toBe(t002User.id);
  });

  it('DENY: update cannot mutate a user of another tenant under tenant scope', async () => {
    const [t002User] = await userService.list('T-002', 'tenant');
    const result = await userService.update('T-001', t002User.id, { name: 'Hacked' }, 'tenant');
    expect(result).toBeNull();
  });

  it('ALLOW: create attaches no password/MFA secret and defaults to invited status', async () => {
    const user = await userService.create({ name: 'Test User', email: 'test@example.com', tenantId: 'T-001', tenantName: 'Coopérative Sutura', roleIds: ['role-viewer'] });
    expect(user.status).toBe('invited');
    expect(user.mfaStatus).toBe('disabled');
    expect(user).not.toHaveProperty('password');
  });

  it('DENY: listByRole under tenant scope never includes users of another tenant', async () => {
    const result = await userService.listByRole('role-viewer', 'T-001', 'tenant');
    expect(result.every((user) => user.tenantId === 'T-001')).toBe(true);
  });
});
