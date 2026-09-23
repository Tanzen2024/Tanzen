import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { transactions } from '@/mocks/finance/transactions';

/**
 * Mandat « Le Compte comme point d'entrée des Transactions » (2026-09-23) :
 * Transactions n'est plus un nœud de menu — le parcours attendu devient
 * Comptes → fiche caisse → « + Nouvelle transaction » (compte pré-sélectionné
 * et verrouillé) → retour sur la fiche caisse (solde/journal à jour), tout en
 * conservant « Toutes les transactions » (vue globale, filtrable) accessible
 * depuis la page Comptes. AC-002 (Épargne, `CS-001-ÉPG`) sert de fixture.
 */
const TRANSACTIONS_SEED = structuredClone(transactions);
function restoreTransactionsSeed() {
  transactions.splice(0, transactions.length, ...structuredClone(TRANSACTIONS_SEED));
}
beforeEach(restoreTransactionsSeed);
afterEach(restoreTransactionsSeed);

function renderFinance(route: string) {
  return renderWithProviders(
    <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
    { route },
  );
}

describe('Finance → Comptes — le compte comme point d\'entrée des transactions', () => {
  it('la page Comptes propose « Toutes les transactions » vers le journal consolidé', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/accounts');
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: /Toutes les transactions/i }));
    expect(await screen.findByRole('button', { name: /Ajouter une transaction/i })).toBeInTheDocument();
  });

  it('la fiche compte propose « Nouvelle transaction », qui pré-sélectionne et verrouille le compte', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/accounts/AC-002');
    await screen.findByRole('heading', { name: 'Épargne' });
    await user.click(screen.getByRole('button', { name: /Nouvelle transaction/i }));

    const accountSelect = await screen.findByLabelText(/Caisse \/ Compte/) as HTMLSelectElement;
    await waitFor(() => expect(accountSelect.value).toBe('CS-001-ÉPG'));
    expect(accountSelect).toBeDisabled();
  });

  it('une transaction créée depuis la fiche compte revient sur cette fiche, avec le solde à jour', async () => {
    const user = userEvent.setup();
    const marker = `Épargne depuis compte ${Date.now()}`;
    renderFinance('/finance/accounts/AC-002');
    await screen.findByRole('heading', { name: 'Épargne' });

    await user.click(screen.getByRole('button', { name: /Nouvelle transaction/i }));
    const accountSelect = await screen.findByLabelText(/Caisse \/ Compte/) as HTMLSelectElement;
    await waitFor(() => expect(accountSelect.value).toBe('CS-001-ÉPG'));
    await user.selectOptions(screen.getByLabelText(/Catégorie/), 'EPARGNE');
    await screen.findByRole('option', { name: 'Fatou Ndiaye' });
    await user.selectOptions(screen.getByLabelText(/Adhérent/), 'Fatou Ndiaye');
    await user.type(screen.getByLabelText('Montant *'), '15000');
    await user.type(screen.getByLabelText(/Commentaire/), marker);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    // Retour sur la fiche caisse (jamais la fiche transaction) et le journal du compte affiche la nouvelle écriture.
    await screen.findByRole('heading', { name: 'Épargne' });
    const table = await screen.findByRole('table');
    expect(await within(table).findByText(marker)).toBeInTheDocument();
  });
});
