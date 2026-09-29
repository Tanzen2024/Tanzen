import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';

/**
 * Règle d'audit « Date transaction » : `transaction_at` (`Transaction.recordedAt`)
 * est générée par le système au moment de l'enregistrement effectif. Elle n'est
 * jamais saisie, ni même affichée, dans le formulaire de création. La seule date métier saisissable au
 * formulaire est celle de la séance (`sessionId` → `FiscalSession.date`).
 *
 * Fichier dédié (pas de soumission de formulaire) : n'écrit rien dans le journal
 * `transactions` partagé, donc ne pollue aucun autre test.
 */
describe('Finance → Transactions — « Date de transaction » système (mandat « Trésorerie »)', () => {
  it('le formulaire de création n’affiche AUCUN champ date/heure : l’horodatage est posé par le service à l’insertion', async () => {
    renderWithProviders(
      <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
      { route: '/finance/transactions/create' },
    );
    // La séance (seule date métier) reste visible, héritée du contexte, en lecture seule.
    const session = await screen.findByLabelText('Date de séance') as HTMLInputElement;
    expect(session).toBeDisabled();
    expect(screen.queryByLabelText('Date et heure de la transaction')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Date transaction')).not.toBeInTheDocument();
    expect(document.querySelector('#tx-transaction-at')).toBeNull();
  });
});
