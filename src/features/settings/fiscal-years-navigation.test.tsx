import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { SettingsModule } from './settings-module';
import { fiscalYears } from '@/mocks/settings/fiscal-years';

/**
 * Paramètres → Exercices fiscaux : la flèche « > » de chaque ligne ouvre la fiche
 * de CET exercice (route existante `/settings/fiscal-years/:id`, identifiant
 * technique `fiscalYear.id`). Seed T-001 : 2024 et 2025 clôturés, 2026 en cours,
 * 2027 à venir.
 */
function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
function renderSettings(route: string) {
  return renderWithProviders(<><Routes><Route path="/settings/*" element={<SettingsModule />} /></Routes><LocationProbe /></>, { route });
}

describe('Exercices fiscaux — flèche de navigation vers la fiche', { timeout: 20_000 }, () => {
  it.each(['2027', '2026', '2025', '2024'])('la flèche de l’exercice %s ouvre la fiche de CET exercice', async (year) => {
    const user = userEvent.setup();
    const target = fiscalYears.find((item) => item.tenantId === 'T-001' && item.startDate.startsWith(year))!;
    renderSettings('/settings/fiscal-years');
    await user.click(await screen.findByRole('button', { name: `Voir la fiche Exercice ${year}` }));

    expect(screen.getByTestId('location')).toHaveTextContent(`/settings/fiscal-years/${target.id}`);
    expect(await screen.findByRole('heading', { name: `Exercice ${year}` })).toBeInTheDocument();
    expect(screen.getByText(`01/01/${year} → 31/12/${year}`)).toBeInTheDocument();
    // L'identifiant technique sert à la navigation, jamais affiché.
    expect(screen.queryByText(target.id)).not.toBeInTheDocument();
  });

  it('les autres actions de la ligne restent en place et ne déclenchent pas la navigation', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/fiscal-years');
    const arrow = await screen.findByRole('button', { name: 'Voir la fiche Exercice 2026' });
    const row = arrow.closest('tr') as HTMLElement;
    for (const name of ['Fréquence des séances', 'Proroger', 'Clôturer l’exercice']) expect(within(row).getByRole('button', { name })).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Fréquence des séances' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings\/fiscal-years$/);

    // Exercice clôturé : « Demander la réouverture » toujours proposé.
    const closedRow = screen.getByRole('button', { name: 'Voir la fiche Exercice 2025', hidden: true }).closest('tr') as HTMLElement;
    expect(within(closedRow).getByRole('button', { name: 'Demander la réouverture', hidden: true })).toBeInTheDocument();
  });

  it('identifiant inconnu : comportement d’erreur existant de la fiche (page introuvable)', async () => {
    renderSettings('/settings/fiscal-years/FY-INEXISTANT');
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });
});
