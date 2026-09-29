import { describe, it, expect } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { useTheme, defaultTenantBranding } from '@/contexts/theme-context';
import { SettingsModule } from './settings-module';
import { navigationTree, flattenNavigation } from '@/config/navigation';

/**
 * Paramètres → Identité visuelle fusionnée dans Paramètres → Organisation (2026-09-27) :
 * mêmes champs (nom affiché, logos clair/sombre, couleur principale), même aperçu, même
 * stockage (ThemeContext) ; l'entrée de menu disparaît et l'ancienne URL renvoie vers Organisation.
 */
function Probe() {
  const { branding } = useTheme();
  const navigate = useNavigate();
  return <>
    <div data-testid="location">{useLocation().pathname}</div>
    <div data-testid="stored-branding">{`${branding.tenantName}|${branding.logoLight}|${branding.logoDark}|${branding.primaryColor}`}</div>
    <button type="button" onClick={() => navigate('/settings/notifications')}>go-notifications</button>
    <button type="button" onClick={() => navigate('/settings/organization')}>go-organization</button>
  </>;
}
function renderSettings(route: string) {
  return renderWithProviders(<><Routes><Route path="/settings/*" element={<SettingsModule />} /></Routes><Probe /></>, { route });
}

describe('Paramètres → Organisation — section Identité visuelle', () => {
  it('affiche tous les éléments de l’ancienne page Identité visuelle, à côté des sections existantes', async () => {
    renderSettings('/settings/organization');
    const section = await screen.findByTestId('organization-branding');
    expect(within(section).getByRole('heading', { name: 'Identité visuelle' })).toBeInTheDocument();
    expect(within(section).getByLabelText('Nom affiché')).toHaveValue(defaultTenantBranding.tenantName);
    expect(within(section).getByLabelText('Logo (thème clair)')).toHaveValue(defaultTenantBranding.logoLight);
    expect(within(section).getByLabelText('Logo (thème sombre)')).toHaveValue(defaultTenantBranding.logoDark);
    expect(within(section).getByLabelText('Couleur principale')).toHaveValue(defaultTenantBranding.primaryColor);
    expect(within(section).getByLabelText('Valeur hexadécimale')).toHaveValue(defaultTenantBranding.primaryColor);
    expect(within(section).getAllByText('Aperçu').length).toBeGreaterThan(0);
    // Les sections organisationnelles existantes restent en place.
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByTestId('regional-format')).toBeInTheDocument();
    // UN SEUL couple Annuler / Enregistrer pour toute la page.
    expect(screen.getAllByRole('button', { name: 'Enregistrer' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enregistrer l'identité visuelle/ })).not.toBeInTheDocument();
  });

  it('l’aperçu suit la saisie ; enregistrer persiste dans le ThemeContext et applique la couleur', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/organization');
    const section = await screen.findByTestId('organization-branding');
    const name = within(section).getByLabelText('Nom affiché');
    await user.clear(name);
    await user.type(name, 'Mutuelle Horizon');
    await user.clear(within(section).getByLabelText('Logo (thème clair)'));
    await user.type(within(section).getByLabelText('Logo (thème clair)'), '/logos/light.svg');
    await user.clear(within(section).getByLabelText('Logo (thème sombre)'));
    await user.type(within(section).getByLabelText('Logo (thème sombre)'), '/logos/dark.svg');
    fireEvent.change(within(section).getByLabelText('Couleur principale'), { target: { value: '#aa3300' } });
    expect(within(section).getByLabelText('Valeur hexadécimale')).toHaveValue('#aa3300');
    expect(within(section).getAllByText('Mutuelle Horizon').length).toBeGreaterThan(0);
    // Rien n'est enregistré avant le clic.
    expect(screen.getByTestId('stored-branding')).toHaveTextContent(defaultTenantBranding.tenantName);

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByTestId('stored-branding')).toHaveTextContent('Mutuelle Horizon|/logos/light.svg|/logos/dark.svg|#aa3300');
    expect(document.documentElement.style.getPropertyValue('--tanzen-primary')).toBe('#aa3300');

    // Les valeurs enregistrées sont rechargées en revenant sur la page.
    await user.click(screen.getByRole('button', { name: 'go-notifications' }));
    expect(screen.queryByTestId('organization-branding')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'go-organization' }));
    expect(within(await screen.findByTestId('organization-branding')).getByLabelText('Nom affiché')).toHaveValue('Mutuelle Horizon');
  });

  it('Annuler abandonne les brouillons (identité visuelle ET format régional) sans rien enregistrer', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/organization');
    const section = await screen.findByTestId('organization-branding');
    await user.clear(within(section).getByLabelText('Nom affiché'));
    await user.type(within(section).getByLabelText('Nom affiché'), 'Brouillon');
    await user.selectOptions(within(screen.getByTestId('regional-format')).getByLabelText('Séparateur de milliers'), 'period');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(within(section).getByLabelText('Nom affiché')).toHaveValue(defaultTenantBranding.tenantName);
    expect(within(screen.getByTestId('regional-format')).getByLabelText('Séparateur de milliers')).toHaveValue('space');
    expect(screen.getByTestId('stored-branding')).toHaveTextContent(defaultTenantBranding.tenantName);
  });
});

describe('Identité visuelle — menu et ancienne route', () => {
  it('n’apparaît plus dans la navigation ; les autres entrées Paramètres sont inchangées', () => {
    const settings = navigationTree.find((node) => node.label === 'Settings');
    expect(flattenNavigation(navigationTree).map((node) => node.path)).not.toContain('/settings/branding');
    expect(settings?.children?.map((child) => child.path)).toEqual([
      '/settings/organization', '/settings/fiscal-years', '/settings/loan-rules', '/settings/notifications',
      '/settings/security-policies', '/settings/modules', '/settings/integrations', '/settings/validation-workflows',
    ]);
  });

  it('l’ancienne URL /settings/branding renvoie vers Organisation, section Identité visuelle incluse', async () => {
    renderSettings('/settings/branding');
    expect(await screen.findByTestId('organization-branding')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/settings/organization');
  });

  it('Organisation reste accessible directement et par l’index Paramètres', async () => {
    renderSettings('/settings');
    expect(await screen.findByTestId('organization-branding')).toBeInTheDocument();
    expect(screen.getByTestId('regional-format')).toBeInTheDocument();
  });
});
