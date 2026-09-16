import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { TontinesModule } from './tontines-module';
import { tontines } from '@/mocks/tontines/tontines';
import { settingsService } from '@/services/settings.service';

/**
 * Mandat « devise du montant de cotisation » : le champ « Montant de
 * cotisation » du formulaire de CRÉATION affiche désormais la devise de
 * l'organisation en suffixe accolé au champ (ex. « CFA » pour XOF), à la
 * place de l'ancienne ligne séparée « Devise de l'organisation : XOF —
 * Franc CFA BCEAO ». Aucune sélection manuelle de devise n'existe (et n'a
 * jamais existé) sur ce formulaire — la devise reste entièrement dérivée de
 * Paramètres > Organisation (`settingsService.getOrganizationSettings`).
 */
function renderTontines(route: string) {
  return renderWithProviders(
    <Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>,
    { route },
  );
}

describe('Créer une tontine — devise du montant de cotisation en suffixe du champ', () => {
  // T-001 = XOF par défaut (mocks/settings/organization-settings.ts) — restauré après chaque
  // test qui la modifie, pour ne pas fuiter vers les autres fichiers de test du même tenant.
  afterEach(async () => {
    await settingsService.updateOrganizationSettings('T-001', { timezone: 'Africa/Dakar', currency: 'XOF' });
  });

  it('XOF : « CFA » apparaît accolé au champ, jamais la ligne « Devise de l’organisation » ni le code ISO brut', async () => {
    renderTontines('/tontines/create');
    await screen.findByRole('heading', { level: 1, name: 'Créer une tontine' });

    expect(await screen.findByText('CFA')).toBeInTheDocument();
    expect(screen.queryByText(/Devise de l.organisation/)).not.toBeInTheDocument();
    expect(screen.queryByText('XOF')).not.toBeInTheDocument();
  });

  it('le suffixe de devise est associé au champ montant via aria-describedby (accessibilité)', async () => {
    renderTontines('/tontines/create');
    await screen.findByRole('heading', { level: 1, name: 'Créer une tontine' });
    await screen.findByText('CFA'); // attend la résolution de la devise de l'organisation (requête asynchrone)

    const amountInput = screen.getByLabelText('Montant de cotisation *');
    const describedBy = amountInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('CFA');
  });

  it('aucun select/dropdown de devise n’est présent dans le formulaire de création', async () => {
    renderTontines('/tontines/create');
    await screen.findByRole('heading', { level: 1, name: 'Créer une tontine' });

    expect(screen.queryByLabelText('Devise')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Devise' })).not.toBeInTheDocument();
  });

  it('une devise différente configurée par l’organisation (EUR) est représentée par son propre code en suffixe', async () => {
    await settingsService.updateOrganizationSettings('T-001', { timezone: 'Africa/Dakar', currency: 'EUR' });
    renderTontines('/tontines/create');
    await screen.findByRole('heading', { level: 1, name: 'Créer une tontine' });

    expect(await screen.findByText('EUR')).toBeInTheDocument();
    expect(screen.queryByText(/Devise de l.organisation/)).not.toBeInTheDocument();
    expect(screen.queryByText('CFA')).not.toBeInTheDocument();
  });

  it('le montant saisi est enregistré tel quel, avec la devise de l’organisation (aucune régression métier)', async () => {
    const user = userEvent.setup();
    renderTontines('/tontines/create');
    await screen.findByRole('heading', { level: 1, name: 'Créer une tontine' });

    await user.type(screen.getByLabelText('Nom de la tontine *'), 'Tontine devise suffixe');
    await user.type(screen.getByLabelText('Montant de cotisation *'), '75000');
    await user.selectOptions(screen.getByLabelText('Fréquence *'), 'DAILY');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(tontines.find((item) => item.name === 'Tontine devise suffixe')).toBeTruthy());
    const created = tontines.find((item) => item.name === 'Tontine devise suffixe');
    expect(created?.contributionAmount).toBe(75000);
    expect(created?.currency).toBe('XOF');
  });
});
