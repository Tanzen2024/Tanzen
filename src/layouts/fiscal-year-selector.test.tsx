import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * `permission-context.tsx` lit `currentUser.permissions` à l'import du module
 * `@/mocks/rbac.mocks` — comme `tenant-switcher.test.tsx`, chaque scénario
 * mocke ce module (rôle avec/sans `fiscalYears.manage`) puis importe
 * dynamiquement `FiscalYearSelector` et son arbre de providers, sinon la
 * permission resterait figée sur la première valeur importée.
 */
async function renderSelectorAs(roleIds: string[]) {
  vi.resetModules();
  vi.doMock('@/mocks/rbac.mocks', async () => {
    const actual = await vi.importActual<typeof import('@/mocks/rbac.mocks')>('@/mocks/rbac.mocks');
    const permissions = roleIds.flatMap((roleId) => actual.systemRoles.find((role) => role.id === roleId)?.permissions ?? []);
    return { ...actual, currentUser: { ...actual.currentUser, roleIds, permissions: Array.from(new Set(permissions)) } };
  });
  const { renderWithProviders } = await import('@/test/render-with-providers');
  const { FiscalYearSelector } = await import('./fiscal-year-selector');
  return renderWithProviders(<FiscalYearSelector />);
}

describe('FiscalYearSelector — raccourci "+ Nouvel exercice fiscal"', () => {
  it('un utilisateur avec fiscalYears.manage voit le raccourci en bas du dropdown, séparé des exercices', async () => {
    const user = userEvent.setup();
    await renderSelectorAs(['role-admin']);

    await user.click(await screen.findByRole('button', { name: /Sélecteur d.exercice fiscal/ }));

    expect(screen.getByRole('option', { name: /Exercice 2026/ })).toBeInTheDocument();
    expect(screen.getByText('＋ Nouvel exercice fiscal')).toBeInTheDocument();
  });

  it('un utilisateur sans fiscalYears.manage (lecture seule) ne voit pas le raccourci', async () => {
    const user = userEvent.setup();
    await renderSelectorAs(['role-viewer']);

    await user.click(await screen.findByRole('button', { name: /Sélecteur d.exercice fiscal/ }));

    expect(screen.getByRole('option', { name: /Exercice 2026/ })).toBeInTheDocument();
    expect(screen.queryByText('＋ Nouvel exercice fiscal')).not.toBeInTheDocument();
  });

  it('cliquer sur le raccourci ferme le dropdown et ouvre la modale de création, réutilisant l’assistant existant', async () => {
    const user = userEvent.setup();
    await renderSelectorAs(['role-admin']);

    await user.click(await screen.findByRole('button', { name: /Sélecteur d.exercice fiscal/ }));
    await user.click(screen.getByText('＋ Nouvel exercice fiscal'));

    expect(screen.getByRole('dialog', { name: 'Nouvel exercice fiscal (1/2)' })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Annuler dans la modale la referme sans modifier la sélection affichée dans le sélecteur', async () => {
    const user = userEvent.setup();
    await renderSelectorAs(['role-admin']);

    await user.click(await screen.findByRole('button', { name: /Sélecteur d.exercice fiscal/ }));
    await user.click(screen.getByText('＋ Nouvel exercice fiscal'));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Exercice 2026')).toBeInTheDocument();
  });
});
