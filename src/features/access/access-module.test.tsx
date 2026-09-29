import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render-with-providers';
import { AccessModule } from './access-module';

/**
 * Utilisateurs et MFA : le tenant n'est jamais choisi à l'écran — il vient du
 * contexte courant (T-001, Coopérative Sutura). Aucune colonne ni filtre
 * tenant, et aucune donnée d'un autre tenant (ex. Mamadou Sow, T-002).
 */
const TIMEOUT = 15000;

function headers() {
  return screen.getAllByRole('columnheader').map((th) => th.textContent?.trim().toLowerCase());
}

describe('AccessModule — tenant implicite (contexte courant)', () => {
  it('Utilisateurs : pas de colonne ni de filtre tenant, uniquement les utilisateurs du tenant courant', async () => {
    renderWithProviders(<AccessModule />, { route: '/users' });
    expect(await screen.findByText('Fatou Ndiaye')).toBeInTheDocument();
    expect(screen.queryByText('Mamadou Sow')).not.toBeInTheDocument();
    expect(headers()).not.toContain('tenant');
    expect(screen.queryByRole('combobox', { name: /tenant/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/tous les tenants|all tenants/i)).not.toBeInTheDocument();
    // Statut et rôles toujours affichés.
    expect(headers()).toEqual(expect.arrayContaining([expect.stringMatching(/^(statut|status)$/), expect.stringMatching(/^(rôles|roles)$/)]));
    const row = screen.getByText('Fatou Ndiaye').closest('tr') as HTMLElement;
    expect(within(row).getByText('fatou.ndiaye@sutura.cm')).toBeInTheDocument();

    // La recherche fonctionne toujours.
    await userEvent.type(screen.getByRole('textbox'), 'cheikh');
    expect(screen.queryByText('Fatou Ndiaye')).not.toBeInTheDocument();
    expect(screen.getByText('Cheikh Diop')).toBeInTheDocument();
  }, TIMEOUT);

  it('MFA : pas de colonne tenant, uniquement les données MFA du tenant courant', async () => {
    renderWithProviders(<AccessModule />, { route: '/mfa' });
    expect(await screen.findByText('Fatou Ndiaye')).toBeInTheDocument();
    expect(screen.queryByText('Mamadou Sow')).not.toBeInTheDocument();
    expect(screen.queryByText('Bineta Sy')).not.toBeInTheDocument();
    expect(headers()).not.toContain('tenant');
    expect(screen.queryByRole('combobox', { name: /tenant/i })).not.toBeInTheDocument();
  }, TIMEOUT);
});
