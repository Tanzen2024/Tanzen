import { describe, it, expect } from 'vitest';
import { roleService } from './role.service';

describe('roleService', () => {
  it('roles and permissions are global configuration, not tenant-scoped by design', async () => {
    const roles = await roleService.listRoles();
    expect(roles.some((role) => role.id === 'role-admin')).toBe(true);
    const permissions = await roleService.listPermissions();
    expect(permissions.length).toBeGreaterThan(0);
  });

  it('DENY: listUsersForRole under tenant scope never includes users of another tenant', async () => {
    const result = await roleService.listUsersForRole('role-viewer', 'T-001', 'tenant');
    expect(result.every((user) => user.tenantId === 'T-001')).toBe(true);
  });

  it('PLATFORM BYPASS: listUsersForRole under platform scope includes users of every tenant', async () => {
    const result = await roleService.listUsersForRole('role-viewer', 'T-001', 'platform');
    expect(result.some((user) => user.tenantId !== 'T-001')).toBe(true);
  });
});
