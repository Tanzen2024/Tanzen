import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

/**
 * `tenant-context.tsx` calcule `ownTenant`/`scopedTenants` au chargement du
 * module (pas dans le composant), à partir de `currentUser.tenantId`. Pour
 * simuler différents utilisateurs dans le même fichier de test, chaque test
 * réinitialise le registre de modules (`vi.resetModules`) et mocke
 * `@/mocks/rbac.mocks` AVANT d'importer dynamiquement `TenantBreadcrumb` et
 * son arbre de providers, sinon `ownTenant` resterait figé sur la première
 * valeur importée.
 *
 * Depuis docs/FIX_TENANT_APP_SINGLE_TENANT.md, l'Application Tenant n'a
 * jamais de variante interactive de ce bloc — le comportement est identique
 * quel que soit `scope` (tenant ou platform) : un utilisateur ne voit jamais
 * qu'un seul tenant, sans sélection, recherche, ni liste d'autres tenants.
 * Depuis le mandat "Supprimer le breadcrumb du bloc tenant" (2026-09-16), ce
 * composant n'affiche plus que le tenant courant, quelle que soit la route —
 * le fil de navigation qui y était fusionné a été retiré.
 */
async function renderTenantBreadcrumbAs(currentUser: { id: string; name: string; email: string; tenantId: string; roleIds: string[]; scope: 'tenant' | 'platform' }, route = '/') {
  vi.resetModules();
  vi.doMock('@/mocks/rbac.mocks', async () => {
    const actual = await vi.importActual<typeof import('@/mocks/rbac.mocks')>('@/mocks/rbac.mocks');
    const role = actual.systemRoles.find((item) => item.id === currentUser.roleIds[0]);
    return { ...actual, currentUser: { ...currentUser, permissions: role?.permissions ?? [] } };
  });
  const { renderWithProviders } = await import('@/test/render-with-providers');
  const { TenantBreadcrumb } = await import('@/layouts/tenant-breadcrumb');
  return renderWithProviders(<Routes><Route path="/*" element={<TenantBreadcrumb />} /></Routes>, { route });
}

describe('TenantBreadcrumb — tenant courant uniquement (mono-tenant, sans sélection, sans fil de navigation)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('tenant-scoped user (T-002) : étiquette statique seulement — pas de dropdown, recherche, ni ajout de tenant', async () => {
    await renderTenantBreadcrumbAs({ id: 'U-004', name: 'Mamadou Sow', email: 'mamadou.sow@horizon.sn', tenantId: 'T-002', roleIds: ['role-manager'], scope: 'tenant' });

    expect(screen.getByText('Tontine Horizon')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Coopérative Sutura')).not.toBeInTheDocument();
    expect(screen.queryByText('Mutuelle Teranga')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/[Rr]echercher/)).not.toBeInTheDocument();
  });

  it('platform-scoped user (T-001) : ne voit que son propre tenant, même contrainte', async () => {
    await renderTenantBreadcrumbAs({ id: 'U-001', name: 'Amadou Mbaye', email: 'amadou.mbaye@sutura.sn', tenantId: 'T-001', roleIds: ['role-admin'], scope: 'platform' });

    expect(screen.getByText('Coopérative Sutura')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Tontine Horizon')).not.toBeInTheDocument();
    expect(screen.queryByText('Mutuelle Teranga')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/[Rr]echercher/)).not.toBeInTheDocument();
    expect(screen.queryByText(/[Aa]jouter un tenant/)).not.toBeInTheDocument();
  });

  it("n'affiche aucun chemin de navigation, quelle que soit la route affichée", async () => {
    await renderTenantBreadcrumbAs({ id: 'U-001', name: 'Amadou Mbaye', email: 'amadou.mbaye@sutura.sn', tenantId: 'T-001', roleIds: ['role-admin'], scope: 'platform' }, '/finance/accounts');

    expect(await screen.findByText('Coopérative Sutura')).toBeInTheDocument();
    expect(screen.queryByText(/Finances/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Comptes/)).not.toBeInTheDocument();
  });
});

/**
 * Mandat "Améliorer l'affichage des noms de tenants longs" (2026-09-16) : la
 * troncature est désormais purement visuelle (CSS `max-w-[min(30rem,42vw)]` +
 * `truncate`), jamais une coupe du texte en JS — le nom complet doit donc
 * TOUJOURS être présent dans le DOM, y compris pour un nom extrêmement long,
 * avec le `title` natif comme filet de sécurité pour le consulter au survol
 * quand l'espace visuel ne suffit pas à tout afficher.
 */
describe('TenantBreadcrumb — noms de tenants longs (troncature CSS uniquement, jamais de perte de texte)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function renderTenantBreadcrumbWithTenantName(name: string) {
    vi.resetModules();
    vi.doMock('@/mocks/organization/tenants', async () => {
      const actual = await vi.importActual<typeof import('@/mocks/organization/tenants')>('@/mocks/organization/tenants');
      return { ...actual, tenants: actual.tenants.map((tenant) => (tenant.id === 'T-001' ? { ...tenant, name } : tenant)) };
    });
    const { renderWithProviders } = await import('@/test/render-with-providers');
    const { TenantBreadcrumb } = await import('@/layouts/tenant-breadcrumb');
    return renderWithProviders(<TenantBreadcrumb />);
  }

  it('nom court : affiché tel quel, sans title nécessaire à la lisibilité', async () => {
    await renderTenantBreadcrumbWithTenantName('Association Espoir');

    const name = await screen.findByText('Association Espoir');
    expect(name).toBeInTheDocument();
  });

  it("nom très long (> 100 caractères) : le texte complet reste présent dans le DOM et accessible via `title`", async () => {
    const longName = 'Association Internationale des Membres pour le Développement Économique, Social, Culturel et Communautaire';
    expect(longName.length).toBeGreaterThan(100);

    await renderTenantBreadcrumbWithTenantName(longName);

    const name = await screen.findByText(longName);
    expect(name).toBeInTheDocument();
    expect(name).toHaveAttribute('title', longName);
    // Le bloc ne doit jamais avoir explosé en largeur fixe : la troncature reste au CSS (max-w + truncate), pas un `.slice()` du texte.
    expect(name.textContent).toBe(longName);
  });

  it("le bloc tenant reste compact (pas de flex-1/flex-grow) même avec un nom long", async () => {
    await renderTenantBreadcrumbWithTenantName('Coopérative Internationale de Développement et de Solidarité');

    const tenantBlock = await screen.findByTestId('tenant-current');
    expect(tenantBlock.className).not.toMatch(/\bflex-1\b|\bgrow\b/);
    expect(tenantBlock.className).toMatch(/max-w-\[/);
  });
});
