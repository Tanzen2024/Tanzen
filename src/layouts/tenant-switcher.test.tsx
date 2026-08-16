import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';

/**
 * `tenant-context.tsx` calcule `ownTenant`/`scopedTenants` au chargement du
 * module (pas dans le composant), à partir de `currentUser.tenantId`. Pour
 * simuler différents utilisateurs dans le même fichier de test, chaque test
 * réinitialise le registre de modules (`vi.resetModules`) et mocke
 * `@/mocks/rbac.mocks` AVANT d'importer dynamiquement `TenantSwitcher` et son
 * arbre de providers, sinon `ownTenant` resterait figé sur la première
 * valeur importée.
 *
 * Depuis docs/FIX_TENANT_APP_SINGLE_TENANT.md, l'Application Tenant n'a plus
 * de variante interactive du TenantSwitcher — le comportement est identique
 * quel que soit `scope` (tenant ou platform) : un utilisateur ne voit jamais
 * qu'un seul tenant, sans sélection, recherche, ni liste d'autres tenants.
 */
async function renderTenantSwitcherAs(currentUser: { id: string; name: string; email: string; tenantId: string; roleIds: string[]; scope: 'tenant' | 'platform' }) {
  vi.resetModules();
  vi.doMock('@/mocks/rbac.mocks', async () => {
    const actual = await vi.importActual<typeof import('@/mocks/rbac.mocks')>('@/mocks/rbac.mocks');
    const role = actual.systemRoles.find((item) => item.id === currentUser.roleIds[0]);
    return { ...actual, currentUser: { ...currentUser, permissions: role?.permissions ?? [] } };
  });
  const { renderWithProviders } = await import('@/test/render-with-providers');
  const { TenantSwitcher } = await import('@/layouts/tenant-switcher');
  return renderWithProviders(<TenantSwitcher />);
}

describe('TenantSwitcher — single-tenant Application Tenant (no switching, any scope)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('tenant-scoped user (T-002) sees only a static label — no dropdown, search, or add-tenant', async () => {
    await renderTenantSwitcherAs({ id: 'U-004', name: 'Mamadou Sow', email: 'mamadou.sow@horizon.sn', tenantId: 'T-002', roleIds: ['role-manager'], scope: 'tenant' });

    expect(screen.getByText('Tontine Horizon')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Coopérative Sutura')).not.toBeInTheDocument();
    expect(screen.queryByText('Mutuelle Teranga')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/[Rr]echercher/)).not.toBeInTheDocument();
  });

  it('platform-scoped user (T-001) sees only their own tenant as a static label too — no dropdown, search, or add-tenant', async () => {
    await renderTenantSwitcherAs({ id: 'U-001', name: 'Amadou Mbaye', email: 'amadou.mbaye@sutura.sn', tenantId: 'T-001', roleIds: ['role-admin'], scope: 'platform' });

    expect(screen.getByText('Coopérative Sutura')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Tontine Horizon')).not.toBeInTheDocument();
    expect(screen.queryByText('Mutuelle Teranga')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/[Rr]echercher/)).not.toBeInTheDocument();
    expect(screen.queryByText(/[Aa]jouter un tenant/)).not.toBeInTheDocument();
  });
});
