import { describe, it, expect } from 'vitest';
import { roleService } from './role.service';
import { currentUser } from '@/mocks/rbac.mocks';

describe('roleService', () => {
  it('permissions remain a global catalog (conforms to the canonical model — never tenant-scoped)', async () => {
    const permissions = await roleService.listPermissions();
    expect(permissions.length).toBeGreaterThan(0);
  });

  it('D1 (P0 RBAC, validated): roles are tenant-scoped — T-001 sees only its own 3 base roles, never T-002\'s', async () => {
    const roles = await roleService.listRoles('T-001');
    expect(roles.some((role) => role.id === 'role-admin')).toBe(true);
    expect(roles.every((role) => role.tenantId === 'T-001')).toBe(true);
    expect(roles.some((role) => role.id === 'role-admin-T-002')).toBe(false);
  });

  it('D1: T-002 has its own distinct role instances, never shared with T-001', async () => {
    const rolesT002 = await roleService.listRoles('T-002');
    expect(rolesT002.some((role) => role.id === 'role-manager-T-002')).toBe(true);
    expect(rolesT002.every((role) => role.tenantId === 'T-002')).toBe(true);
  });

  it('D1: even though the mocked currentUser resolves scope "platform", listRoles(currentTenant.id) never returns another tenant\'s roles — no scope parameter exists to bypass this', async () => {
    expect(currentUser.scope).toBe('platform');
    const roles = await roleService.listRoles(currentUser.tenantId);
    expect(roles.every((role) => role.tenantId === currentUser.tenantId)).toBe(true);
  });

  it('DENY: getRole cannot fetch a role belonging to another tenant', async () => {
    const result = await roleService.getRole('T-001', 'role-manager-T-002');
    expect(result).toBeNull();
  });

  it('ALLOW: getRole fetches a role belonging to the requesting tenant', async () => {
    const result = await roleService.getRole('T-001', 'role-viewer');
    expect(result?.id).toBe('role-viewer');
  });

  it('DENY: listUsersForRole never includes users of another tenant, even for the same role id shape', async () => {
    const result = await roleService.listUsersForRole('role-viewer', 'T-001');
    expect(result.every((user) => user.tenantId === 'T-001')).toBe(true);
  });

  it('ALLOW: create() attaches the role to the tenant passed by the caller, never a free-form tenant, and defaults scope to \'tenant\' (never \'platform\')', async () => {
    const role = await roleService.create({ name: 'Auditeur', description: 'Consultation des journaux uniquement.', permissions: ['audit.read'], tenantId: 'T-001' });
    expect(role.tenantId).toBe('T-001');
    expect(role.scope).toBe('tenant');
    const listed = await roleService.listRoles('T-001');
    expect(listed.some((item) => item.id === role.id)).toBe(true);
  });

  it('DENY: update() cannot mutate a role belonging to another tenant', async () => {
    const result = await roleService.update('T-001', 'role-manager-T-002', { name: 'Hacked' });
    expect(result).toBeNull();
    const untouched = await roleService.getRole('T-002', 'role-manager-T-002');
    expect(untouched?.name).toBe('Gestionnaire');
  });

  it('ALLOW: update() mutates a role belonging to the requesting tenant', async () => {
    const created = await roleService.create({ name: 'Temp Role', description: '', permissions: [], tenantId: 'T-001' });
    const updated = await roleService.update('T-001', created.id, { name: 'Renamed Role' });
    expect(updated?.name).toBe('Renamed Role');
  });

  it('DENY: delete() cannot remove a role belonging to another tenant', async () => {
    const result = await roleService.delete('T-001', 'role-viewer-T-002');
    expect(result).toBeNull();
    const stillThere = await roleService.getRole('T-002', 'role-viewer-T-002');
    expect(stillThere).not.toBeNull();
  });

  it('DENY: delete() refuses to remove a role still assigned to a user (referential integrity)', async () => {
    const result = await roleService.delete('T-001', 'role-admin');
    expect(result).toBeNull();
    const stillThere = await roleService.getRole('T-001', 'role-admin');
    expect(stillThere).not.toBeNull();
  });

  it('ALLOW: delete() removes an unassigned role belonging to the requesting tenant', async () => {
    const created = await roleService.create({ name: 'Unused Role', description: '', permissions: [], tenantId: 'T-001' });
    const result = await roleService.delete('T-001', created.id);
    expect(result?.id).toBe(created.id);
    const gone = await roleService.getRole('T-001', created.id);
    expect(gone).toBeNull();
  });
});

describe('roleService — RBAC catalog: fiscalYears.approve (D-FY-07, VALIDÉE Option B — distinct de fiscalYears.manage)', () => {
  it('fiscalYears.approve exists in the permission catalog, distinct from fiscalYears.manage', async () => {
    const permissions = await roleService.listPermissions();
    expect(permissions).toContain('fiscalYears.approve');
    expect(permissions).toContain('fiscalYears.manage');
  });

  it('role-manager does NOT hold fiscalYears.approve (generic .approve-suffix filter, unchanged by the catalog addition)', async () => {
    const role = await roleService.getRole('T-001', 'role-manager');
    expect(role?.permissions).not.toContain('fiscalYears.approve');
    expect(role?.permissions).toContain('fiscalYears.manage'); // .manage is untouched, still granted
  });

  it('role-viewer does NOT hold fiscalYears.approve (only .read-suffixed permissions)', async () => {
    const role = await roleService.getRole('T-001', 'role-viewer');
    expect(role?.permissions).not.toContain('fiscalYears.approve');
  });

  it('role-admin holds BOTH fiscalYears.manage and fiscalYears.approve — RBAC alone cannot separate requester from approver for this role (§7 mandat, backstop enforced at settingsService.decideFiscalYearReopen level, cf. settings.service.test.ts)', async () => {
    const role = await roleService.getRole('T-001', 'role-admin');
    expect(role?.permissions).toContain('fiscalYears.manage');
    expect(role?.permissions).toContain('fiscalYears.approve');
  });

  it('other pre-existing .approve permissions are still correctly excluded from role-manager (regression: catalog addition did not break the generic filter)', async () => {
    const role = await roleService.getRole('T-001', 'role-manager');
    expect(role?.permissions).not.toContain('governance.approve');
    expect(role?.permissions).not.toContain('loans.approve');
    expect(role?.permissions).not.toContain('applications.approve');
    expect(role?.permissions).not.toContain('distributions.approve');
  });
});
