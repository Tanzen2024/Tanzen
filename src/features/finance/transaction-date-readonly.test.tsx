import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';

/**
 * Règle d'audit « Date transaction » : `transaction_at` (`Transaction.recordedAt`)
 * est générée par le système au moment de l'enregistrement effectif. Elle n'est
 * jamais saisie ni modifiable dans l'UI. La seule date métier saisissable au
 * formulaire est celle de la réunion (`meetingId` → `meetingDate`).
 *
 * Fichier dédié (pas de soumission de formulaire) : n'écrit rien dans le journal
 * `transactions` partagé, donc ne pollue aucun autre test.
 */
describe('Finance → Transactions — « Date de transaction » système', () => {
  it('le formulaire de création expose la Date de transaction en lecture seule, jamais comme un champ date éditable', async () => {
    renderWithProviders(
      <Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>,
      { route: '/finance/transactions/create' },
    );
    const field = await screen.findByLabelText('Date de transaction') as HTMLInputElement;
    expect(field.type).not.toBe('date');
    expect(field).toHaveAttribute('readonly');
    expect(field).toBeDisabled();
    // la date métier saisissable reste celle de la réunion
    expect(screen.getByLabelText('Date de réunion')).toBeInTheDocument();
  });
});
