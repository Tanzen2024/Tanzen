import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { accounts, resolveAccount } from '@/mocks/finance/accounts';
import { transactions } from '@/mocks/finance/transactions';

/**
 * Mandat « Finalisation Finance/Tontines », Priorité N°1 : le nouveau moteur
 * financier (`balanceAsOf`) doit être atteignable depuis l'interface ET rester
 * cohérent avec l'ancien calcul déjà utilisé par la liste des comptes/fiche
 * caisse (`resolveAccount`) — « un même compte doit afficher le même solde ».
 * Ce test compare directement les deux résultats pour un compte réel du seed
 * (CS-001-TRÉS, tenant T-001 par défaut) à la date du jour.
 */
function renderFinance(route: string) {
  return renderWithProviders(
    <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
    { route },
  );
}

describe('Finance → Position financière (moteur balanceAsOf branché à l’UI)', () => {
  it('le solde affiché pour un compte à la date du jour correspond exactement à resolveAccount()', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/position');
    await screen.findByRole('option', { name: /CS-001-TRÉS/ });
    await user.selectOptions(screen.getByLabelText(/Caisse \/ Compte/), 'AC-001');

    const account = accounts.find((item) => item.id === 'AC-001')!;
    const expectedBalance = resolveAccount(account, transactions).balance;

    const soldeLabel = await screen.findByText('Solde');
    const card = soldeLabel.closest('div') as HTMLElement;
    await waitFor(() => {
      const digitsOnly = card.textContent!.replace(/[^\d]/g, '');
      expect(digitsOnly).toBe(String(expectedBalance));
    });
  });

  it('la position financière d’un adhérent affiche épargne, encours de crédit et position nette', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/position');
    await screen.findByRole('option', { name: 'Fatou Ndiaye' });
    const memberSelects = screen.getAllByLabelText(/Sélectionner un adhérent/);
    await user.selectOptions(memberSelects[memberSelects.length - 1], 'M-001');

    expect(await screen.findByText('Épargne')).toBeInTheDocument();
    expect(await screen.findByText('Position nette estimée (indicative)')).toBeInTheDocument();
  });

  it('reste accessible depuis la page Comptes via le bouton « Position financière »', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/accounts');
    await user.click(await screen.findByRole('button', { name: /Position financière/ }));
    expect(await screen.findByText('Solde à une date')).toBeInTheDocument();
  });
});
