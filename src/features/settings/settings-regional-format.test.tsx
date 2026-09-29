import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { SettingsModule } from './settings-module';
import { organizationSettingsList } from '@/mocks/settings/organization-settings';
import { navigationTree, flattenNavigation } from '@/config/navigation';

/**
 * Paramètres → Organisation = configuration de l'association, avec la section « Format régional »
 * (mandat du 2026-09-26) ; l'ancienne page Localisation y est fusionnée puis supprimée.
 */
const SEED = structuredClone(organizationSettingsList);
const restore = () => { organizationSettingsList.splice(0, organizationSettingsList.length, ...structuredClone(SEED)); };
beforeEach(restore);
afterEach(restore);

function LocationProbe() { return <div data-testid="location">{useLocation().pathname}</div>; }
function renderSettings(route: string) {
  return renderWithProviders(<><Routes><Route path="/settings/*" element={<SettingsModule />} /></Routes><LocationProbe /></>, { route });
}
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

describe('Paramètres → Organisation — Format régional', () => {
  it('affiche la devise, les séparateurs (espace / virgule par défaut) et un aperçu « 1 234 567,89 FCFA »', async () => {
    renderSettings('/settings/organization');
    const section = await screen.findByTestId('regional-format');
    expect(within(section).getAllByRole('option', { name: /Franc CFA d’Afrique centrale \(XAF\)/ })).toHaveLength(1);
    expect(within(section).getByLabelText('Séparateur de milliers')).toHaveValue('space');
    expect(within(section).getAllByRole('option').map((option) => option.textContent)).toEqual(expect.arrayContaining(['Espace — 1 000 000', 'Virgule — 1,000,000', 'Point — 1.000.000']));
    expect(within(section).getByLabelText('Séparateur décimal')).toHaveValue('comma');
    expect(plain(screen.getByTestId('regional-format-preview').textContent)).toBe('1 234 567,89 FCFA');
    // Les champs de l'ancienne page Localisation sont ici : langue, fuseau, format de date.
    expect(screen.getByLabelText('Format de date')).toHaveValue('DD/MM/YYYY');
    expect(screen.getByRole('button', { name: /Français/ })).toBeInTheDocument();
  });

  it('changer le séparateur met l’aperçu à jour et l’enregistre pour CETTE association seulement ; la valeur reste numérique', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/organization');
    const section = await screen.findByTestId('regional-format');
    await user.selectOptions(within(section).getByLabelText('Séparateur de milliers'), 'period');
    expect(screen.getByTestId('regional-format-preview')).toHaveTextContent('1.234.567,89 FCFA');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await vi.waitFor(() => expect(organizationSettingsList.find((item) => item.tenantId === 'T-001')?.thousandsSeparator).toBe('period'));
    expect(organizationSettingsList.find((item) => item.tenantId === 'T-002')?.thousandsSeparator).toBe('space');
  });

  it('séparateurs identiques : message et enregistrement impossible', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/organization');
    const section = await screen.findByTestId('regional-format');
    await user.selectOptions(within(section).getByLabelText('Séparateur de milliers'), 'comma');
    expect(screen.getByText('Les séparateurs de milliers et de décimales doivent être différents.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });
});

describe('Localisation supprimée', () => {
  it('plus d’entrée de menu ; l’ancienne URL renvoie vers Organisation', async () => {
    expect(flattenNavigation(navigationTree).map((node) => node.path)).not.toContain('/settings/localization');
    renderSettings('/settings/localization');
    expect(await screen.findByTestId('regional-format')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/settings/organization');
  });
});
