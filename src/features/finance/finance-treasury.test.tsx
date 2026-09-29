import { describe, it, expect } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test/render-with-providers';
import { FinanceModule } from './finance-module';

/**
 * Mandat « Relevés de comptes » (2026-09-27) : Finance → Relevés de comptes = deux onglets
 * FRÈRES portés par l'URL (`/finance/treasury/cashboxes|transactions`) — lien
 * direct, refresh et précédent/suivant conservent l'onglet ; les anciennes
 * URLs sont redirigées, jamais une seconde implémentation.
 */
function Location() { const location = useLocation(); return <span data-testid="location">{`${location.pathname}${location.search}`}</span>; }
function renderFinance(route: string) {
  return renderWithProviders(<Routes><Route path="/finance/*" element={<><FinanceModule /><Location /></>} /></Routes>, { route });
}
const location = () => screen.getByTestId('location').textContent;

describe('Finance → Relevés de comptes — onglets Caisses / Transactions portés par l’URL', () => {
  it('lien direct vers Caisses : fil d’Ariane Finances › Relevés de comptes › Caisses, onglet Caisses actif, liste des caisses', async () => {
    renderFinance('/finance/treasury/cashboxes');
    const trail = await screen.findByRole('navigation', { name: /breadcrumb/i });
    expect(within(trail).getByText('Finances')).toBeInTheDocument();
    expect(within(trail).getByText('Relevés de comptes')).toBeInTheDocument();
    expect(within(trail).getByText('Caisses')).toBeInTheDocument();
    expect(within(trail).queryByText('Comptes')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Caisses' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('cashbox-home-kpis')).toBeInTheDocument();
  });

  it('lien direct vers Transactions : titre « Transactions », onglet actif, action « Nouvelle transaction »', async () => {
    renderFinance('/finance/treasury/transactions');
    expect(await screen.findByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Transactions' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('transactions-context-header')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Saisie rapide/ })).not.toBeInTheDocument();
  });

  it('onglet Transactions : colonne « Report dette » entre Débit et Crédit, « — » faute de donnée persistée', async () => {
    renderFinance('/finance/treasury/transactions');
    await screen.findByTestId('transactions-context-header');
    const headers = (await screen.findAllByRole('columnheader')).map((header) => header.textContent?.trim());
    const debit = headers.indexOf('Débit');
    expect(headers.slice(debit, debit + 4)).toEqual(['Débit', 'Report dette', 'Crédit', 'Commentaire']);
    const rows = screen.getAllByRole('row').slice(1);
    for (const row of rows) expect(within(row).getAllByRole('cell')[debit + 1]).toHaveTextContent('—');
  });

  it('changer d’onglet change l’URL (historique navigateur), et le ?cashboxId= ne suit pas vers Caisses', async () => {
    renderFinance('/finance/treasury/transactions?cashboxId=AC-012');
    await screen.findByTestId('transactions-context-header');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Caisses' }));
    await waitFor(() => expect(location()).toBe('/finance/treasury/cashboxes'));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Transactions' }));
    await waitFor(() => expect(location()).toBe('/finance/treasury/transactions'));
  });

  it('/finance et /finance/treasury ouvrent Relevés de comptes sur un onglet', async () => {
    renderFinance('/finance');
    await waitFor(() => expect(location()).toMatch(/^\/finance\/treasury\/(cashboxes|transactions)$/));
  });

  it.each([
    ['/finance/cashboxes?tab=cashboxes', '/finance/treasury/cashboxes'],
    ['/finance/cashboxes?tab=transactions&cashboxId=AC-012', '/finance/treasury/transactions?cashboxId=AC-012'],
    ['/finance/transactions', '/finance/treasury/transactions'],
  ])('ancienne URL %s → %s', async (from, to) => {
    renderFinance(from);
    await waitFor(() => expect(location()).toBe(to));
  });
});

describe('Finance → Transactions — colonne et filtre « Actions » = actions de saisie (source unique TRANSACTION_OPERATIONS)', () => {
  const actionOf = (row: HTMLElement, index: number) => (within(row).getAllByRole('cell')[index].textContent ?? '').replace('Annulée', '').trim();
  const dataRows = () => screen.queryAllByRole('row').slice(1).filter((row) => within(row).queryAllByRole('cell').length > 1);
  async function openAllSessions() {
    renderFinance('/finance/treasury/transactions');
    await screen.findByTestId('transactions-context-header');
    fireEvent.change(await screen.findByLabelText('Date de séance'), { target: { value: 'all' } });
  }

  it('propose exactement les 4 actions de la saisie, dans le même ordre, et l’en-tête s’intitule « Actions »', async () => {
    await openAllSessions();
    const options = within(screen.getByRole('combobox', { name: 'Actions' })).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Toutes les actions', 'Épargner', 'Rembourser', 'Emprunter', 'Autres']);
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toContain('Actions');
    expect(headers).not.toContain('Catégories');
  });

  it('la colonne n’affiche que les 4 actions — jamais « Autres · Prêt », « Autres · Cotisation »… (historique et Tontine inclus)', async () => {
    await openAllSessions();
    const col = screen.getAllByRole('columnheader').map((header) => header.textContent).indexOf('Actions');
    await waitFor(() => expect(dataRows().length).toBeGreaterThan(0));
    const labels = new Set(dataRows().map((row) => actionOf(row, col)));
    for (const label of labels) expect(['Épargner', 'Rembourser', 'Emprunter', 'Autres']).toContain(label);
    // Les données de démo contiennent des AUTRES/PRET et AUTRES/REMBOURSEMENT historiques : elles s'affichent en actions.
    expect(labels).toContain('Emprunter');
    expect(labels).toContain('Rembourser');
  });

  it('chaque action retourne ses transactions ; les 4 réunies = « Toutes les actions » (aucune transaction orpheline)', async () => {
    await openAllSessions();
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    const col = headers.indexOf('Actions');
    const count = () => dataRows().length;
    await waitFor(() => expect(count()).toBeGreaterThan(0));
    const total = count();
    const select = screen.getByRole('combobox', { name: 'Actions' });
    const expected: Record<string, string> = { EPARGNE: 'Épargner', REMBOURSEMENT: 'Rembourser', PRET: 'Emprunter', AUTRES: 'Autres' };
    let sum = 0;
    for (const [operation, label] of Object.entries(expected)) {
      fireEvent.change(select, { target: { value: operation } });
      const rows = dataRows();
      for (const row of rows) expect(actionOf(row, col)).toBe(label);
      sum += rows.length;
    }
    expect(sum).toBe(total);
    fireEvent.change(select, { target: { value: 'all' } });
    expect(count()).toBe(total);
  });
});
