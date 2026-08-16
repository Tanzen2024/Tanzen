import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';

/**
 * `role-admin` (l'utilisateur mocké par défaut) détient TOUTES les
 * permissions du catalogue — impossible d'observer un cas "refusé" sans
 * simuler un utilisateur à permissions restreintes (`role-viewer`, lecture
 * seule). Même technique d'isolation de module que pour `TenantSwitcher`.
 */
async function renderGateAs(roleId: 'role-admin' | 'role-viewer', permission: string) {
  vi.resetModules();
  vi.doMock('@/mocks/rbac.mocks', async () => {
    const actual = await vi.importActual<typeof import('@/mocks/rbac.mocks')>('@/mocks/rbac.mocks');
    const role = actual.systemRoles.find((item) => item.id === roleId)!;
    return { ...actual, currentUser: { ...actual.currentUser, roleIds: [roleId], permissions: role.permissions, scope: role.scope } };
  });
  const { renderWithProviders } = await import('@/test/render-with-providers');
  const { PermissionGate } = await import('@/components/permission-gate');
  return renderWithProviders(
    <PermissionGate permission={permission as never} fallback={<span>Fallback shown</span>}>
      <span>Protected action</span>
    </PermissionGate>,
  );
}

describe('PermissionGate', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('ALLOW: renders children when the current user holds the permission', async () => {
    await renderGateAs('role-viewer', 'members.read');
    expect(screen.getByText('Protected action')).toBeInTheDocument();
    expect(screen.queryByText('Fallback shown')).not.toBeInTheDocument();
  });

  it('DENY: renders the fallback (not the children) when the permission is missing', async () => {
    await renderGateAs('role-viewer', 'members.delete');
    expect(screen.queryByText('Protected action')).not.toBeInTheDocument();
    expect(screen.getByText('Fallback shown')).toBeInTheDocument();
  });

  it('DENY: renders nothing when no fallback is provided and the permission is missing', async () => {
    vi.resetModules();
    vi.doMock('@/mocks/rbac.mocks', async () => {
      const actual = await vi.importActual<typeof import('@/mocks/rbac.mocks')>('@/mocks/rbac.mocks');
      const role = actual.systemRoles.find((item) => item.id === 'role-viewer')!;
      return { ...actual, currentUser: { ...actual.currentUser, roleIds: ['role-viewer'], permissions: role.permissions, scope: role.scope } };
    });
    const { renderWithProviders } = await import('@/test/render-with-providers');
    const { PermissionGate } = await import('@/components/permission-gate');
    renderWithProviders(<PermissionGate permission={'members.delete' as never}><span>Protected action</span></PermissionGate>);
    expect(screen.queryByText('Protected action')).not.toBeInTheDocument();
  });
});
