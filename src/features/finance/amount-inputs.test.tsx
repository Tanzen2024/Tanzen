import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { TontinesModule } from '@/features/tontines/tontines-module';
import { transactions } from '@/mocks/finance/transactions';

/**
 * FORMATAGE UNIFIÉ DES MONTANTS (mandat du 2026-09-27) : chaque écran de saisie monétaire utilise
 * le même `AmountInput` — format de l'association (T-001 : FCFA, espace pour les milliers,
 * 0 décimale) à l'affichage, nombre propre dans le métier.
 */
const SEED = structuredClone(transactions);
const restore = () => { transactions.splice(0, transactions.length, ...structuredClone(SEED)); };
beforeEach(restore);
afterEach(restore);

/** Espaces (fine insécable U+202F comprise) ramenés à une espace simple. */
const plain = (text: string) => text.replace(/\s/g, ' ');
const valueOf = (element: HTMLElement) => plain((element as HTMLInputElement).value);

const renderFinance = (route: string) => renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route });

describe('Montants — même format sur tous les écrans de saisie (XAF)', { timeout: 30_000 }, () => {
  it('Transaction : « 2000000 » affiché « 2 000 000 », enregistré 2000000 (nombre)', async () => {
    const user = userEvent.setup();
    const before = transactions.length;
    renderFinance('/finance/transactions/create');
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-001"]')).not.toBeNull());
    await user.selectOptions(screen.getByLabelText(/^Caisse/), 'CS-001-CX-001');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'EPARGNE');
    const amount = screen.getByLabelText('Montant *');
    await user.type(amount, '2000000');
    expect(valueOf(amount)).toBe('2 000 000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(transactions.length).toBe(before + 1));
    expect(transactions[before].amount).toBe(2_000_000);
  });

  it('Saisie rapide : montant de ligne « 50000 » affiché « 50 000 »', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/transactions/quick-entry?cashboxId=AC-009');
    const amount = await screen.findByLabelText('Montant de la ligne 1');
    await user.type(amount, '50000');
    expect(valueOf(amount)).toBe('50 000');
  });

  it('Demande de prêt : montant demandé « 3000000 » affiché « 3 000 000 »', async () => {
    const user = userEvent.setup();
    renderFinance('/finance/credit/applications/create');
    const amount = await screen.findByLabelText(/^Montant demandé/);
    await user.type(amount, '3000000');
    expect(valueOf(amount)).toBe('3 000 000');
  });

  it('Tontine : montant de cotisation « 50000 » affiché « 50 000 »', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Routes><Route path="/tontines/*" element={<TontinesModule />} /></Routes>, { route: '/tontines/create' });
    const amount = await screen.findByLabelText(/^Montant de cotisation/);
    await user.type(amount, '50000');
    expect(valueOf(amount)).toBe('50 000');
  });
});
