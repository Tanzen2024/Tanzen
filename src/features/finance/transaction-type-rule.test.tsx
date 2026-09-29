import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';
import { transactions } from '@/mocks/finance/transactions';

/**
 * TYPE DES TRANSACTIONS — comportement des DEUX formulaires (mandat 2026-09-25) :
 * à chaque changement d'opération le type est recalculé ; il est affiché figé
 * (non modifiable) sauf pour « Autres » libre. Aucune ancienne valeur incompatible
 * ne survit dans l'état du formulaire.
 */
const SEED = structuredClone(transactions);
beforeEach(() => { transactions.splice(0, transactions.length, ...structuredClone(SEED)); });
afterEach(() => { transactions.splice(0, transactions.length, ...structuredClone(SEED)); });

type User = ReturnType<typeof userEvent.setup>;
const typeField = () => screen.getByLabelText(/^Type/) as HTMLSelectElement;
const expectType = (value: 'credit' | 'debit', locked: boolean) => {
  expect(typeField()).toHaveValue(value);
  if (locked) expect(typeField()).toBeDisabled(); else expect(typeField()).toBeEnabled();
};

/** Choisit une opération dans le formulaire (« AUTRES » = Autres libre : sous-catégorie Frais en saisie détaillée, AUTRE implicite en saisie rapide). */
type SelectOperation = (operation: string) => Promise<void>;

/** Saisie détaillée : mêmes 4 catégories que la saisie rapide, sans sous-catégorie (mandat 2026-09-27). */
const detailedOperation = (user: User): SelectOperation => async (operation) => {
  await user.selectOptions(screen.getByLabelText(/^Action \*/), operation);
};

/** Saisie rapide : l'utilisateur choisit une des 4 CATÉGORIES de saisie (ex-« Opération »). */
const quickOperation = (user: User): SelectOperation => async (operation) => {
  await user.selectOptions(screen.getByLabelText(/^Action \*/), operation);
};

/** Catégories à type imposé proposées par les deux formulaires (mandat « Catégories de transactions », 2026-09-27). */
const FORCED = [['PRET', 'debit'], ['REMBOURSEMENT', 'credit'], ['EPARGNE', 'credit']] as const;

/** Même scénario pour les deux formulaires : Autres + Débit → chaque opération à type imposé → retour à Autres libre. */
async function runDynamicScenario(user: User, selectOperation: SelectOperation, expected: ReadonlyArray<readonly [string, 'debit' | 'credit']>) {
  for (const [operation, type] of expected) {
    await selectOperation('AUTRES');
    await user.selectOptions(typeField(), 'debit');
    expectType('debit', false);
    // Type recalculé et figé — jamais l'ancien Débit quand l'opération impose le Crédit.
    await selectOperation(operation);
    expectType(type, true);
  }
  // Retour à « Autres » libre : le type redevient sélectionnable.
  await selectOperation('AUTRES');
  expect(typeField()).toBeEnabled();
}

describe('Type des transactions — saisie détaillée', { timeout: 30_000 }, () => {
  it('changements dynamiques d’opération : type recalculé, figé sauf pour « Autres » libre', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route: '/finance/transactions/create' });
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-004"]')).not.toBeNull());
    await runDynamicScenario(user, detailedOperation(user), FORCED);
  });

  it('enregistre « Épargner » en Crédit même après un Débit choisi sur « Autres » (état non conservé)', async () => {
    const user = userEvent.setup();
    const before = transactions.length;
    renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route: '/finance/transactions/create' });
    await waitFor(() => expect(document.querySelector('option[value="CS-001-CX-004"]')).not.toBeNull());
    await user.selectOptions(screen.getByLabelText(/^Caisse/), 'CS-001-CX-004');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'AUTRES');
    await user.selectOptions(typeField(), 'debit');
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'EPARGNE');
    await user.type(screen.getByLabelText('Montant *'), '5000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(transactions.length).toBe(before + 1));
    expect(transactions[before]).toMatchObject({ category: 'EPARGNE', type: 'credit', amount: 5_000 });
  });
});

describe('Type des transactions — saisie rapide', { timeout: 30_000 }, () => {
  async function open() {
    renderWithProviders(<Routes><Route path="/finance/*" element={<FinanceModule />} /></Routes>, { route: '/finance/transactions/quick-entry?cashboxId=AC-012' });
    await screen.findByRole('heading', { name: 'Transactions' });
    await waitFor(() => expect((screen.getByLabelText(/^Caisse/) as HTMLSelectElement).value).toBe('CS-001-CX-004'));
  }

  it('changements dynamiques d’opération : type recalculé, figé sauf pour « Autres » libre', async () => {
    const user = userEvent.setup();
    await open();
    await runDynamicScenario(user, quickOperation(user), FORCED);
  });

  it('« Autres » libre : Crédit et Débit tous deux acceptés à l’enregistrement', async () => {
    const user = userEvent.setup();
    const before = transactions.length;
    await open();
    await user.selectOptions(screen.getByLabelText(/^Action \*/), 'AUTRES');
    await user.selectOptions(typeField(), 'debit');
    await user.type(screen.getByLabelText('Montant de la ligne 1'), '7000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer 1 transaction' }));
    await screen.findByRole('heading', { name: 'Transport' });
    expect(transactions[before]).toMatchObject({ category: 'AUTRES', subcategory: 'AUTRE', type: 'debit', amount: 7_000 });
  });
});
