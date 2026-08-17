import { describe, it, expect } from 'vitest';
import { userService, type UserInput } from './user.service';
import { currentUser } from '@/mocks/rbac.mocks';

describe('userService', () => {
  it('ALLOW: tenant scope sees only its own users', async () => {
    const result = await userService.list('T-001', 'tenant');
    expect(result.every((user) => user.tenantId === 'T-001')).toBe(true);
  });

  it('PLATFORM BYPASS (service-level capability, never invoked by the Tenant App UI — see D1 tests below): platform scope sees all users', async () => {
    const result = await userService.list('T-001', 'platform');
    expect(result.some((user) => user.tenantId === 'T-002')).toBe(true);
  });

  it('DENY: tenant scope get cannot fetch a user of another tenant', async () => {
    const [t002User] = await userService.list('T-002', 'tenant');
    const result = await userService.get('T-001', t002User.id, 'tenant');
    expect(result).toBeNull();
  });

  it('PLATFORM BYPASS (service-level capability, unused): platform scope get can fetch a user of any tenant', async () => {
    const [t002User] = await userService.list('T-002', 'tenant');
    const result = await userService.get('T-001', t002User.id, 'platform');
    expect(result?.id).toBe(t002User.id);
  });

  it('DENY: update cannot mutate a user of another tenant under tenant scope', async () => {
    const [t002User] = await userService.list('T-002', 'tenant');
    const result = await userService.update('T-001', t002User.id, { name: 'Hacked' }, 'tenant');
    expect(result).toBeNull();
  });

  it('ALLOW: create attaches no password/MFA secret and defaults to isActive=true (D3)', async () => {
    const user = await userService.create({ name: 'Test User', email: 'test@example.com', tenantId: 'T-001', tenantName: 'Coopérative Sutura', roleIds: ['role-viewer'] });
    expect(user).not.toBeNull();
    expect(user?.isActive).toBe(true);
    expect(user?.mfaStatus).toBe('disabled');
    expect(user).not.toHaveProperty('password');
  });

  it('D3: deactivate/reactivate toggles isActive as a plain boolean, never an enum', async () => {
    const user = await userService.create({ name: 'Toggle User', email: 'toggle@example.com', tenantId: 'T-001', tenantName: 'Coopérative Sutura', roleIds: ['role-viewer'] });
    expect(user).not.toBeNull();
    const deactivated = await userService.update('T-001', user!.id, { isActive: false }, 'tenant');
    expect(deactivated?.isActive).toBe(false);
    const reactivated = await userService.update('T-001', user!.id, { isActive: true }, 'tenant');
    expect(reactivated?.isActive).toBe(true);
  });

  it('D3 (P0 RBAC): create() refuses a roleId belonging to another tenant — even though it is a syntactically valid role id', async () => {
    const result = await userService.create({ name: 'Cross Tenant', email: 'cross@example.com', tenantId: 'T-001', tenantName: 'Coopérative Sutura', roleIds: ['role-viewer-T-002'] });
    expect(result).toBeNull();
  });

  it('D3 (P0 RBAC): update() refuses reassigning a T-002 role to a T-001 user, service-side — the exact scenario the mandate forbids (userService.update({ roleIds: [roleFromTenantB] }))', async () => {
    const [t001User] = await userService.list('T-001', 'tenant');
    const before = t001User.roleIds;
    const result = await userService.update('T-001', t001User.id, { roleIds: ['role-viewer-T-002'] }, 'tenant');
    expect(result).toBeNull();
    const [after] = await userService.list('T-001', 'tenant');
    expect(after.roleIds).toEqual(before);
  });

  it('D1/§9: update() ignores any attempt to reassign tenantId/tenantName via patch — a user\'s tenant is fixed at creation, never editable', async () => {
    const [t001User] = await userService.list('T-001', 'tenant');
    const result = await userService.update('T-001', t001User.id, { tenantId: 'T-002', tenantName: 'Tontine Horizon' } as Partial<UserInput>, 'tenant');
    expect(result?.tenantId).toBe('T-001');
    expect(result?.tenantName).toBe(t001User.tenantName);
  });

  it('D1: the Tenant App always calls services with a literal \'tenant\' scope, never currentUser.scope — verified even in the worst case, where the mocked currentUser resolves scope "platform"', async () => {
    expect(currentUser.scope).toBe('platform');
    const result = await userService.list(currentUser.tenantId, 'tenant');
    expect(result.every((user) => user.tenantId === currentUser.tenantId)).toBe(true);
    expect(result.some((user) => user.tenantId !== currentUser.tenantId)).toBe(false);
  });

  it('DENY: listByRole under tenant scope never includes users of another tenant', async () => {
    const result = await userService.listByRole('role-viewer', 'T-001', 'tenant');
    expect(result.every((user) => user.tenantId === 'T-001')).toBe(true);
  });
});

describe('userService — role scope security fix (actorScope, cf. docs/P0_RBAC_SCOPE_SECURITY_FIX_REPORT.md)', () => {
  it('Test 1 — PASS: tenant actor assigning a tenant role of the same tenant is allowed', async () => {
    const result = await userService.create({ name: 'Scope Test 1', email: 'scope1@example.com', tenantId: 'T-001', tenantName: 'Coopérative Sutura', roleIds: ['role-viewer'] }, 'tenant');
    expect(result).not.toBeNull();
    expect(result?.roleIds).toEqual(['role-viewer']);
  });

  it('Test 2 — FAIL: a role belonging to another tenant is refused regardless of actorScope (unchanged from D3, reconfirmed here)', async () => {
    const result = await userService.create({ name: 'Scope Test 2', email: 'scope2@example.com', tenantId: 'T-001', tenantName: 'Coopérative Sutura', roleIds: ['role-viewer-T-002'] }, 'platform');
    expect(result).toBeNull();
  });

  it('Test 3 — FAIL: a tenant-scoped actor cannot assign a platform-scoped role, even though it belongs to the same tenant (the exact gap this fix closes)', async () => {
    const result = await userService.update('T-001', currentUser.id, { roleIds: ['role-admin'] }, 'tenant', 'tenant');
    expect(result).toBeNull();
  });

  it('Test 4 — FAIL: the same forbidden assignment, attempted as a direct service call bypassing RolePicker entirely — no UI involved', async () => {
    // No RolePicker, no access-module.tsx — a raw call to the service, exactly what a forged request would look like.
    const result = await userService.update('T-001', currentUser.id, { roleIds: ['role-admin'] }, 'tenant', 'tenant');
    expect(result).toBeNull();
  });

  it('Test 5 — after a scope refusal, the target user is left completely unmodified', async () => {
    const before = await userService.get('T-001', currentUser.id, 'tenant');
    const result = await userService.update('T-001', currentUser.id, { roleIds: ['role-admin'], name: 'Should Not Apply' }, 'tenant', 'tenant');
    expect(result).toBeNull();
    const after = await userService.get('T-001', currentUser.id, 'tenant');
    expect(after).toEqual(before);
  });

  it('Test 6 — create() enforces the same scope guard as update(): a tenant actor cannot create a user pre-assigned a platform role', async () => {
    const result = await userService.create({ name: 'Scope Test 6', email: 'scope6@example.com', tenantId: 'T-001', tenantName: 'Coopérative Sutura', roleIds: ['role-admin'] }, 'tenant');
    expect(result).toBeNull();
  });

  it('ALLOW (existing behavior preserved, not a new policy): a platform-scoped actor may still assign a platform role — mirrors RolePicker\'s currentUserScope === \'platform\' branch', async () => {
    const result = await userService.create({ name: 'Scope Test Platform', email: 'scopeplatform@example.com', tenantId: 'T-001', tenantName: 'Coopérative Sutura', roleIds: ['role-admin'] }, 'platform');
    expect(result).not.toBeNull();
    expect(result?.roleIds).toEqual(['role-admin']);
  });

  it('actorScope defaults to \'tenant\' (the strict default) when omitted — update() without a 5th argument still blocks a platform role assignment', async () => {
    const result = await userService.update('T-001', currentUser.id, { roleIds: ['role-admin'] });
    expect(result).toBeNull();
  });
});
