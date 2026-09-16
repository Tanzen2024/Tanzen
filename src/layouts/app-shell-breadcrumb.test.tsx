import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

/**
 * Isolé dans son propre fichier (comme `tenant-breadcrumb.test.tsx`) : ce test
 * mocke `@/mocks/rbac.mocks` puis importe dynamiquement tout ce qui en
 * dépend transitivement (`AppShell`, `renderWithProviders`). Mélanger ceci
 * avec des tests à import statique dans le même fichier fait fuiter le mock
 * vers les autres tests dès qu'un retry ré-importe le fichier de test
 * (constaté empiriquement : `AppShell` se mettait à afficher "Tontine
 * Horizon" dans des tests qui n'avaient jamais mocké quoi que ce soit).
 */
async function renderShellAsTenant(tenantId: string, route: string) {
  vi.resetModules();
  vi.doMock('@/mocks/rbac.mocks', async () => {
    const actual = await vi.importActual<typeof import('@/mocks/rbac.mocks')>('@/mocks/rbac.mocks');
    return { ...actual, currentUser: { ...actual.currentUser, tenantId } };
  });
  const { renderWithProviders } = await import('@/test/render-with-providers');
  const { AppShell } = await import('./app-shell');
  return renderWithProviders(<Routes><Route path="/*" element={<AppShell><div /></AppShell>} /></Routes>, { route });
}

describe('AppShell — le bloc tenant reflète dynamiquement le tenant courant (pas une valeur figée)', () => {
  it('affiche le nom du tenant réellement courant, différent selon l’utilisateur', async () => {
    await renderShellAsTenant('T-002', '/finance/accounts');

    expect(await screen.findByText('Tontine Horizon')).toBeInTheDocument();
    expect(screen.queryByText('Coopérative Sutura')).not.toBeInTheDocument();
  });
});
